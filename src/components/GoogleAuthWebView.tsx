import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView as RNSafeArea,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { WebView } from 'react-native-webview';
import { Api } from '../services/api';
import { Storage } from '../services/storage';
import { ThemeColors } from '../theme/colors';

interface GoogleAuthWebViewProps {
  visible: boolean;
  /** false = plain Google sign in; true = also authorize Google Drive */
  withDrive: boolean;
  theme: ThemeColors;
  onClose: () => void;
  onAuthenticated: (data: { token?: string; driveConnected: boolean }) => void | Promise<void>;
}

/**
 * Deep-link-ish URLs the OAuth handoff finally lands on. We intercept them
 * inside the WebView and finish the session ourselves so the user never gets
 * bounced out to the system browser and stuck on an unhandled redirect.
 *
 * Possible final targets produced by the server bridge page:
 *   readspace://auth?signedin=1&token=...&drive=1
 *   com.readspace.app://auth?...
 *   intent://auth?...#Intent;scheme=readspace;package=com.readspace.app;end
 */
function extractAuthToken(url: string): { token?: string; driveConnected: boolean } | null {
  const lowered = url.toLowerCase();
  const isAuthTarget =
    lowered.startsWith('readspace://') ||
    lowered.startsWith('com.readspace.app://') ||
    lowered.startsWith('intent://');

  if (!isAuthTarget) return null;

  let query = url;
  if (query.includes('?')) query = query.slice(query.indexOf('?') + 1);
  else if (query.includes('signedin=1') || query.includes('token=')) query = '';
  if (query.includes('#')) query = query.slice(0, query.indexOf('#'));

  const params = new URLSearchParams(query);
  const token = params.get('token') || '';
  const driveConnected = params.get('drive') === '1' || params.get('drive_connected') === '1';

  if (!token) return null;
  return { token, driveConnected };
}

export const GoogleAuthWebView: React.FC<GoogleAuthWebViewProps> = ({
  visible,
  withDrive,
  theme,
  onClose,
  onAuthenticated,
}) => {
  const [serverUrl, setServerUrl] = useState('');
  const [ready, setReady] = useState(false);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    if (visible) {
      setReady(false);
      setFinished(false);
      setLoadingPage(true);
      Storage.getServerUrl().then((url) => setServerUrl(url));
    }
  }, [visible, withDrive]);

  const [loadingPage, setLoadingPage] = useState(true);

  const finishAuth = async (target: { token?: string; driveConnected: boolean } | null) => {
    if (finished) return;
    if (!target || !target.token) return;
    setFinished(true);
    try {
      await Storage.saveSessionToken(target.token);
      if (target.driveConnected) {
        await Storage.saveDriveAccount({ connected: true });
      }
      await onAuthenticated(target);
    } catch (e) {
      console.warn('GoogleAuthWebView finish error:', e);
    }
  };

  const intercept = (url: string) => {
    const target = extractAuthToken(url);
    if (target) {
      void finishAuth(target);
      return false;
    }
    return true;
  };

  if (!visible) return null;

  const authUrl = `${serverUrl}/api/auth/google/start?drive=${withDrive ? '1' : '0'}&returnTo=${encodeURIComponent(
    'readspace://auth'
  )}`;

  return (
    <Modal visible={visible} transparent={false} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView edges={['top', 'left', 'right']} style={[styles.safeArea, { backgroundColor: theme.panel }]}>
        {/* Header bar */}
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <View style={styles.headerTitleRow}>
            <View style={[styles.gBadge, { backgroundColor: theme.accent }]}>
              <Text style={styles.gBadgeText}>G</Text>
            </View>
            <Text style={[styles.headerTitle, { color: theme.fg }]}>
              {withDrive ? 'Connect Google Drive' : 'Sign in with Google'}
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <X size={20} color={theme.fg} />
          </TouchableOpacity>
        </View>

        {ready && loadingPage ? (
          <View style={styles.loadingPane}>
            <ActivityIndicator size="large" color={theme.accent} />
            <Text style={[styles.loadingText, { color: theme.muted }]}>Opening Google sign-in…</Text>
          </View>
        ) : null}

        {/* The sign-in is done fully inside the app; the redirect target is
            intercepted in onShouldStartLoadWithRequest / onNavigationStateChange. */}
        {serverUrl ? (
          <WebView
            source={{ uri: authUrl }}
            // Browser-like user agent so Google shows the standard sign-in flow
            userAgent="Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
            onShouldStartLoadWithRequest={(req) => intercept(req.url)}
            onNavigationStateChange={(state) => {
              if (!intercept(state.url)) return;
            }}
            onLoadEnd={() => {
              setReady(true);
              setLoadingPage(false);
            }}
            javaScriptEnabled
            domStorageEnabled
            thirdPartyCookiesEnabled
            sharedCookiesEnabled
            style={[styles.webview, { backgroundColor: theme.bg }]}
          />
        ) : null}

        {/* Fallback: if Google ever refuses the embedded browser, still allow the
            classic system-browser flow which returns via deep link. */}
        <View style={[styles.fallbackRow, { borderTopColor: theme.border }]}>
          <TouchableOpacity
            style={[styles.fallbackBtn]}
            onPress={async () => {
              try {
                await Api.startGoogleAuth(withDrive);
                onClose();
              } catch {
                /* ignore */
              }
            }}
          >
            <Text style={styles.fallbackText}>Not working? Open in system browser</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  gBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gBadgeText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 4,
  },
  webview: {
    flex: 1,
  },
  loadingPane: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  loadingText: {
    fontSize: 13,
    marginTop: 10,
  },
  fallbackRow: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderTopWidth: 1,
    alignItems: 'center',
  },
  fallbackBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  fallbackText: {
    fontSize: 12,
    color: '#3b82f6',
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
