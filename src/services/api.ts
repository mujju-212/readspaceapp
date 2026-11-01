import { Platform, Linking } from 'react-native';
import { Storage } from './storage';
import { UserAccount, DriveAccount } from '../types';

const driveListClientCache = new Map<string, { files: any[]; timestamp: number }>();

export const Api = {
  async fetchWithBase(endpoint: string, options: RequestInit = {}): Promise<Response> {
    const [baseUrl, token] = await Promise.all([
      Storage.getServerUrl(),
      Storage.getSessionToken(),
    ]);
    const url = `${baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}`, 'x-session-id': token } : {}),
      ...((options.headers as Record<string, string>) || {}),
    };
    return fetch(url, {
      ...options,
      credentials: 'include',
      headers,
    });
  },

  async checkHealth(): Promise<{ ok: boolean; mode?: string }> {
    try {
      const res = await this.fetchWithBase('/api/config');
      if (res.ok) {
        const data = await res.json();
        return { ok: true, mode: data.mode };
      }
      return { ok: false };
    } catch {
      return { ok: false };
    }
  },

  async me(): Promise<{ user?: any; drive?: any; error?: string }> {
    try {
      const res = await this.fetchWithBase('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        return { user: data.user, drive: data.drive };
      }
      return {};
    } catch (e: any) {
      return { error: e.message };
    }
  },

  async login(email: string, password: string): Promise<{ ok: boolean; user?: any; error?: string }> {
    try {
      const res = await this.fetchWithBase('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (res.ok) {
        return { ok: true, user: data.user };
      }
      return { ok: false, error: data.error || 'Login failed' };
    } catch (e: any) {
      return { ok: false, error: e.message || 'Network error' };
    }
  },

  async register(email: string, password: string, displayName?: string): Promise<{ ok: boolean; user?: any; error?: string }> {
    try {
      const res = await this.fetchWithBase('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password, displayName }),
      });
      const data = await res.json();
      if (res.ok) {
        return { ok: true, user: data.user };
      }
      return { ok: false, error: data.error || 'Registration failed' };
    } catch (e: any) {
      return { ok: false, error: e.message || 'Network error' };
    }
  },

  async logout(): Promise<void> {
    try {
      await this.fetchWithBase('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    await Storage.clearSessionToken();
    await Storage.saveUserAccount(null);
    await Storage.saveDriveAccount({ connected: false });
  },

  async getDriveStatus(): Promise<{ connected: boolean; email?: string; rootName?: string }> {
    try {
      const res = await this.fetchWithBase('/api/drive/status');
      if (res.ok) {
        const data = await res.json();
        const connected = Boolean(data.connected === true || data.drive?.status === 'connected' || data.status === 'connected');
        const driveData = {
          connected,
          email: data.email || data.drive?.email,
          rootName: data.rootName || data.drive?.rootName,
        };
        if (connected) {
          await Storage.saveDriveAccount(driveData);
        }
        return driveData;
      }
      return { connected: false };
    } catch {
      return { connected: false };
    }
  },

  clearDriveCache(): void {
    driveListClientCache.clear();
  },

  async listDriveFiles(folderId = 'root', forceRefresh = false): Promise<any[]> {
    if (!forceRefresh) {
      const cached = driveListClientCache.get(folderId);
      if (cached && Date.now() - cached.timestamp < 45000) {
        return cached.files;
      }
    }
    try {
      const refreshParam = forceRefresh ? '&refresh=1' : '';
      const res = await this.fetchWithBase(`/api/drive/files?parentId=${encodeURIComponent(folderId)}&folderId=${encodeURIComponent(folderId)}${refreshParam}`);
      if (res.ok) {
        const data = await res.json();
        const files = data.files || [];
        driveListClientCache.set(folderId, { files, timestamp: Date.now() });
        return files;
      }
      return [];
    } catch {
      return [];
    }
  },

  async downloadDriveFile(fileId: string, exportMime?: string): Promise<{ base64?: string; mimeType?: string; error?: string; isFolder?: boolean; folderId?: string }> {
    try {
      const qs = exportMime ? `?export=${encodeURIComponent(exportMime)}` : '';
      const res = await this.fetchWithBase(`/api/drive/files/${encodeURIComponent(fileId)}/content${qs}`);
      if (res.ok) {
        const contentType = res.headers.get('content-type') || 'application/octet-stream';
        const blob = await res.blob();
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const result = reader.result as string;
            resolve({ base64: result.split(',')[1], mimeType: contentType });
          };
          reader.onerror = () => resolve({ error: 'Failed to parse blob' });
          reader.readAsDataURL(blob);
        });
      }
      const data = await res.json().catch(() => ({}));
      return {
        error: data.error || `Download failed (${res.status})`,
        isFolder: Boolean(data.isFolder),
        folderId: data.folderId || fileId,
      };
    } catch (e: any) {
      return { error: e.message || 'Network error' };
    }
  },

  async setPassword(newPassword: string, currentPassword?: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await this.fetchWithBase('/api/auth/set-password', {
        method: 'POST',
        body: JSON.stringify({ newPassword, currentPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        return { ok: true };
      }
      return { ok: false, error: data.error || 'Failed to update password' };
    } catch (e: any) {
      return { ok: false, error: e.message || 'Network error' };
    }
  },

  async getPasskeys(): Promise<any[]> {
    try {
      const res = await this.fetchWithBase('/api/auth/passkeys');
      if (res.ok) {
        const data = await res.json();
        return data.passkeys || [];
      }
      return [];
    } catch {
      return [];
    }
  },

  async deletePasskey(id: string): Promise<boolean> {
    try {
      const res = await this.fetchWithBase(`/api/auth/passkeys/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  async disconnectDrive(): Promise<boolean> {
    try {
      const res = await this.fetchWithBase('/api/drive/disconnect', { method: 'POST' });
      await Storage.saveDriveAccount({ connected: false });
      return res.ok;
    } catch {
      return false;
    }
  },

  async syncSession(): Promise<{ user: UserAccount | null; drive: DriveAccount }> {
    try {
      const [res, dStatus] = await Promise.all([
        this.me(),
        this.getDriveStatus(),
      ]);
      let userAccount: UserAccount | null = null;
      let driveAccount: DriveAccount = { connected: false };

      if (res.user) {
        userAccount = {
          id: res.user.id || res.user._id,
          email: res.user.email,
          displayName: res.user.displayName || res.user.email.split('@')[0],
          avatarUrl: res.user.avatarUrl,
          hasPassword: res.user.hasPassword,
        };
        await Storage.saveUserAccount(userAccount);
      }
      const isConnected = Boolean(dStatus.connected || res.drive?.status === 'connected');
      driveAccount = {
        connected: isConnected,
        email: dStatus.email || res.drive?.email,
      };
      await Storage.saveDriveAccount(driveAccount);
      return { user: userAccount, drive: driveAccount };
    } catch {
      return {
        user: await Storage.getUserAccount(),
        drive: await Storage.getDriveAccount(),
      };
    }
  },

  async getGoogleAuthUrl(withDrive = false): Promise<string> {
    const base = await Storage.getServerUrl();
    let returnTo = '';
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      returnTo = window.location.origin;
    } else {
      returnTo = 'com.readspace.app://auth';
    }
    return `${base}/api/auth/google/start?drive=${withDrive ? '1' : '0'}&returnTo=${encodeURIComponent(returnTo)}`;
  },

  async startGoogleAuth(
    withDrive = false,
    onSuccess?: (data: { user: UserAccount | null; drive: DriveAccount }) => void
  ): Promise<void> {
    const url = await this.getGoogleAuthUrl(withDrive);
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const width = 540;
      const height = 660;
      const left = Math.max(0, (window.screen.width - width) / 2);
      const top = Math.max(0, (window.screen.height - height) / 2);
      const popup = window.open(
        url,
        'readspace_google_auth',
        `width=${width},height=${height},top=${top},left=${left},status=no,menubar=no,toolbar=no`
      );

      if (popup) {
        const handler = async (event: MessageEvent) => {
          if (event.data && event.data.type === 'rs_auth_complete') {
            window.removeEventListener('message', handler);
            if (event.data.token) {
              await Storage.saveSessionToken(event.data.token);
            }
            if (event.data.user) {
              await Storage.saveUserAccount(event.data.user);
            }
            if (event.data.drive || event.data.driveConnected) {
              await Storage.saveDriveAccount({
                connected: true,
                email: event.data.user?.email,
              });
            }
            const synced = await this.syncSession();
            if (onSuccess) onSuccess(synced);
          }
        };
        window.addEventListener('message', handler);

        const pollTimer = setInterval(async () => {
          try {
            if (popup.closed) {
              clearInterval(pollTimer);
              window.removeEventListener('message', handler);
              const synced = await this.syncSession();
              if (onSuccess) onSuccess(synced);
            }
          } catch {
            // Ignore cross-origin COOP policy exceptions on popup.closed
          }
        }, 1000);
        return;
      }
      // If popup was blocked by browser, fallback to standard redirect
      window.location.href = url;
    } else {
      await Linking.openURL(url);
    }
  },

  async scanTransfers(
    driveFolderId = 'root',
    manifest: Array<{ relativePath: string; name: string; size?: number }>
  ): Promise<{
    candidates: Array<{
      relativePath: string;
      name: string;
      size?: number;
      classification: 'likely_new' | 'same_candidate' | 'name_collision';
      reason?: string;
      remoteId?: string;
    }>;
    remoteCount: number;
    driveFolderId: string;
  }> {
    const res = await this.fetchWithBase('/api/transfers/scan', {
      method: 'POST',
      body: JSON.stringify({ driveFolderId, manifest }),
    });
    if (res.ok) {
      return await res.json();
    }
    const err = await res.json().catch(() => ({ error: 'Scan failed' }));
    throw new Error(err.error || 'Failed to compare with Google Drive');
  },

  async uploadFileToDrive(
    driveFolderId: string,
    name: string,
    mimeType: string,
    content: Blob | ArrayBuffer | string
  ): Promise<{ file: any }> {
    const baseUrl = await Storage.getServerUrl();
    const query = `parentId=${encodeURIComponent(driveFolderId)}&name=${encodeURIComponent(name)}&mimeType=${encodeURIComponent(mimeType || 'application/octet-stream')}`;
    const url = `${baseUrl}/api/drive/files?${query}`;
    const res = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'content-type': mimeType || 'application/octet-stream',
        'x-requested-with': 'readspace',
      },
      body: content as any,
    });
    if (res.ok) {
      return await res.json();
    }
    const err = await res.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(err.error || 'Failed to upload file to Google Drive');
  },

  async recordTransferJob(jobData: any): Promise<any> {
    try {
      const res = await this.fetchWithBase('/api/transfers', {
        method: 'POST',
        body: JSON.stringify(jobData),
      });
      if (res.ok) return await res.json();
    } catch {
      // ignore
    }
  },
};
