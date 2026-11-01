import * as FileSystem from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import { Platform } from 'react-native';
import { DocKind, FolderEntry, MobileDoc, WorkspaceFolder } from '../types';
import { Storage } from './storage';
import { Api } from './api';
import { getWorkspaceBlob, saveAllWorkspaceFiles, hasWorkspaceBlobs } from './webIdb';

const { StorageAccessFramework } = FileSystem;

export function getKindFromExt(name: string): DocKind {
  const ext = (name.split('.').pop() || '').toLowerCase();
  switch (ext) {
    case 'pdf': return 'pdf';
    case 'docx': return 'docx';
    case 'pptx': return 'pptx';
    case 'mp3':
    case 'wav':
    case 'ogg':
    case 'm4a':
    case 'aac':
    case 'flac':
      return 'audio';
    case 'mp4':
    case 'webm':
    case 'mov':
    case 'mkv':
      return 'video';
    case 'md':
    case 'markdown':
      return 'markdown';
    case 'html':
    case 'htm':
      return 'html';
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'webp':
    case 'gif':
    case 'svg':
    case 'bmp':
    case 'ico':
      return 'image';
    default:
      return 'text';
  }
}

/**
 * Universal folder picker:
 * - On Web / Browser: uses <input webkitdirectory> to bypass Chrome's "contains system files" restriction!
 * - On Android Native: uses StorageAccessFramework.requestDirectoryPermissionsAsync()
 * - On iOS / Fallback: uses multi-document picker
 */
export async function pickWorkspaceFolder(): Promise<WorkspaceFolder | null> {
  // 1. WEB BROWSER / CHROME / EDGE / SAFARI / FIREFOX
  // Uses webkitdirectory input which NEVER triggers Chrome's "can't open folder with system files" restriction!
  if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof document !== 'undefined') {
    return pickWorkspaceFolderWeb();
  }

  // 2. ANDROID NATIVE STORAGE ACCESS FRAMEWORK (SAF)
  if (Platform.OS === 'android' && StorageAccessFramework) {
    try {
      const permissions = await StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!permissions || !permissions.granted) {
        return null; // user dismissed or denied permission
      }

      const dirUri = permissions.directoryUri;
      let decodedName = 'Folder';
      try {
        const lastPart = dirUri.split('%3A').pop() || dirUri.split('%2F').pop() || '';
        decodedName = decodeURIComponent(lastPart).replace(/_/g, ' ') || 'Local Folder';
      } catch {
        decodedName = 'Local Folder';
      }

      // Read top-level items
      const entries = await scanDirectoryUri(dirUri);
      const ws: WorkspaceFolder = {
        id: `folder_${Date.now()}`,
        name: decodedName,
        uri: dirUri,
        addedAt: Date.now(),
        fileCount: countFiles(entries),
        entries,
      };

      await Storage.saveWorkspace(ws);
      return ws;
    } catch (err: any) {
      console.warn('Android SAF directory error:', err);
      throw new Error(`Failed to access folder on Android: ${err?.message || err}`);
    }
  }

  // 3. IOS / UNIVERSAL FALLBACK: Multiple document picker
  try {
    const res = await DocumentPicker.getDocumentAsync({
      multiple: true,
      copyToCacheDirectory: true,
      type: '*/*',
    });

    if (res.canceled || !res.assets || res.assets.length === 0) {
      return null;
    }

    const entries: FolderEntry[] = res.assets.map((a) => ({
      name: a.name,
      uri: a.uri,
      isDirectory: false,
      size: a.size,
      mimeType: a.mimeType,
      kind: getKindFromExt(a.name),
    }));

    const ws: WorkspaceFolder = {
      id: `folder_${Date.now()}`,
      name: 'Imported Files',
      uri: res.assets[0].uri,
      addedAt: Date.now(),
      fileCount: entries.length,
      entries,
    };

    await Storage.saveWorkspace(ws);
    return ws;
  } catch (err: any) {
    console.warn('Document picker fallback error:', err);
    throw err;
  }
}

