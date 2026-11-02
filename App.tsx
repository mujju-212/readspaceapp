import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  ActivityIndicator,
  StyleSheet,
  Linking,
  AppState,
  Image,
  Text,
  Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { RootNavigator } from './src/navigation/RootNavigator';
import { Storage } from './src/services/storage';
import { Api } from './src/services/api';
import { sessionBus } from './src/services/sessionBus';
import { ReaderSettings } from './src/types';
import { THEMES } from './src/theme/colors';
import {
  hasAllFilesAccess,
  checkAndPromptStoragePermission,
} from './src/services/folder';

const BRAND_BG = '#2563eb';

/**
 * Branded splash screen displaying the official ReadSpace logo.
 * Matches the native splash screen precisely to prevent any blank screen flashes.
 */
function BrandLoading({ progressText }: { progressText?: string }) {
  return (
    <View style={[styles.loadingContainer, { backgroundColor: BRAND_BG }]}>
      <Image
        source={require('./assets/splash-icon.png')}
        style={styles.splashLogo}
        resizeMode="contain"
      />
      <Text style={styles.splashBrandTitle}>ReadSpace</Text>
      <Text style={styles.splashBrandSub}>Universal Reading Workspace</Text>
      <ActivityIndicator color="#ffffff" size="small" style={{ marginTop: 28 }} />
      {progressText ? <Text style={styles.progressText}>{progressText}</Text> : null}
    </View>
  );
}

export default function App() {
  const [settings, setSettings] = useState<ReaderSettings>({
    theme: 'ice',
    fontSize: 16,
    fontFamily: 'system',
    lineHeight: 1.6,
    contentWidth: 840,
    keepAwake: true,
    backgroundAudio: true,
  });

  const [settingsReady, setSettingsReady] = useState(false);
  const [navReady, setNavReady] = useState(false);
  const [splashVisible, setSplashVisible] = useState(true);
  const permissionCheckedRef = useRef(false);

  useEffect(() => {
    // If inside a popup after OAuth redirect, send message to opener window and close
    if (typeof window !== 'undefined' && window.location && window.location.search) {
      const params = new URLSearchParams(window.location.search);
      const token = params.get('token');
      const drive = params.get('drive') === '1' || params.get('drive_connected') === '1';
      if (token && window.opener && window.opener !== window) {
        try {
          window.opener.postMessage({ type: 'rs_auth_complete', token, drive, driveConnected: drive }, '*');
          setTimeout(() => { window.close(); }, 200);
          return;
        } catch {}
      }
    }

    // Listen for incoming deep link URLs (e.g. readspace://auth?signedin=1&token=...)
    const handleDeepLink = async (eventOrUrl: { url: string } | string | null) => {
      const url = typeof eventOrUrl === 'string' ? eventOrUrl : eventOrUrl?.url;
      if (!url) return;
      try {
        if (
          url.startsWith('com.readspace.app://') ||
          url.startsWith('readspace://') ||
          url.startsWith('exp://') ||
          url.includes('signedin=1') ||
          url.includes('token=')
        ) {
          let query = '';
          if (url.includes('?')) query = url.split('?')[1];
          else if (url.includes('#')) query = url.split('#')[1];

          const params = new URLSearchParams(query);
          const token = params.get('token');
          const drive = params.get('drive') === '1' || params.get('drive_connected') === '1';

          if (token) {
            await Storage.saveSessionToken(token);
            if (drive) {
              await Storage.saveDriveAccount({ connected: true });
            }
            const synced = await Api.syncSession();
            sessionBus.bump();
            if (__DEV__) console.log('[readspace] deep-link sign-in:', synced.user?.email || 'no user');
          }
        }
      } catch (err) {
        console.warn('Error handling deep link:', err);
      }
    };

    void Linking.getInitialURL().then(handleDeepLink);
    const sub = Linking.addEventListener('url', handleDeepLink);

    // When returning from system settings or browser, sync session and check permission
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void Api.syncSession().then(() => sessionBus.bump());
      }
    });

    const init = async () => {
      try {
        const saved = await Storage.getSettings();
        setSettings(saved);
      } catch (err) {
        console.warn('Failed to load settings from storage', err);
      } finally {
        setSettingsReady(true);
      }
    };
    init();

    return () => {
      sub.remove();
      appStateSub.remove();
    };
  }, []);

  // Ensure logo splash stays visible until both settings and navigation are mounted,
  // with a minimum duration to guarantee no white/blank flash occurs.
  useEffect(() => {
    if (!settingsReady || !navReady) return;

    const timer = setTimeout(() => {
      setSplashVisible(false);

      // Prompt for storage permission on Android startup if not yet granted
      if (Platform.OS === 'android' && !permissionCheckedRef.current) {
        permissionCheckedRef.current = true;
        setTimeout(async () => {
          try {
            const hasAccess = await hasAllFilesAccess();
            if (!hasAccess) {
              await checkAndPromptStoragePermission('startup');
            }
          } catch (err) {
            console.warn('Startup storage permission prompt error:', err);
          }
        }, 500);
      }
    }, 700);

    return () => clearTimeout(timer);
  }, [settingsReady, navReady]);

  const handleUpdateSettings = async (partial: Partial<ReaderSettings>) => {
    const updated = { ...settings, ...partial };
    setSettings(updated);
    await Storage.saveSettings(updated);
  };

  const currentTheme = THEMES[settings.theme] || THEMES.ice;
  const isDark = settings.theme === 'dark';

  const navTheme = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: currentTheme.bg,
    },
  };

  return (
    <SafeAreaProvider>
      <StatusBar
        style={splashVisible ? 'light' : (isDark ? 'light' : 'dark')}
        backgroundColor={splashVisible ? BRAND_BG : currentTheme.bg}
      />
      <NavigationContainer
        theme={navTheme}
        onReady={() => setNavReady(true)}
      >
        <RootNavigator settings={settings} onUpdateSettings={handleUpdateSettings} />
      </NavigationContainer>

      {/* Branded Logo Overlay: perfectly covers transition from native splash to avoid blank screen */}
      {splashVisible && (
        <View style={StyleSheet.absoluteFillObject} pointerEvents="auto">
          <BrandLoading />
        </View>
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  splashLogo: {
    width: 130,
    height: 130,
    marginBottom: 8,
  },
  splashBrandTitle: {
    color: '#ffffff',
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginTop: 6,
  },
  splashBrandSub: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 13,
    fontWeight: '500',
    marginTop: 4,
  },
  progressText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    marginTop: 12,
  },
});
