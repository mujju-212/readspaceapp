import { GDriveKind, MobileDoc, ParsedDriveLink } from '../types';
import { Storage } from './storage';
import { Api } from './api';

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';

/**
 * Extract a Drive ID (+ link-shared resourceKey) from multiple Google Drive link shapes.
 * Mirrors the exact parsing engine in the ReadSpace web app.
 */
export function parseGDriveLink(raw: string): ParsedDriveLink | null {
  const s = raw.trim();
  if (!s) return null;
  const rk = s.match(/[?&]resourcekey=([^&]+)/i)?.[1];
  const resourceKey = rk ? decodeURIComponent(rk) : undefined;
  let m: RegExpMatchArray | null;

  if ((m = s.match(/drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/([a-zA-Z0-9_-]{10,})/))) {
    return { id: m[1], hint: 'folder', resourceKey, originalUrl: s };
  }
  if ((m = s.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]{10,})/))) {
    return { id: m[1], hint: 'file', resourceKey, originalUrl: s };
  }
  if ((m = s.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]{10,})/))) {
    return { id: m[1], hint: 'gdoc', resourceKey, originalUrl: s };
  }
  if ((m = s.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]{10,})/))) {
    return { id: m[1], hint: 'gsheet', resourceKey, originalUrl: s };
  }
  if ((m = s.match(/docs\.google\.com\/presentation\/d\/([a-zA-Z0-9_-]{10,})/))) {
    return { id: m[1], hint: 'gppt', resourceKey, originalUrl: s };
  }
  if ((m = s.match(/[?&]id=([a-zA-Z0-9_-]{20,})/))) {
    return { id: m[1], hint: 'file', resourceKey, originalUrl: s };
  }
  if (/^[a-zA-Z0-9_-]{25,45}$/.test(s)) {
    return { id: s, hint: 'file', resourceKey, originalUrl: s };
  }
  return null;
}

export const KIND_LABELS: Record<GDriveKind, string> = {
  file: 'File',
  folder: 'Folder',
  gdoc: 'Google Doc',
  gsheet: 'Google Sheet',
  gppt: 'Google Slides',
};

/**
 * Fetch public Google-native document (Doc, Sheet, Slides) using public export endpoints.
 * These work without ANY API key when shared with link!
 */
export async function fetchKeylessNativeDoc(parsed: ParsedDriveLink, customTitle?: string): Promise<MobileDoc> {
  const { id, hint } = parsed;
  let exportUrl = '';
  let kind: MobileDoc['kind'] = 'text';
  let mime = 'text/plain';
  let defaultName = `Google Document (${id.slice(0, 8)})`;

  if (hint === 'gdoc') {
    exportUrl = `https://docs.google.com/document/d/${id}/export?format=txt`;
    kind = 'text';
    mime = 'text/plain';
    defaultName = customTitle || `Document (${id.slice(0, 8)}).txt`;
  } else if (hint === 'gsheet') {
    exportUrl = `https://docs.google.com/spreadsheets/d/${id}/export?format=csv`;
    kind = 'text';
    mime = 'text/csv';
    defaultName = customTitle || `Spreadsheet (${id.slice(0, 8)}).csv`;
  } else if (hint === 'gppt') {
    exportUrl = `https://docs.google.com/presentation/d/${id}/export?format=txt`;
    kind = 'text';
    mime = 'text/plain';
    defaultName = customTitle || `Presentation (${id.slice(0, 8)}).txt`;
  } else {
    throw new Error('Keyless export is only supported for Google Docs, Sheets, and Slides.');
  }

  const res = await fetch(exportUrl);
  if (!res.ok) {
    throw new Error(`Google export returned status ${res.status}. Make sure the document is shared as "Anyone with the link can view".`);
  }

  const textContent = await res.text();
  const doc: MobileDoc = {
    id: `gdrive_${id}`,
    name: defaultName,
    uri: exportUrl,
    kind,
    mime,
    size: textContent.length,
    isDrive: true,
    driveFileId: id,
    lastOpenedAt: Date.now(),
    base64Data: textContent, // HybridReader supports raw string or base64
  };

  await Storage.saveDoc(doc);
  return doc;
}

/**
 * Open a Drive file or folder via backend server or direct Drive API
 */
