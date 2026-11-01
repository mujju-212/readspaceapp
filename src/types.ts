import { ThemeName } from './theme/colors';

export type DocKind = 'pdf' | 'docx' | 'pptx' | 'audio' | 'video' | 'markdown' | 'text' | 'html';
export type GDriveKind = 'file' | 'folder' | 'gdoc' | 'gsheet' | 'gppt';

export interface MobileDoc {
  id: string;
  name: string;
  uri: string;
  mime?: string;
  size?: number;
  kind: DocKind;
  isDrive?: boolean;
  driveFileId?: string;
  lastOpenedAt: number;
  position?: {
    page?: number;
    scroll?: number;
    zoom?: number;
    time?: number;
  };
  base64Data?: string; // Cache for offline viewing
}

export interface Bookmark {
  id: string;
  docId: string;
  title: string;
  page?: number;
  scroll?: number;
  snippet?: string;
  createdAt: number;
}

export interface SavedLink {
  id: string;
  title: string;
  url: string;
  hint: GDriveKind;
  fileId?: string;
  folderId?: string;
  resourceKey?: string;
  collection?: string;
  addedAt: number;
  lastOpenedAt?: number;
  progress?: {
    scroll?: number;
    page?: number;
  };
}

export interface FolderEntry {
  name: string;
  uri: string;
  isDirectory: boolean;
  size?: number;
  mimeType?: string;
  kind?: DocKind;
  children?: FolderEntry[];
  base64Data?: string;
  relativePath?: string;
  workspaceId?: string;
  isDrive?: boolean;
  driveFileId?: string;
}

export interface WorkspaceFolder {
  id: string;
  name: string;
  uri: string;
  addedAt: number;
  fileCount?: number;
  entries?: FolderEntry[];
  isDrive?: boolean;
  driveFolderId?: string;
}

export interface ParsedDriveLink {
  id: string;
  hint: GDriveKind;
  resourceKey?: string;
  originalUrl: string;
}

export interface ReaderSettings {
  theme: ThemeName;
  fontSize: number; // 14 - 28
  lineHeight: number; // 1.4 - 2.0
  fontFamily: 'system' | 'serif' | 'mono';
  contentWidth: number; // percentage or px
  keepAwake: boolean;
  backgroundAudio: boolean;
  zen?: boolean;
}

export interface TransferJob {
  id: string;
  direction: 'upload' | 'download';
  docName: string;
  size?: number;
  progress: number; // 0 - 100
  status: 'pending' | 'running' | 'completed' | 'failed';
  error?: string;
  createdAt: number;
}

export interface DriveAccount {
  connected: boolean;
  email?: string;
  displayName?: string;
  avatarUrl?: string;
}

export interface UserAccount {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  hasPassword?: boolean;
  passkeysCount?: number;
  token?: string;
}