// Live in-memory cache of web File objects from directory picking session
const webFileMap = new Map<string, File>();

export function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = reader.result as string;
      resolve(res.includes(',') ? res.split(',')[1] : res);
    };
    reader.onerror = () => reject(new Error('Failed to read file as data URL'));
    reader.readAsDataURL(file);
  });
}

/**
 * Web folder picker using <input webkitdirectory>
 * This cleanly opens any folder (Downloads, Desktop, projects) without the browser blocking system files!
 */
function pickWorkspaceFolderWeb(): Promise<WorkspaceFolder | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.setAttribute('webkitdirectory', '');
    input.setAttribute('directory', '');
    input.setAttribute('multiple', '');
    input.style.position = 'fixed';
    input.style.top = '-9999px';
    input.style.opacity = '0';

    input.onchange = async () => {
      try {
        const files = Array.from(input.files || []);
        input.remove();
        if (files.length === 0) return resolve(null);

        // Derive root folder name
        const firstRel = (files[0] as any).webkitRelativePath || files[0].name;
        const folderName = firstRel.split('/')[0] || 'Local Folder';

        const wsId = `folder_${Date.now()}`;
        // Build hierarchical tree
        const rootEntries: FolderEntry[] = [];
        const dirMap = new Map<string, FolderEntry>();
        const idbFiles: Array<{ relativePath: string; name: string; file: File }> = [];

        for (const file of files) {
          const rawRel = (file as any).webkitRelativePath || file.name;
          const parts = rawRel.split('/').filter(Boolean);
          parts.shift(); // remove root folder name
          const relativePath = parts.join('/') || file.name;

          const kind = getKindFromExt(file.name);
          const url = URL.createObjectURL(file);

          // Store in live memory map for instant, zero-fetch access
          webFileMap.set(relativePath, file);
          webFileMap.set(file.name, file);
          webFileMap.set(url, file);

          idbFiles.push({ relativePath, name: file.name, file });

          if (parts.length === 0) {
            rootEntries.push({
              name: file.name,
              uri: url,
              isDirectory: false,
              size: file.size,
              mimeType: file.type,
              kind,
              relativePath,
              workspaceId: wsId,
            });
            continue;
          }

          let currentPath = '';
          let parentChildren = rootEntries;

          for (let i = 0; i < parts.length - 1; i++) {
            const dirPart = parts[i];
            currentPath = currentPath ? `${currentPath}/${dirPart}` : dirPart;

            let existingDir = dirMap.get(currentPath);
            if (!existingDir) {
              existingDir = {
                name: dirPart,
                uri: currentPath,
                isDirectory: true,
                children: [],
                workspaceId: wsId,
              };
              dirMap.set(currentPath, existingDir);
              parentChildren.push(existingDir);
            }
            parentChildren = existingDir.children!;
          }

          parentChildren.push({
            name: file.name,
            uri: url,
            isDirectory: false,
            size: file.size,
            mimeType: file.type,
            kind,
            relativePath,
            workspaceId: wsId,
          });
        }

        // Persist files into IndexedDB in background so they survive page reload and browser close
        void saveAllWorkspaceFiles(wsId, idbFiles);

        const ws: WorkspaceFolder = {
          id: wsId,
          name: folderName,
          uri: folderName,
          addedAt: Date.now(),
          fileCount: files.length,
          entries: rootEntries,
        };

        await Storage.saveWorkspace(ws);
        resolve(ws);
      } catch (err) {
        console.warn('Error processing web folder files:', err);
        resolve(null);
      }
    };

    input.oncancel = () => {
      input.remove();
      resolve(null);
    };

    document.body.appendChild(input);
    input.click();
  });
}

/**
 * Scan a directory URI safely on Android SAF (recursively loads subfolders and files)
 */
