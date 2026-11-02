import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet, Linking } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { RootNavigator } from './src/navigation/RootNavigator';
import { Storage } from './src/services/storage';
import { Api } from './src/services/api';
import { ReaderSettings } from './src/types';
import { THEMES } from './src/theme/colors';

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

    // Listen for incoming deep link URLs (e.g. com.readspace.app://auth?signedin=1&token=... or readspace://)
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
            await Api.syncSession();
          }
        }
      } catch (err) {
        console.warn('Error handling deep link:', err);
      }
    };

    void Linking.getInitialURL().then(handleDeepLink);
    const sub = Linking.addEventListener('url', handleDeepLink);

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
      <View style={[styles.loadingContainer, { backgroundColor: currentTheme.bg }]}>
        <ActivityIndicator size="large" color={currentTheme.primary} />
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
});
