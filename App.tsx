import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet, Linking, AppState } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { RootNavigator } from './src/navigation/RootNavigator';
import { Storage } from './src/services/storage';
import { Api } from './src/services/api';
import { sessionBus } from './src/services/sessionBus';
import { ReaderSettings } from './src/types';
import { Text } from 'react-native';
import { THEMES } from './src/theme/colors';

const BRAND_BG = '#2563eb';

/**
 * Branded loading screen shown while settings/session load — replaces the old
 * bare black flash so the app never appears frozen at start-up.
 */
function BrandLoading({ progressText }: { progressText?: string }) {
  return (
    <View style={[styles.loadingContainer, { backgroundColor: BRAND_BG }]}>
      <View style={styles.logoCircle}>
        <View style={styles.pageWrap}>
          <View style={styles.pageBar1} />
          <View style={styles.pageBar2} />
          <View style={styles.pageBar3} />
        </View>
      </View>
      <View style={styles.titleRow}>
        <View style={[styles.titleAccent, { backgroundColor: '#93c5fd' }]} />
        <View style={[styles.titleAccent, { backgroundColor: '#bfdbfe' }]} />
      </View>
      <View style={styles.subtitleRow}>
        <View style={[styles.subtitleBar, { backgroundColor: 'rgba(255,255,255,0.45)' }]} />
        <View style={[styles.subtitleBar, { backgroundColor: 'rgba(255,255,255,0.25)', width: '58%' }]} />
      </View>
      <ActivityIndicator color="#ffffff" size="large" style={{ marginTop: 26 }} />
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
  const [loading, setLoading] = useState(true);

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

    // When returning from the system browser (Google sign-in), screens never
    // re-mount and navigation focus does not re-fire — sync the session and
    // bump the bus so subscribed screens refresh themselves.
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
        setLoading(false);
      }
    };
    init();

    return () => {
      sub.remove();
      appStateSub.remove();
    };
  }, []);

  const handleUpdateSettings = async (partial: Partial<ReaderSettings>) => {
    const updated = { ...settings, ...partial };
    setSettings(updated);
    await Storage.saveSettings(updated);
  };

  const currentTheme = THEMES[settings.theme] || THEMES.ice;
  const isDark = settings.theme === 'dark';

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: BRAND_BG }}>
        <BrandLoading progressText="Preparing your workspace…" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor={currentTheme.bg} />
      <NavigationContainer>
        <RootNavigator settings={settings} onUpdateSettings={handleUpdateSettings} />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}


const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoCircle: {
    width: 88,
    height: 88,
    borderRadius: 24,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  pageWrap: {
    width: 38,
    height: 48,
    borderRadius: 4,
    backgroundColor: '#eff6ff',
    borderWidth: 2,
    borderColor: '#2563eb',
    justifyContent: 'flex-end',
    paddingBottom: 7,
    paddingHorizontal: 6,
  },
  pageBar1: { backgroundColor: '#2563eb', height: 4, borderRadius: 2, width: 24, marginBottom: 5 },
  pageBar2: { backgroundColor: '#93c5fd', height: 4, borderRadius: 2, width: 17, marginBottom: 5 },
  pageBar3: { backgroundColor: '#bfdbfe', height: 4, borderRadius: 2, width: 21 },
  titleRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 22,
  },
  titleAccent: { width: 110, height: 14, borderRadius: 6 },
  subtitleRow: {
    flexDirection: 'column',
    gap: 7,
    marginTop: 10,
    alignItems: 'center',
  },
  subtitleBar: { height: 7, borderRadius: 4, width: '55%' },
  progressText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    marginTop: 12,
  },
});