export async function scanDirectoryUri(
  dirUri: string,
  maxDepth = 3,
  currentDepth = 0
): Promise<FolderEntry[]> {
  if (!StorageAccessFramework) return [];
  try {
    const uris = await StorageAccessFramework.readDirectoryAsync(dirUri);
    const results: FolderEntry[] = [];

    for (const itemUri of uris) {
      let decoded = decodeURIComponent(itemUri);
      let name = decoded.split('/').pop() || decoded.split('%2F').pop() || 'Item';
      if (name.includes(':')) {
        name = name.split(':').pop() || name;
      }

      let isDirectory = false;
      let children: FolderEntry[] | undefined = undefined;

      // Detect if it is a directory by attempting readDirectoryAsync
      if (currentDepth < maxDepth) {
        try {
          const subChildren = await scanDirectoryUri(itemUri, maxDepth, currentDepth + 1);
          isDirectory = true;
          children = subChildren;
        } catch {
          isDirectory = false;
        }
      } else {
        // At max depth, test if it's a directory
        try {
          await StorageAccessFramework.readDirectoryAsync(itemUri);
          isDirectory = true;
          children = [];
        } catch {
          isDirectory = false;
        }
      }

      results.push({
        name,
        uri: itemUri,
        isDirectory,
        kind: isDirectory ? undefined : getKindFromExt(name),
        children,
      });
    }

    return results.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });
  } catch (err) {
    console.warn('Failed to scan directory URI:', dirUri, err);
    return [];
  }
}

function countFiles(entries: FolderEntry[]): number {
  let count = 0;
  for (const e of entries) {
    if (e.isDirectory) {
      if (e.children) count += countFiles(e.children);
    } else {
      count++;
    }
  }
  return count;
}

/**
 * Convert Google Drive items into a WorkspaceFolder representation for sidebar tree exploration
 */
export function createDriveWorkspace(folderId: string, folderName: string, items: any[]): WorkspaceFolder {
  const entries: FolderEntry[] = items.map((item) => {
    const isDir = item.mimeType === 'application/vnd.google-apps.folder' || item.mimeType?.includes('folder');
    const ext = (item.name || '').split('.').pop()?.toLowerCase() || '';
    let kind: DocKind | undefined = undefined;
    if (!isDir) {
      if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext) || item.mimeType?.startsWith('image/')) kind = 'image';
      else if (ext === 'pdf' || item.mimeType?.includes('pdf') || item.mimeType?.includes('google-apps.document') || item.mimeType?.includes('google-apps.presentation')) kind = 'pdf';
      else if (ext === 'docx' || item.mimeType?.includes('wordprocessingml')) kind = 'docx';
      else if (ext === 'pptx' || item.mimeType?.includes('presentationml')) kind = 'pptx';
      else if (['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'].includes(ext) || item.mimeType?.startsWith('audio/')) kind = 'audio';
      else if (['mp4', 'webm', 'mov', 'mkv'].includes(ext) || item.mimeType?.startsWith('video/')) kind = 'video';
      else if (ext === 'md' || ext === 'markdown') kind = 'markdown';
      else kind = 'text';
    }

    return {
      name: item.name,
      uri: `gdrive://${item.id}`,
      isDirectory: isDir,
      size: item.size ? Number(item.size) : undefined,
      mimeType: item.mimeType,
      kind,
      driveFileId: item.id,
      isDrive: true,
      workspaceId: `gdrive_ws_${folderId}`,
    };
  });

  return {
    id: `gdrive_ws_${folderId}`,
    name: folderName,
    uri: `gdrive://${folderId}`,
    addedAt: Date.now(),
    fileCount: entries.filter((e) => !e.isDirectory).length,
    entries,
    isDrive: true,
    driveFolderId: folderId,
  };
}

/**
 * Open a file entry from the folder tree and convert it into a readable MobileDoc
 */