export async function openDriveResource(
  parsed: ParsedDriveLink,
  serverUrl?: string,
  apiKey?: string,
  customTitle?: string
): Promise<{ doc?: MobileDoc; folderFiles?: any[] }> {
  // If it's a native doc (Doc, Sheet, Slides), try keyless export first
  if (['gdoc', 'gsheet', 'gppt'].includes(parsed.hint)) {
    try {
      const doc = await fetchKeylessNativeDoc(parsed, customTitle);
      return { doc };
    } catch (e) {
      console.warn('Keyless export failed, falling back to API proxy', e);
    }
  }

  // Try backend proxy if serverUrl is available
  if (serverUrl) {
    try {
      if (parsed.hint === 'folder') {
        const listRes = await Api.fetchWithBase(`/api/drive/files?parentId=${encodeURIComponent(parsed.id)}${parsed.resourceKey ? `&resourceKey=${encodeURIComponent(parsed.resourceKey)}` : ''}`);
        if (listRes.ok) {
          const data = await listRes.json();
          return { folderFiles: data.files || [] };
        }
      } else {
        const metaRes = await Api.fetchWithBase(`/api/drive/files/${encodeURIComponent(parsed.id)}/meta${parsed.resourceKey ? `?resourceKey=${encodeURIComponent(parsed.resourceKey)}` : ''}`);
        const meta = metaRes.ok ? await metaRes.json() : { name: `File_${parsed.id}` };

        const contentRes = await Api.fetchWithBase(`/api/drive/files/${encodeURIComponent(parsed.id)}/content${parsed.resourceKey ? `?resourceKey=${encodeURIComponent(parsed.resourceKey)}` : ''}`);
        if (contentRes.ok) {
          const contentType = contentRes.headers.get('content-type') || meta.mimeType || 'application/octet-stream';
          const blob = await contentRes.blob();
          const reader = new FileReader();
          const base64Data = await new Promise<string>((resolve) => {
            reader.onloadend = () => {
              const res = reader.result as string;
              resolve(res.includes(',') ? res.split(',')[1] : res);
            };
            reader.readAsDataURL(blob);
          });

          const ext = (meta.name || '').split('.').pop()?.toLowerCase();
          let kind: MobileDoc['kind'] = 'text';
          if (ext === 'pdf' || contentType.includes('pdf')) kind = 'pdf';
          else if (ext === 'docx' || contentType.includes('wordprocessingml')) kind = 'docx';
          else if (ext === 'pptx' || contentType.includes('presentationml')) kind = 'pptx';
          else if (['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'].includes(ext || '') || contentType.startsWith('audio/')) kind = 'audio';
          else if (['mp4', 'webm', 'mov', 'mkv'].includes(ext || '') || contentType.startsWith('video/')) kind = 'video';
          else if (['md', 'markdown'].includes(ext || '')) kind = 'markdown';
          else if (ext === 'csv' || contentType.includes('csv')) kind = 'text';

          const doc: MobileDoc = {
            id: `gdrive_${parsed.id}`,
            name: meta.name || customTitle || `File_${parsed.id}`,
            uri: '',
            mime: contentType,
            kind,
            isDrive: true,
            driveFileId: parsed.id,
            lastOpenedAt: Date.now(),
            base64Data,
          };
          await Storage.saveDoc(doc);
          return { doc };
        }
      }
    } catch (err) {
      console.warn('Backend Drive proxy call failed', err);
    }
  }

  // If user has provided a Google API Key
  const storedKey = apiKey || (await Storage.getDriveApiKey());
  if (storedKey) {
    if (parsed.hint === 'folder') {
      const q = encodeURIComponent(`'${parsed.id}' in parents and trashed = false`);
      const url = `${DRIVE_API_BASE}/files?q=${q}&fields=files(id,name,mimeType,size,modifiedTime)&key=${encodeURIComponent(storedKey)}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        return { folderFiles: data.files || [] };
      }
    } else {
      const metaUrl = `${DRIVE_API_BASE}/files/${parsed.id}?fields=id,name,mimeType,size&key=${encodeURIComponent(storedKey)}`;
      const metaRes = await fetch(metaUrl);
      if (metaRes.ok) {
        const meta = await metaRes.json();
        const downloadUrl = `${DRIVE_API_BASE}/files/${parsed.id}?alt=media&key=${encodeURIComponent(storedKey)}`;
        const contentRes = await fetch(downloadUrl);
        if (contentRes.ok) {
          const blob = await contentRes.blob();
          const reader = new FileReader();
          const base64Data = await new Promise<string>((resolve) => {
            reader.onloadend = () => {
              const res = reader.result as string;
              resolve(res.includes(',') ? res.split(',')[1] : res);
            };
            reader.readAsDataURL(blob);
          });

          const ext = (meta.name || '').split('.').pop()?.toLowerCase();
          let kind: MobileDoc['kind'] = 'text';
          if (ext === 'pdf') kind = 'pdf';
          else if (ext === 'docx') kind = 'docx';
          else if (ext === 'pptx') kind = 'pptx';
          else if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext || '')) kind = 'audio';
          else if (['mp4', 'webm', 'mov'].includes(ext || '')) kind = 'video';
          else if (['md', 'markdown'].includes(ext || '')) kind = 'markdown';

          const doc: MobileDoc = {
            id: `gdrive_${parsed.id}`,
            name: meta.name || customTitle || `File_${parsed.id}`,
            uri: downloadUrl,
            mime: meta.mimeType,
            kind,
            isDrive: true,
            driveFileId: parsed.id,
            lastOpenedAt: Date.now(),
            base64Data,
          };
          await Storage.saveDoc(doc);
          return { doc };
        }
      }
    }
  }

  throw new Error('Could not open file. For binary files or folders, ensure a Google API key is configured or the backend server is reachable.');
}
