import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';
import { DocKind, MobileDoc } from '../types';

export function detectKind(fileName: string, mime?: string): DocKind {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';

  if (ext === 'pdf' || mime?.includes('pdf')) return 'pdf';
  if (
    ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp', 'ico', 'avif', 'heic', 'tiff'].includes(ext) ||
    mime?.startsWith('image/') ||
    mime?.includes('image')
  ) {
    return 'image';
  }
  if (ext === 'docx' || ext === 'doc' || mime?.includes('word')) return 'docx';
  if (ext === 'pptx' || ext === 'ppt' || mime?.includes('presentation')) return 'pptx';
  if (['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'].includes(ext) || mime?.includes('audio')) return 'audio';
  if (['mp4', 'webm', 'ogv', 'mov', 'mkv'].includes(ext) || mime?.includes('video')) return 'video';
  if (['md', 'markdown'].includes(ext)) return 'markdown';
  if (['html', 'htm'].includes(ext) || mime?.includes('html')) return 'html';
  return 'text';
}

export async function pickDocuments(): Promise<MobileDoc[]> {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      copyToCacheDirectory: true,
      multiple: true,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return [];
    }

    const docs: MobileDoc[] = [];

    for (const asset of result.assets) {
      const kind = detectKind(asset.name, asset.mimeType);
      const id = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      let base64Data: string | undefined = undefined;
      try {
        if (Platform.OS === 'web') {
          const fileObj = (asset as any).file;
          if (fileObj) {
            base64Data = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onload = () => {
                const res = reader.result as string;
                resolve(res.includes(',') ? res.split(',')[1] : res);
              };
              reader.onerror = () => resolve(undefined as any);
              reader.readAsDataURL(fileObj);
            });
          } else if (asset.uri) {
            const res = await fetch(asset.uri);
            const blob = await res.blob();
            base64Data = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onload = () => {
                const res = reader.result as string;
                resolve(res.includes(',') ? res.split(',')[1] : res);
              };
              reader.onerror = () => resolve(undefined as any);
              reader.readAsDataURL(blob);
            });
          }
        } else {
          try {
            base64Data = await FileSystem.readAsStringAsync(asset.uri, {
              encoding: FileSystem.EncodingType.Base64,
            });
          } catch (readErr) {
            console.warn('[picker] Failed to read base64 from uri:', asset.uri, readErr);
          }
        }
      } catch {
        /* skip inline cache on read error */
      }

      docs.push({
        id,
        name: asset.name,
        uri: asset.uri,
        mime: asset.mimeType,
        size: asset.size,
        kind,
        lastOpenedAt: Date.now(),
        base64Data,
      });
    }

    return docs;
  } catch (err) {
    console.warn('[picker] Failed to pick document:', err);
    return [];
  }
}
