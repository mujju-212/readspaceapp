import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';
import { Api } from './api';
import { Storage } from './storage';
import { MobileDoc, WorkspaceFolder, FolderEntry, DocKind } from '../types';

function sanitizeName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'unnamed';
}

function detectKind(name: string, mime?: string): DocKind {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp', 'ico'].includes(ext) || mime?.startsWith('image/')) return 'image';
  if (ext === 'pdf' || mime?.includes('pdf')) return 'pdf';
  if (ext === 'docx' || mime?.includes('wordprocessingml')) return 'docx';
  if (ext === 'pptx' || mime?.includes('presentationml')) return 'pptx';
  if (['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'].includes(ext) || mime?.startsWith('audio/')) return 'audio';
  if (['mp4', 'webm', 'mov', 'mkv'].includes(ext) || mime?.startsWith('video/')) return 'video';
  if (ext === 'md' || ext === 'markdown') return 'markdown';
  if (ext === 'html' || ext === 'htm' || mime?.includes('html')) return 'html';
  return 'text';
}

export const DriveDownloadService = {
  /**
   * Download a single Google Drive file directly to local device storage.
   */
  async downloadSingleFile(params: {
    fileId: string;
    fileName: string;
    mimeType?: string;
    onProgress?: (percent: number) => void;
  }): Promise<MobileDoc> {
    const { fileId, fileName, mimeType, onProgress } = params;

    const isGoogleDoc = mimeType?.includes('google-apps.document');
    const isGoogleSheet = mimeType?.includes('google-apps.spreadsheet');
    const isGoogleSlide = mimeType?.includes('google-apps.presentation');

    let exportMime: string | undefined;
    let safeName = sanitizeName(fileName);

    if (isGoogleDoc || isGoogleSlide) {
      exportMime = 'application/pdf';
      if (!safeName.toLowerCase().endsWith('.pdf')) safeName += '.pdf';
    } else if (isGoogleSheet) {
      exportMime = 'text/csv';
      if (!safeName.toLowerCase().endsWith('.csv')) safeName += '.csv';
    }

    const serverUrl = await Storage.getServerUrl();
    const token = await Storage.getSessionToken();
    const apiKey = await Storage.getDriveApiKey();

    let downloadUrl = `${serverUrl}/api/drive/files/${encodeURIComponent(fileId)}/content?download=1`;
    if (exportMime) downloadUrl += `&export=${encodeURIComponent(exportMime)}`;
    if (token) downloadUrl += `&token=${encodeURIComponent(token)}`;
    else if (apiKey) downloadUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&key=${encodeURIComponent(apiKey)}`;

    let localUri = '';
    let fileSize = 0;

    if (Platform.OS === 'web') {
      // Browser download: trigger browser save
      const res = await Api.fetchWithBase(`/api/drive/files/${encodeURIComponent(fileId)}/content${exportMime ? `?export=${encodeURIComponent(exportMime)}` : ''}`);
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      const blob = await res.blob();
      fileSize = blob.size;
      localUri = URL.createObjectURL(blob);

      if (typeof document !== 'undefined') {
        const a = document.createElement('a');
        a.href = localUri;
        a.download = safeName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } else {
      // Native iOS & Android: stream directly to local app documents directory
      const downloadsDir = `${FileSystem.documentDirectory}downloads/`;
      const dirInfo = await FileSystem.getInfoAsync(downloadsDir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(downloadsDir, { intermediates: true });
      }

      const destUri = `${downloadsDir}${safeName}`;
      const downloadResumable = FileSystem.createDownloadResumable(
        downloadUrl,
        destUri,
        {},
        (data) => {
          if (data.totalBytesExpectedToWrite > 0 && onProgress) {
            const p = Math.round((data.totalBytesWritten / data.totalBytesExpectedToWrite) * 100);
            onProgress(p);
          }
        }
      );

      const result = await downloadResumable.downloadAsync();
      if (!result || result.status !== 200) {
        throw new Error(`Download failed with status ${result?.status || 'unknown'}`);
      }

      localUri = result.uri;
      const info = await FileSystem.getInfoAsync(localUri);
      fileSize = (info as any).size || 0;
    }

    const kind = detectKind(safeName, mimeType);
    const doc: MobileDoc = {
      id: `local_download_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: safeName,
      uri: localUri,
      size: fileSize,
      mime: mimeType || 'application/octet-stream',
      kind,
      isDrive: false,
      lastOpenedAt: Date.now(),
    };

    await Storage.saveDoc(doc);
    void Storage.addActivity({
      type: 'transfer',
      title: safeName,
      subtitle: `Downloaded from Drive (${Math.round(fileSize / 1024)} KB)`,
      docKind: kind,
      status: 'completed',
      docId: doc.id,
      docUri: doc.uri,
      size: fileSize,
    });

    return doc;
  },

  /**
   * Recursively download an entire Google Drive folder to device local storage
   * and create a complete offline WorkspaceFolder!
   */
  async downloadFolder(params: {
    folderId: string;
    folderName: string;
    onProgress?: (message: string, current: number, total: number) => void;
  }): Promise<WorkspaceFolder> {
    const { folderId, folderName, onProgress } = params;
    const safeFolderName = sanitizeName(folderName);

    onProgress?.('Scanning Google Drive folder…', 0, 1);

    // 1. Recursively discover all files and subfolders
    interface DiscoveredItem {
      id: string;
      name: string;
      mimeType: string;
      relPath: string;
      isFolder: boolean;
      size?: number;
    }

    const allFiles: DiscoveredItem[] = [];
    const queue: Array<{ id: string; rel: string }> = [{ id: folderId, rel: '' }];

    while (queue.length > 0) {
      const current = queue.shift()!;
      try {
        const files = await Api.listDriveFiles(current.id, true);
        for (const item of files) {
          const isDir = item.mimeType === 'application/vnd.google-apps.folder' || item.mimeType?.includes('folder');
          const relPath = current.rel ? `${current.rel}/${item.name}` : item.name;

          if (isDir) {
            queue.push({ id: item.id, rel: relPath });
          } else {
            allFiles.push({
              id: item.id,
              name: item.name,
              mimeType: item.mimeType || 'application/octet-stream',
              relPath,
              isFolder: false,
              size: item.size ? parseInt(item.size, 10) : undefined,
            });
          }
        }
      } catch (err) {
        console.warn('Failed to list subfolder:', current.id, err);
      }
    }

    if (allFiles.length === 0) {
      throw new Error(`The folder "${folderName}" contains no readable files.`);
    }

    onProgress?.(`Found ${allFiles.length} file(s). Preparing local storage…`, 0, allFiles.length);

    const workspaceDir = `${FileSystem.documentDirectory}workspaces/${safeFolderName}/`;
    if (Platform.OS !== 'web') {
      const dirInfo = await FileSystem.getInfoAsync(workspaceDir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(workspaceDir, { intermediates: true });
      }
    }

    const serverUrl = await Storage.getServerUrl();
    const token = await Storage.getSessionToken();
    const apiKey = await Storage.getDriveApiKey();

    const downloadedEntries: FolderEntry[] = [];

    // 2. Download each file
    for (let i = 0; i < allFiles.length; i++) {
      const item = allFiles[i];
      onProgress?.(`Downloading ${item.name} (${i + 1}/${allFiles.length})…`, i + 1, allFiles.length);

      const isGoogleDoc = item.mimeType?.includes('google-apps.document');
      const isGoogleSheet = item.mimeType?.includes('google-apps.spreadsheet');
      const isGoogleSlide = item.mimeType?.includes('google-apps.presentation');

      let exportMime: string | undefined;
      let finalName = item.name;
      if (isGoogleDoc || isGoogleSlide) {
        exportMime = 'application/pdf';
        if (!finalName.toLowerCase().endsWith('.pdf')) finalName += '.pdf';
      } else if (isGoogleSheet) {
        exportMime = 'text/csv';
        if (!finalName.toLowerCase().endsWith('.csv')) finalName += '.csv';
      }

      let downloadUrl = `${serverUrl}/api/drive/files/${encodeURIComponent(item.id)}/content?download=1`;
      if (exportMime) downloadUrl += `&export=${encodeURIComponent(exportMime)}`;
      if (token) downloadUrl += `&token=${encodeURIComponent(token)}`;
      else if (apiKey) downloadUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(item.id)}?alt=media&key=${encodeURIComponent(apiKey)}`;

      let itemLocalUri = '';
      if (Platform.OS === 'web') {
        try {
          const res = await Api.fetchWithBase(`/api/drive/files/${encodeURIComponent(item.id)}/content${exportMime ? `?export=${encodeURIComponent(exportMime)}` : ''}`);
          if (res.ok) {
            const blob = await res.blob();
            itemLocalUri = URL.createObjectURL(blob);
          }
        } catch {}
      } else {
        const destFileUri = `${workspaceDir}${sanitizeName(finalName)}`;
        try {
          const dl = FileSystem.createDownloadResumable(downloadUrl, destFileUri);
          const res = await dl.downloadAsync();
          if (res?.status === 200) {
            itemLocalUri = res.uri;
          }
        } catch (e) {
          console.warn(`Failed downloading ${item.name}:`, e);
        }
      }

      if (itemLocalUri) {
        const kind = detectKind(finalName, item.mimeType);
        downloadedEntries.push({
          name: finalName,
          uri: itemLocalUri,
          isDirectory: false,
          kind,
          size: item.size,
          mimeType: item.mimeType,
        });
      }
    }

    // 3. Create local WorkspaceFolder
    const localWs: WorkspaceFolder = {
      id: `local_ws_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: safeFolderName,
      uri: workspaceDir,
      fileCount: downloadedEntries.length,
      addedAt: Date.now(),
      entries: downloadedEntries,
      isDrive: false,
    };

    await Storage.saveWorkspace(localWs);

    void Storage.addActivity({
      type: 'open_folder',
      title: safeFolderName,
      subtitle: `Downloaded ${downloadedEntries.length} files from Drive for offline reading`,
      status: 'completed',
    });

    return localWs;
  },
};

