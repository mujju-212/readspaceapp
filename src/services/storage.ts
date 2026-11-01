import AsyncStorage from '@react-native-async-storage/async-storage';
import { MobileDoc, Bookmark, ReaderSettings, DriveAccount, UserAccount, SavedLink, WorkspaceFolder } from '../types';

const KEYS = {
  DOCS: 'rs_mobile_docs_v1',
  BOOKMARKS: 'rs_mobile_bookmarks_v1',
  SETTINGS: 'rs_mobile_settings_v1',
  SERVER_URL: 'rs_mobile_server_url_v1',
  DRIVE_ACCOUNT: 'rs_mobile_drive_account_v1',
  USER_ACCOUNT: 'rs_mobile_user_account_v1',
  SAVED_LINKS: 'rs_mobile_saved_links_v1',
  WORKSPACES: 'rs_mobile_workspaces_v1',
  DRIVE_API_KEY: 'rs_mobile_drive_api_key_v1',
  SESSION_TOKEN: 'rs_mobile_session_token_v1',
};

const DEFAULT_SETTINGS: ReaderSettings = {
  theme: 'ice',
  fontSize: 16,
  lineHeight: 1.6,
  fontFamily: 'system',
  contentWidth: 840,
  keepAwake: true,
  backgroundAudio: true,
  zen: false,
};

