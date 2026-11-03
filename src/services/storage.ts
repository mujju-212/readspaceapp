import AsyncStorage from '@react-native-async-storage/async-storage';
import { MobileDoc, Bookmark, ReaderSettings, DriveAccount, UserAccount, SavedLink, WorkspaceFolder, AppActivity } from '../types';

const KEYS = {
  DOCS: 'rs_mobile_docs_v1',
  BOOKMARKS: 'rs_mobile_bookmarks_v1',
  ACTIVITIES: 'rs_mobile_activities_v1',
  SETTINGS: 'rs_mobile_settings_v1',
  SERVER_URL: 'rs_mobile_server_url_v1',
  DRIVE_ACCOUNT: 'rs_mobile_drive_account_v1',
  USER_ACCOUNT: 'rs_mobile_user_account_v1',
  SAVED_LINKS: 'rs_mobile_saved_links_v1',
  WORKSPACES: 'rs_mobile_workspaces_v1',
  DRIVE_API_KEY: 'rs_mobile_drive_api_key_v1',
  SESSION_TOKEN: 'rs_mobile_session_token_v1',
};

/**
 * AsyncStorage on Android fails silently above ~2MB per value. If several docs
 * keep their base64 payloads the whole recents list writes can start to throw,
 * which previously killed the activity feed too (it used to be written after
 * the docs). Keep a small per-doc and total budget so the store always fits.
 */
const MAX_PERSISTED_BASE64_CHARS = 300_000; // ~220KB decoded per document
const BASE64_TOTAL_BUDGET_CHARS = 900_000; // newest documents get priority

/**
 * Persist the recent-docs list with a safety chain: 1) write with the
 * base64 budget applied; 2) if Android's per-value limit rejects that, retry
 * with every base64 payload dropped so recents are never silently lost.
 */
async function persistDocsList(docs: MobileDoc[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.DOCS, JSON.stringify(Storage.stripOversized(docs).slice(0, 100)));
  } catch (e) {
    try {
      const light = docs.slice(0, 100).map((d) => (d.base64Data ? { ...d, base64Data: undefined } : d));
      await AsyncStorage.setItem(KEYS.DOCS, JSON.stringify(light));
    } catch {
      console.warn('Could not persist recent docs (storage full):', e);
    }
  }
}

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

let memoryDocsCache: MobileDoc[] | null = null;
let saveDocsDebounceTimer: ReturnType<typeof setTimeout> | null = null;