export async function openFolderEntry(entry: FolderEntry): Promise<MobileDoc> {
  // If entry belongs to Google Drive, download via Api service
  if (entry.isDrive || entry.driveFileId || entry.uri?.startsWith('gdrive://')) {
    const fileId = entry.driveFileId || entry.uri.replace('gdrive://', '');
    const isGoogleDoc = entry.mimeType?.includes('google-apps.document');
    const isGoogleSheet = entry.mimeType?.includes('google-apps.spreadsheet');
    const isGoogleSlide = entry.mimeType?.includes('google-apps.presentation');

    let exportMime: string | undefined;
    if (isGoogleDoc || isGoogleSlide) exportMime = 'application/pdf';
    else if (isGoogleSheet) exportMime = 'text/csv';

    const res = await Api.downloadDriveFile(fileId, exportMime);
    if (!res.base64) {
      throw new Error(res.error || 'Failed to download Google Drive file');
    }

    const mime = res.mimeType || entry.mimeType || 'application/octet-stream';
    const ext = (entry.name || '').split('.').pop()?.toLowerCase() || '';

    let resolvedKind: MobileDoc['kind'] = 'text';
    if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp', 'ico'].includes(ext) || mime.startsWith('image/')) resolvedKind = 'image';
    else if (ext === 'pdf' || mime.includes('pdf') || isGoogleDoc || isGoogleSlide) resolvedKind = 'pdf';
    else if (ext === 'docx' || mime.includes('wordprocessingml')) resolvedKind = 'docx';
    else if (ext === 'pptx' || mime.includes('presentationml')) resolvedKind = 'pptx';
    else if (['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'].includes(ext) || mime.startsWith('audio/')) resolvedKind = 'audio';
    else if (['mp4', 'webm', 'mov', 'mkv'].includes(ext) || mime.startsWith('video/')) resolvedKind = 'video';
    else if (ext === 'md' || ext === 'markdown') resolvedKind = 'markdown';
    else if (isGoogleSheet || ext === 'csv' || mime.includes('csv')) resolvedKind = 'text';

    const doc: MobileDoc = {
      id: `drive_${fileId}`,
      name: entry.name,
      uri: entry.uri,
      mime,
      kind: resolvedKind,
      isDrive: true,
      driveFileId: fileId,
      lastOpenedAt: Date.now(),
      base64Data: res.base64,
    };

    await Storage.saveDoc(doc);
    return doc;
  }

  const kind = entry.kind || getKindFromExt(entry.name);
  let base64Data: string | undefined = entry.base64Data;
  let activeUri: string = entry.uri;

  try {
    if (Platform.OS === 'web') {
      // 1. Check live in-memory web File cache (bypasses stale blob URL fetch!)
      const cachedFile =
        (entry.relativePath ? webFileMap.get(entry.relativePath) : undefined) ||
        webFileMap.get(entry.name) ||
        webFileMap.get(entry.uri);

      if (cachedFile) {
        // Create fresh live blob URL
        activeUri = URL.createObjectURL(cachedFile);
        if (!base64Data) {
          base64Data = await fileToBase64(cachedFile);
        }
      }

      // 1.5 Check IndexedDB persistent cache (survives page reloads and browser restarts!)
      if (!base64Data && !cachedFile) {
        const idbBlob = await getWorkspaceBlob(entry.workspaceId, entry.relativePath || entry.name);
        if (idbBlob) {
          activeUri = URL.createObjectURL(idbBlob);
          base64Data = await fileToBase64(idbBlob);
          // Restore to memory cache for zero-latency subsequent operations
          if (entry.relativePath) webFileMap.set(entry.relativePath, idbBlob as any);
          webFileMap.set(entry.name, idbBlob as any);
          webFileMap.set(activeUri, idbBlob as any);
        }
      }

      // 2. Check if Storage has this document cached with base64
      if (!base64Data) {
        const savedDocs = await Storage.getDocs();
        const found = savedDocs.find((d) => (d.name === entry.name || d.uri === entry.uri) && !!d.base64Data);
        if (found && found.base64Data) {
          base64Data = found.base64Data;
        }
      }

      // 3. If uri is data URI, extract directly without fetch
      if (!base64Data && activeUri && activeUri.startsWith('data:')) {
        const parts = activeUri.split(',');
        base64Data = parts[1] || parts[0];
      }

      // 4. If uri is blob URI and we still have no base64, attempt safe fetch
      if (!base64Data && activeUri && activeUri.startsWith('blob:')) {
        try {
          const res = await fetch(activeUri);
          if (res.ok) {
            const blob = await res.blob();
            base64Data = await fileToBase64(blob);
          }
        } catch {
          // expired blob, catch silently
        }
      }

      // 5. If we have base64Data and activeUri was missing or dead, create fresh live blob
      if (base64Data && (!activeUri || activeUri.startsWith('blob:'))) {
        try {
          const mime = entry.mimeType || 'application/octet-stream';
          const byteChars = atob(base64Data);
          const byteNums = new Array(byteChars.length);
          for (let i = 0; i < byteChars.length; i++) {
            byteNums[i] = byteChars.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNums);
          const blob = new Blob([byteArray], { type: mime });
          activeUri = URL.createObjectURL(blob);
        } catch {
          // fallback
        }
      }
    } else if (entry.uri.startsWith('content://') && StorageAccessFramework) {
      base64Data = await StorageAccessFramework.readAsStringAsync(entry.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
    } else {
      base64Data = await FileSystem.readAsStringAsync(entry.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
    }
  } catch (e) {
    console.warn('Could not read base64 data for entry:', entry.name, e);
  }

  // If on web and both base64Data and activeUri are completely unreadable
  if (Platform.OS === 'web' && !base64Data && (!activeUri || activeUri.startsWith('blob:'))) {
    const err: any = new Error(
      `File session expired in browser for "${entry.name}". Please tap "Reconnect Folder" to re-grant browser file access.`
    );
    err.code = 'WORKSPACE_SESSION_EXPIRED';
    err.entry = entry;
    throw err;
  }

  const doc: MobileDoc = {
    id: `file_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    name: entry.name,
    uri: activeUri,
    mime: entry.mimeType,
    size: entry.size,
    kind,
    lastOpenedAt: Date.now(),
    base64Data,
  };

  await Storage.saveDoc(doc);
  return doc;
}

/**
 * Recursively find the first readable file entry in a folder hierarchy
 */
export function findFirstFileEntry(entries: FolderEntry[]): FolderEntry | null {
  for (const e of entries) {
    if (!e.isDirectory) {
      if (!e.name.startsWith('.') && e.name !== 'Thumbs.db') {
        return e;
      }
    } else if (e.children && e.children.length > 0) {
      const found = findFirstFileEntry(e.children);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Checks if workspace entries need reconnecting on web (due to page reload before IndexedDB caching)
 */
export async function checkWorkspaceNeedReconnect(ws: WorkspaceFolder | null): Promise<boolean> {
  if (Platform.OS !== 'web' || !ws || !ws.entries || ws.entries.length === 0) {
    return false;
  }
  // Google Drive workspaces fetch dynamically via Google Drive API and never expire browser blobs
  if (ws.isDrive || ws.driveFolderId) {
    return false;
  }
  // If IndexedDB already has blobs for this workspace, no reconnect needed
  if (ws.id && (await hasWorkspaceBlobs(ws.id))) {
    return false;
  }
  // Check if entries have live in-memory files
  for (const entry of ws.entries) {
    if (!entry.isDirectory) {
      if (
        (entry.relativePath && webFileMap.has(entry.relativePath)) ||
        webFileMap.has(entry.name) ||
        webFileMap.has(entry.uri)
      ) {
        return false;
      }
      if (entry.base64Data) {
        return false;
      }
    }
  }
  return true;
}

