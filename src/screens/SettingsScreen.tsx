import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  TextInput,
  Switch,
  Alert,
} from 'react-native';
import {
  Palette,
  Globe,
  Check,
  Wifi,
  Trash2,
  User,
  LogOut,
  Cloud,
  Headphones,
  HardDrive,
  KeyRound,
  ShieldCheck,
} from 'lucide-react-native';
import { Storage } from '../services/storage';
import { Api } from '../services/api';
import { ReaderSettings, UserAccount, DriveAccount } from '../types';
import { THEMES, ThemeName } from '../theme/colors';
import { AuthModal } from '../components/AuthModal';
import { AccountSecurityModal } from '../components/AccountSecurityModal';

interface SettingsScreenProps {
  navigation?: any;
  settings: ReaderSettings;
  onUpdateSettings: (s: Partial<ReaderSettings>) => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ navigation, settings, onUpdateSettings }) => {
  const [serverUrl, setServerUrl] = useState('');
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<string | null>(null);
  const [user, setUser] = useState<UserAccount | null>(null);
  const [drive, setDrive] = useState<DriveAccount>({ connected: false });
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showAccountSecurityModal, setShowAccountSecurityModal] = useState(false);
  const [docsCount, setDocsCount] = useState(0);

  const theme = THEMES[settings.theme];

  const loadData = async () => {
    const url = await Storage.getServerUrl();
    const [storedUser, storedDrive, docs] = await Promise.all([
      Storage.getUserAccount(),
      Api.getDriveStatus(),
      Storage.getDocs(),
    ]);
    setServerUrl(url);
    setUser(storedUser);
    setDrive(storedDrive);
    setDocsCount(docs.length);
  };

  useEffect(() => {
    loadData();
    const unsub = navigation?.addListener ? navigation.addListener('focus', loadData) : undefined;
    return unsub;
  }, [navigation]);

  const handleSaveServerUrl = async () => {
    await Storage.setServerUrl(serverUrl);
    Alert.alert('Saved', 'Backend server URL updated.');
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setConnectionStatus(null);
    await Storage.setServerUrl(serverUrl);
    const res = await Api.checkHealth();
    setTestingConnection(false);
    if (res.ok) {
      setConnectionStatus('Connected successfully! Mode: ' + (res.mode || 'standard'));
    } else {
      setConnectionStatus('Could not reach server. Verify PC IP and that server is running.');
    }
  };

  const handleSignOut = async () => {
    Alert.alert('Sign Out', 'Sign out of your ReadSpace account on this device?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await Api.logout();
          await Storage.saveUserAccount(null);
          setUser(null);
        },
      },
    ]);
  };

  const handleClearCache = async () => {
    Alert.alert(
      'Clear Cache',
      'This will clear offline cached documents and bookmarks from your device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            await Storage.clearCache();
            await loadData();
            Alert.alert('Cache Cleared', 'Offline document cache has been reset.');
          },
        },
      ]
    );
  };

  const themes: { id: ThemeName; label: string; bg: string; fg: string }[] = [
    { id: 'ice', label: 'Ice Blue', bg: '#f2f8ff', fg: '#14233b' },
    { id: 'light', label: 'Light', bg: '#fafafa', fg: '#1c2130' },
    { id: 'dark', label: 'Dark', bg: '#0e1526', fg: '#dce6f5' },
    { id: 'sepia', label: 'Sepia', bg: '#f6edd9', fg: '#43382a' },
  ];

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.bg }]}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={[styles.screenTitle, { color: theme.fg }]}>Settings</Text>

        {/* User Account Section */}
        <Text style={[styles.sectionLabel, { color: theme.muted }]}>ACCOUNT & CLOUD</Text>
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {user ? (
            <View>
              <View style={styles.userRow}>
                <View style={[styles.avatarBox, { backgroundColor: theme.sel }]}>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: theme.accent }}>
                    {(user.displayName || user.email || 'U')[0].toUpperCase()}
                  </Text>
                </View>
                <View style={styles.userInfo}>
                  <Text style={[styles.userName, { color: theme.fg }]}>{user.displayName || user.email.split('@')[0]}</Text>
                  <Text style={[styles.userEmail, { color: theme.muted }]}>{user.email}</Text>
                </View>
                <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
                  <LogOut size={16} color="#ef4444" />
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={[styles.securityBtn, { borderColor: theme.border, backgroundColor: theme.sel }]}
                onPress={() => setShowAccountSecurityModal(true)}
              >
                <ShieldCheck size={14} color={theme.accent} style={{ marginRight: 6 }} />
                <Text style={[styles.securityBtnText, { color: theme.accent }]}>Account & Security Settings</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.guestRow}>
              <View style={styles.guestInfo}>
                <Text style={[styles.guestTitle, { color: theme.fg }]}>Not Signed In</Text>
                <Text style={[styles.guestDesc, { color: theme.muted }]}>
                  Sign in to sync your Google Drive and reading sessions across devices.
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.signInBtn, { backgroundColor: theme.accent }]}
                onPress={() => setShowAuthModal(true)}
              >
                <Text style={[styles.signInText, { color: theme.accentFg }]}>Sign In</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={[styles.divider, { backgroundColor: theme.border }]} />

          <View style={styles.optionRow}>
            <View style={styles.optionInfo}>
              <View style={styles.optionTitleRow}>
                <Cloud size={16} color={drive.connected ? '#16a34a' : theme.muted} />
                <Text style={[styles.optionTitle, { color: theme.fg }]}>Google Drive</Text>
              </View>
              <Text style={[styles.optionDesc, { color: theme.muted }]}>
                {drive.connected ? `Connected (${drive.email || 'Active'})` : 'Authorize Google Drive to sync workspaces & browse files.'}
              </Text>
            </View>
            <TouchableOpacity
              style={[
                styles.driveActionBtn,
                { backgroundColor: drive.connected ? '#fee2e2' : '#10b981' },
              ]}
              onPress={async () => {
                if (drive.connected) {
                  Alert.alert('Disconnect Google Drive', 'Revoke Drive cloud connection?', [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Disconnect',
                      style: 'destructive',
                      onPress: async () => {
                        await Api.disconnectDrive();
                        await Storage.saveDriveAccount({ connected: false });
                        setDrive({ connected: false });
                      },
                    },
                  ]);
                } else {
                  try {
                    await Api.startGoogleAuth(true, (data) => {
                      if (data.drive) setDrive(data.drive);
                    });
                  } catch (e: any) {
                    Alert.alert('Google Auth', e?.message || 'Could not start Google Drive connection');
                  }
                }
              }}
            >
              <Text
                style={[
                  styles.driveActionText,
                  { color: drive.connected ? '#ef4444' : '#ffffff' },
                ]}
              >
                {drive.connected ? 'Disconnect' : 'Connect'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Appearance & Themes */}
        <Text style={[styles.sectionLabel, { color: theme.muted }]}>APPEARANCE</Text>
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.themeRow}>
            {themes.map((t) => (
              <TouchableOpacity
                key={t.id}
                style={[
                  styles.themeBox,
                  { backgroundColor: t.bg, borderColor: settings.theme === t.id ? theme.accent : theme.border },
                  settings.theme === t.id && { borderWidth: 2 },
                ]}
                onPress={() => onUpdateSettings({ theme: t.id })}
              >
                <Text style={[styles.themeBoxText, { color: t.fg }]}>{t.label}</Text>
                {settings.theme === t.id && <Check size={14} color={theme.accent} />}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Audio & Playback */}
        <Text style={[styles.sectionLabel, { color: theme.muted }]}>AUDIO & PLAYBACK</Text>
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.optionRow}>
            <View style={styles.optionInfo}>
              <View style={styles.optionTitleRow}>
                <Headphones size={16} color={theme.accent} />
                <Text style={[styles.optionTitle, { color: theme.fg }]}>Background Audio</Text>
              </View>
              <Text style={[styles.optionDesc, { color: theme.muted }]}>
                Keep playing audio books and tracks when you switch apps or lock the screen.
              </Text>
            </View>
            <Switch
              value={settings.backgroundAudio}
              onValueChange={(val) => onUpdateSettings({ backgroundAudio: val })}
              trackColor={{ false: theme.border, true: theme.accent }}
              thumbColor="#ffffff"
            />
          </View>
        </View>

        {/* Offline Storage */}
        <Text style={[styles.sectionLabel, { color: theme.muted }]}>OFFLINE STORAGE</Text>
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.optionRow}>
            <View style={styles.optionInfo}>
              <View style={styles.optionTitleRow}>
                <HardDrive size={16} color={theme.accent} />
                <Text style={[styles.optionTitle, { color: theme.fg }]}>Device Storage</Text>
              </View>
              <Text style={[styles.optionDesc, { color: theme.muted }]}>
                {docsCount} document(s) cached locally on this phone.
              </Text>
            </View>
          </View>

          <TouchableOpacity style={[styles.clearBtn, { borderColor: '#ef4444' }]} onPress={handleClearCache}>
            <Trash2 size={14} color="#ef4444" />
            <Text style={styles.clearBtnText}>Clear Offline Cache</Text>
          </TouchableOpacity>
        </View>

        {/* Backend Server Connectivity */}
        <Text style={[styles.sectionLabel, { color: theme.muted }]}>BACKEND SERVER (OPTIONAL)</Text>
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.helperText, { color: theme.muted }]}>
            Needed only for Google Drive sync and remote account login. Local document reading is 100% offline.
          </Text>

          <TextInput
            style={[styles.input, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.fg }]}
            value={serverUrl}
            onChangeText={setServerUrl}
            placeholder="http://192.168.x.x:5173"
            placeholderTextColor={theme.muted}
            autoCapitalize="none"
          />

          <View style={styles.serverActions}>
            <TouchableOpacity style={[styles.btnOutline, { borderColor: theme.border }]} onPress={handleTestConnection}>
              <Wifi size={13} color={theme.accent} />
              <Text style={[styles.btnOutlineText, { color: theme.accent }]}>
                {testingConnection ? 'Testing...' : 'Test Connection'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.btnSolid, { backgroundColor: theme.accent }]} onPress={handleSaveServerUrl}>
              <Text style={[styles.btnSolidText, { color: theme.accentFg }]}>Save</Text>
            </TouchableOpacity>
          </View>

          {connectionStatus && (
            <Text
              style={[
                styles.statusMsg,
                { color: connectionStatus.includes('success') ? '#16a34a' : '#ef4444' },
              ]}
            >
              {connectionStatus}
            </Text>
          )}
        </View>

        {/* Footer info */}
        <View style={styles.footer}>
          <Text style={[styles.versionText, { color: theme.muted }]}>
            ReadSpace Mobile · v1.0.0 · Offline-First Engine
          </Text>
        </View>
      </ScrollView>

      {/* Auth Modal */}
      <AuthModal
        visible={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onSuccess={(u) => setUser(u)}
        settings={settings}
      />

      {/* Account & Security Modal */}
      <AccountSecurityModal
        visible={showAccountSecurityModal}
        user={user}
        drive={drive}
        settings={settings}
        onClose={() => setShowAccountSecurityModal(false)}
        onUserUpdated={(u) => setUser(u)}
        onSignOut={() => {
          setShowAccountSecurityModal(false);
          handleSignOut();
        }}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  securityBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 12,
  },
  securityBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  safeArea: { flex: 1 },
  container: { padding: 16, paddingBottom: 40 },
  screenTitle: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 10,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 14.5,
    fontWeight: '700',
  },
  userEmail: {
    fontSize: 11.5,
    marginTop: 2,
  },
  signOutBtn: {
    padding: 8,
  },
  guestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  guestInfo: {
    flex: 1,
  },
  guestTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  guestDesc: {
    fontSize: 11.5,
    marginTop: 2,
    lineHeight: 16,
  },
  signInBtn: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  signInText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    marginVertical: 12,
  },
  themeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  themeBox: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    gap: 4,
  },
  themeBoxText: {
    fontSize: 12,
    fontWeight: '600',
  },
  optionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  optionInfo: {
    flex: 1,
  },
  optionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  optionTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  optionDesc: {
    fontSize: 11,
    marginTop: 2,
  },
  driveActionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 7,
    marginLeft: 10,
  },
  driveActionText: {
    fontSize: 12,
    fontWeight: '700',
  },
  helperText: {
    fontSize: 11.5,
    marginBottom: 10,
    lineHeight: 16,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    marginBottom: 10,
  },
  serverActions: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-end',
  },
  btnOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  btnOutlineText: {
    fontSize: 12,
    fontWeight: '700',
  },
  btnSolid: {
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  btnSolidText: {
    fontSize: 12,
    fontWeight: '700',
  },
  statusMsg: {
    fontSize: 11.5,
    marginTop: 8,
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 12,
  },
  clearBtnText: {
    color: '#ef4444',
    fontSize: 12.5,
    fontWeight: '600',
  },
  footer: {
    alignItems: 'center',
    marginTop: 10,
  },
  versionText: {
    fontSize: 11,
  },
});