export const Storage = {
  // Docs
  async getDocs(): Promise<MobileDoc[]> {
    if (memoryDocsCache !== null) return memoryDocsCache;
    try {
      const raw = await AsyncStorage.getItem(KEYS.DOCS);
      memoryDocsCache = raw ? JSON.parse(raw) : [];
      return memoryDocsCache!;
    } catch {
      return [];
    }
  },

  async saveDoc(doc: MobileDoc): Promise<void> {
    // Log the open FIRST so a failed docs write can never swallow the event
    void this.addActivity({
      type: 'open_file',
      title: doc.name,
      subtitle: (doc.kind ? doc.kind.toUpperCase() : 'DOC') + (doc.isDrive ? ' · Google Drive' : ' · Device File'),
      docKind: doc.kind,
      status: 'completed',
      docId: doc.id,
      docUri: doc.uri,
      size: doc.size,
    });

    const docs = await this.getDocs();
    const existingIndex = docs.findIndex((d) => d.id === doc.id || (d.uri && d.uri === doc.uri));
    let next: MobileDoc[];
    if (existingIndex >= 0) {
      const updated = { ...docs[existingIndex], ...doc, lastOpenedAt: Date.now() };
      // Re-opened docs move to the front so "Continue Reading"/"Recent Items"
      // reflect the actual order of use.
      docs.splice(existingIndex, 1);
      next = [updated, ...docs];
    } else {
      next = [doc, ...docs];
    }
    memoryDocsCache = next;
    await persistDocsList(next);
  },

  async removeDoc(id: string): Promise<void> {
    const docs = await this.getDocs();
    const filtered = docs.filter((d) => d.id !== id);
    memoryDocsCache = filtered;
    await AsyncStorage.setItem(KEYS.DOCS, JSON.stringify(filtered));
  },

  async clearAllDocs(): Promise<void> {
    memoryDocsCache = [];
    if (saveDocsDebounceTimer) {
      clearTimeout(saveDocsDebounceTimer);
      saveDocsDebounceTimer = null;
    }
    await AsyncStorage.removeItem(KEYS.DOCS);
  },

  async updatePosition(id: string, position: MobileDoc['position']): Promise<void> {
    const docs = await this.getDocs();
    const docIndex = docs.findIndex((d) => d.id === id);
    if (docIndex >= 0) {
      const doc = docs[docIndex];
      doc.position = { ...doc.position, ...position };
      doc.lastOpenedAt = Date.now();
      // Keep the currently-read document at the top of the recents list
      docs.splice(docIndex, 1);
      docs.unshift(doc);
      memoryDocsCache = docs;

      // Debounce disk persistence to prevent native bridge saturation
      if (saveDocsDebounceTimer) clearTimeout(saveDocsDebounceTimer);
      saveDocsDebounceTimer = setTimeout(() => {
        saveDocsDebounceTimer = null;
        void persistDocsList(docs);
      }, 1500);
    }
  },

  /** Remove base64 payloads too large for AsyncStorage before persisting.
   *  Documents are ordered newest-first, so the budget keeps the most recent
   *  files' content offline-available and drops it from the older ones. */
  stripOversized(docs: MobileDoc[]): MobileDoc[] {
    let budget = BASE64_TOTAL_BUDGET_CHARS;
    return docs.map((d) => {
      if (d.base64Data && d.base64Data.length) {
        if (d.base64Data.length <= MAX_PERSISTED_BASE64_CHARS && d.base64Data.length <= budget) {
          budget -= d.base64Data.length;
          return d;
        }
        const { base64Data, ...rest } = d;
        return { ...rest, base64Data: undefined } as MobileDoc;
      }
      return d;
    });
  },

  // Bookmarks / Saved Files
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
    // Bookmarks are only lightweight references — never persist the whole file
    // content here, otherwise large documents make the AsyncStorage write fail
    // and the saved list silently stays empty.
    const { base64Data, ...lightBookmark } = bookmark;
    const all = await this.getBookmarks();
    const filtered = all.filter((b) => b.id !== bookmark.id && b.docId !== bookmark.docId);
    filtered.unshift(lightBookmark as Bookmark);
    await AsyncStorage.setItem(KEYS.BOOKMARKS, JSON.stringify(filtered.slice(0, 100)));
    await this.addActivity({
      type: 'save_bookmark',
      title: bookmark.title,
      subtitle: bookmark.isDrive ? 'Saved Drive file bookmark' : 'Saved local document bookmark',
      docKind: bookmark.kind,
      status: 'completed',
      docId: bookmark.docId,
      docUri: bookmark.uri,
    });
  },

  async removeBookmark(idOrDocId: string): Promise<void> {
    const all = await this.getBookmarks();
    const filtered = all.filter((b) => b.id !== idOrDocId && b.docId !== idOrDocId);
    await AsyncStorage.setItem(KEYS.BOOKMARKS, JSON.stringify(filtered));
  },

  // Activities (Real, live user actions feed)
  async getActivities(): Promise<AppActivity[]> {
    try {
      const raw = await AsyncStorage.getItem(KEYS.ACTIVITIES);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  async addActivity(
    activity: Partial<Omit<AppActivity, 'id' | 'timestamp'>> & Pick<AppActivity, 'type' | 'title' | 'status'> & { timestamp?: number }
  ): Promise<void> {
    try {
      const all = await this.getActivities();
      const newAct: AppActivity = {
        id: `act_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        timestamp: activity.timestamp || Date.now(),
        ...activity,
      };
      // Keep most recent 80 activities, deduplicating identical consecutive open actions
      if (all.length > 0 && all[0].title === newAct.title && all[0].type === newAct.type && Date.now() - all[0].timestamp < 60000) {
        all[0] = newAct;
      } else {
        all.unshift(newAct);
      }
      await AsyncStorage.setItem(KEYS.ACTIVITIES, JSON.stringify(all.slice(0, 80)));
    } catch {
      // ignore
    }
  },

  async clearActivities(): Promise<void> {
    await AsyncStorage.removeItem(KEYS.ACTIVITIES);
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
    void this.addActivity({
      type: 'save_link',
      title: link.title,
      subtitle: `Saved link · ${link.collection || 'General'} · Google ${link.hint.toUpperCase()}`,
      status: 'completed',
    });
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

  async clearAllWorkspaces(): Promise<void> {
    await AsyncStorage.removeItem(KEYS.WORKSPACES);
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
    const DEFAULT_URL = 'https://readspace-livid.vercel.app';
    try {
      const url = await AsyncStorage.getItem(KEYS.SERVER_URL);
      if (!url || url.includes('localhost') || url.includes('127.0.0.1')) {
        await AsyncStorage.setItem(KEYS.SERVER_URL, DEFAULT_URL);
        return DEFAULT_URL;
      }
      return url;
    } catch {
      return DEFAULT_URL;
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
    await AsyncStorage.removeItem(KEYS.ACTIVITIES);
  },
};