export const Storage = {
  // Docs
  async getDocs(): Promise<MobileDoc[]> {
    try {
      const raw = await AsyncStorage.getItem(KEYS.DOCS);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  async saveDoc(doc: MobileDoc): Promise<void> {
    const docs = await this.getDocs();
    const existingIndex = docs.findIndex((d) => d.id === doc.id || (d.uri && d.uri === doc.uri));
    if (existingIndex >= 0) {
      docs[existingIndex] = { ...docs[existingIndex], ...doc, lastOpenedAt: Date.now() };
    } else {
      docs.unshift(doc);
    }
    await AsyncStorage.setItem(KEYS.DOCS, JSON.stringify(docs.slice(0, 100)));
  },

  async removeDoc(id: string): Promise<void> {
    const docs = await this.getDocs();
    const filtered = docs.filter((d) => d.id !== id);
    await AsyncStorage.setItem(KEYS.DOCS, JSON.stringify(filtered));
  },

  async updatePosition(id: string, position: MobileDoc['position']): Promise<void> {
    const docs = await this.getDocs();
    const doc = docs.find((d) => d.id === id);
    if (doc) {
      doc.position = { ...doc.position, ...position };
      doc.lastOpenedAt = Date.now();
      await AsyncStorage.setItem(KEYS.DOCS, JSON.stringify(docs));
    }
  },

  // Bookmarks
  async getBookmarks(docId?: string): Promise<Bookmark[]> {
    try {
      const raw = await AsyncStorage.getItem(KEYS.BOOKMARKS);
      const all: Bookmark[] = raw ? JSON.parse(raw) : [];
      return docId ? all.filter((b) => b.docId === docId) : all;
    } catch {
      return [];
    }
  },

  async addBookmark(bookmark: Bookmark): Promise<void> {
    const all = await this.getBookmarks();
    all.unshift(bookmark);
    await AsyncStorage.setItem(KEYS.BOOKMARKS, JSON.stringify(all));
  },

  async removeBookmark(id: string): Promise<void> {
    const all = await this.getBookmarks();
    const filtered = all.filter((b) => b.id !== id);
    await AsyncStorage.setItem(KEYS.BOOKMARKS, JSON.stringify(filtered));
  },

  // Saved Links
  async getSavedLinks(): Promise<SavedLink[]> {
    try {
      const raw = await AsyncStorage.getItem(KEYS.SAVED_LINKS);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  async saveSavedLink(link: SavedLink): Promise<void> {
    const all = await this.getSavedLinks();
    const idx = all.findIndex((l) => l.id === link.id || (l.url && l.url === link.url));
    if (idx >= 0) {
      all[idx] = { ...all[idx], ...link };
    } else {
      all.unshift(link);
    }
    await AsyncStorage.setItem(KEYS.SAVED_LINKS, JSON.stringify(all));
  },

  async removeSavedLink(id: string): Promise<void> {
    const all = await this.getSavedLinks();
    const filtered = all.filter((l) => l.id !== id);
    await AsyncStorage.setItem(KEYS.SAVED_LINKS, JSON.stringify(filtered));
  },

  async updateSavedLinkProgress(id: string, progress: { scroll?: number; page?: number }): Promise<void> {
    const all = await this.getSavedLinks();
    const link = all.find((l) => l.id === id);
    if (link) {
      link.progress = { ...link.progress, ...progress };
      link.lastOpenedAt = Date.now();
      await AsyncStorage.setItem(KEYS.SAVED_LINKS, JSON.stringify(all));
    }
  },

  // Workspace Folders
  async getWorkspaces(): Promise<WorkspaceFolder[]> {
    try {
      const raw = await AsyncStorage.getItem(KEYS.WORKSPACES);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  async saveWorkspace(ws: WorkspaceFolder): Promise<void> {
    const all = await this.getWorkspaces();
    const idx = all.findIndex((w) => w.id === ws.id || (w.uri && w.uri === ws.uri));
    if (idx >= 0) {
      all[idx] = { ...all[idx], ...ws, addedAt: Date.now() };
    } else {
      all.unshift(ws);
    }
    await AsyncStorage.setItem(KEYS.WORKSPACES, JSON.stringify(all.slice(0, 20)));
  },

  async removeWorkspace(id: string): Promise<void> {
    const all = await this.getWorkspaces();
    const filtered = all.filter((w) => w.id !== id);
    await AsyncStorage.setItem(KEYS.WORKSPACES, JSON.stringify(filtered));
  },

  // Google Drive API Key
  async getDriveApiKey(): Promise<string> {
    try {
      const key = await AsyncStorage.getItem(KEYS.DRIVE_API_KEY);
      return key || '';
    } catch {
      return '';
    }
  },

  async setDriveApiKey(key: string): Promise<void> {
    await AsyncStorage.setItem(KEYS.DRIVE_API_KEY, key.trim());
  },

  // Settings
  async getSettings(): Promise<ReaderSettings> {
    try {
      const raw = await AsyncStorage.getItem(KEYS.SETTINGS);
      return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  },

  async saveSettings(settings: Partial<ReaderSettings>): Promise<ReaderSettings> {
    const current = await this.getSettings();
    const next = { ...current, ...settings };
    await AsyncStorage.setItem(KEYS.SETTINGS, JSON.stringify(next));
    return next;
  },

  // Backend Server URL
  async getServerUrl(): Promise<string> {
    try {
      const url = await AsyncStorage.getItem(KEYS.SERVER_URL);
      return url || 'http://localhost:5173';
    } catch {
      return 'http://localhost:5173';
    }
  },

  async setServerUrl(url: string): Promise<void> {
    await AsyncStorage.setItem(KEYS.SERVER_URL, url.trim().replace(/\/$/, ''));
  },

  // Drive Account
  async getDriveAccount(): Promise<DriveAccount> {
    try {
      const raw = await AsyncStorage.getItem(KEYS.DRIVE_ACCOUNT);
      return raw ? JSON.parse(raw) : { connected: false };
    } catch {
      return { connected: false };
    }
  },

  async saveDriveAccount(account: DriveAccount): Promise<void> {
    await AsyncStorage.setItem(KEYS.DRIVE_ACCOUNT, JSON.stringify(account));
  },

  // User Account (Auth)
  async getUserAccount(): Promise<UserAccount | null> {
    try {
      const raw = await AsyncStorage.getItem(KEYS.USER_ACCOUNT);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  async saveUserAccount(user: UserAccount | null): Promise<void> {
    if (user) {
      await AsyncStorage.setItem(KEYS.USER_ACCOUNT, JSON.stringify(user));
    } else {
      await AsyncStorage.removeItem(KEYS.USER_ACCOUNT);
    }
  },

  // Session Token
  async getSessionToken(): Promise<string> {
    try {
      const token = await AsyncStorage.getItem(KEYS.SESSION_TOKEN);
      return token || '';
    } catch {
      return '';
    }
  },

  async saveSessionToken(token: string): Promise<void> {
    await AsyncStorage.setItem(KEYS.SESSION_TOKEN, token);
  },

  async clearSessionToken(): Promise<void> {
    await AsyncStorage.removeItem(KEYS.SESSION_TOKEN);
  },

  // Clear offline cache
  async clearCache(): Promise<void> {
    await AsyncStorage.removeItem(KEYS.DOCS);
    await AsyncStorage.removeItem(KEYS.BOOKMARKS);
    await AsyncStorage.removeItem(KEYS.SAVED_LINKS);
    await AsyncStorage.removeItem(KEYS.WORKSPACES);
  },
};

