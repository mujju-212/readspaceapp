import { Platform, Linking } from 'react-native';

export interface AppUpdateInfo {
  isAvailable: boolean;
  currentVersion: string;
  latestVersion?: string;
  releaseName?: string;
  releaseNotes?: string;
  downloadUrl?: string;
  publishedAt?: string;
  error?: string;
}

export const CURRENT_APP_VERSION = '1.0.0';
export const GITHUB_REPO = 'mujju-212/readspaceapp';

export const UpdateService = {
  getCurrentVersion(): string {
    return CURRENT_APP_VERSION;
  },

  async checkForUpdates(): Promise<AppUpdateInfo> {
    try {
      // 1. Check GitHub Releases for the latest APK / package release
      const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
        },
      });

      if (res.status === 404) {
        // No GitHub releases published yet
        return {
          isAvailable: false,
          currentVersion: CURRENT_APP_VERSION,
          latestVersion: CURRENT_APP_VERSION,
        };
      }

      if (res.ok) {
        const data = await res.json();
        const tag = (data.tag_name || '').replace(/^v/, '');
        const isNewer = this.compareVersions(tag, CURRENT_APP_VERSION) > 0;

        // Find APK asset if attached
        const apkAsset = (data.assets || []).find((a: any) =>
          (a.name || '').endsWith('.apk') || (a.name || '').includes('readspace')
        );
        const downloadUrl = apkAsset ? apkAsset.browser_download_url : data.html_url;

        return {
          isAvailable: isNewer,
          currentVersion: CURRENT_APP_VERSION,
          latestVersion: tag || CURRENT_APP_VERSION,
          releaseName: data.name || `Release ${tag}`,
          releaseNotes: data.body || 'No release notes provided.',
          downloadUrl: downloadUrl || `https://github.com/${GITHUB_REPO}/releases`,
          publishedAt: data.published_at,
        };
      }

      return {
        isAvailable: false,
        currentVersion: CURRENT_APP_VERSION,
        latestVersion: CURRENT_APP_VERSION,
      };
    } catch (e: any) {
      return {
        isAvailable: false,
        currentVersion: CURRENT_APP_VERSION,
        error: e.message || 'Unable to check for updates. Check internet connection.',
      };
    }
  },

  compareVersions(v1: string, v2: string): number {
    const parts1 = v1.split('.').map(p => parseInt(p, 10) || 0);
    const parts2 = v2.split('.').map(p => parseInt(p, 10) || 0);
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;
      if (p1 > p2) return 1;
      if (p1 < p2) return -1;
    }
    return 0;
  },

  async openUpdateUrl(url?: string): Promise<void> {
    const target = url || `https://github.com/${GITHUB_REPO}/releases`;
    if (await Linking.canOpenURL(target)) {
      await Linking.openURL(target);
    }
  },
};

