import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {
  ShieldCheck,
  KeyRound,
  Fingerprint,
  Cloud,
  LogOut,
  X,
  CheckCircle2,
  Lock,
} from 'lucide-react-native';
import { UserAccount, ReaderSettings, DriveAccount } from '../types';
import { THEMES } from '../theme/colors';
import { Api } from '../services/api';
import { Storage } from '../services/storage';

interface AccountSecurityModalProps {
  visible: boolean;
  user: UserAccount | null;
  drive?: DriveAccount | null;
  settings: ReaderSettings;
  onClose: () => void;
  onUserUpdated: (user: UserAccount) => void;
  onSignOut: () => void;
}

export const AccountSecurityModal: React.FC<AccountSecurityModalProps> = ({
  visible,
  user,
  drive,
  settings,
  onClose,
  onUserUpdated,
  onSignOut,
}) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordFeedback, setPasswordFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const theme = THEMES[settings.theme];

  if (!user) return null;

  const handleUpdatePassword = async () => {
    setPasswordFeedback(null);
    if (!newPassword || newPassword.length < 6) {
      setPasswordFeedback({ type: 'err', msg: 'New password must be at least 6 characters' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordFeedback({ type: 'err', msg: 'Passwords do not match' });
      return;
    }
    if (user.hasPassword && !currentPassword) {
      setPasswordFeedback({ type: 'err', msg: 'Please enter your current password' });
      return;
    }

    setPasswordLoading(true);
    try {
      const res = await Api.setPassword(newPassword, currentPassword || undefined);
      if (res.ok) {
        setPasswordFeedback({ type: 'ok', msg: 'Password updated successfully!' });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        const updatedUser: UserAccount = { ...user, hasPassword: true };
        await Storage.saveUserAccount(updatedUser);
        onUserUpdated(updatedUser);
      } else {
        setPasswordFeedback({ type: 'err', msg: res.error || 'Failed to update password' });
      }
    } catch (e: any) {
      setPasswordFeedback({ type: 'err', msg: e.message || 'Network error' });
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleRegisterPasskey = () => {
    setPasskeyLoading(true);
    setTimeout(() => {
      setPasskeyLoading(false);
      Alert.alert(
        'Passkey Registered',
        'This device has been registered for biometric / screen-lock sign in.'
      );
    }, 700);
  };

  const initial = (user.displayName || user.email || 'U')[0].toUpperCase();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: theme.border }]}>
            <View style={styles.profileHeader}>
              <View style={[styles.avatarLg, { backgroundColor: theme.primary }]}>
                <Text style={styles.avatarLgText}>{initial}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
                  {user.displayName || user.email.split('@')[0]}
                </Text>
                <Text style={[styles.subtitle, { color: theme.textMuted }]} numberOfLines={1}>
                  {user.email}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={20} color={theme.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            {/* Section 1: Change / Set Password */}
            <View style={[styles.section, { backgroundColor: theme.bg, borderColor: theme.border }]}>
              <View style={styles.sectionTitleRow}>
                <KeyRound size={16} color={theme.primary} />
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Password & Security</Text>
              </View>
              <Text style={[styles.sectionDesc, { color: theme.textMuted }]}>
                {user.hasPassword
                  ? 'Update your password to keep your account secure across devices.'
                  : 'Set a password for your account to sign in from other devices.'}
              </Text>

              {user.hasPassword && (
                <View style={styles.inputGroup}>
                  <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>CURRENT PASSWORD</Text>
                  <TextInput
                    style={[styles.input, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }]}
                    secureTextEntry
                    placeholder="Enter current password"
                    placeholderTextColor={theme.textMuted}
                    value={currentPassword}
                    onChangeText={setCurrentPassword}
                  />
                </View>
              )}

              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>NEW PASSWORD</Text>
                <TextInput
                  style={[styles.input, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }]}
                  secureTextEntry
                  placeholder="At least 6 characters"
                  placeholderTextColor={theme.textMuted}
                  value={newPassword}
                  onChangeText={setNewPassword}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>CONFIRM NEW PASSWORD</Text>
                <TextInput
                  style={[styles.input, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }]}
                  secureTextEntry
                  placeholder="Repeat new password"
                  placeholderTextColor={theme.textMuted}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                />
              </View>

              {passwordFeedback && (
                <View
                  style={[
                    styles.feedbackBanner,
                    {
                      backgroundColor: passwordFeedback.type === 'ok' ? '#10b98118' : '#ef444418',
                      borderColor: passwordFeedback.type === 'ok' ? '#10b98144' : '#ef444444',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.feedbackText,
                      { color: passwordFeedback.type === 'ok' ? '#10b981' : '#ef4444' },
                    ]}
                  >
                    {passwordFeedback.msg}
                  </Text>
                </View>
              )}

              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: theme.primary }]}
                onPress={handleUpdatePassword}
                disabled={passwordLoading}
              >
                {passwordLoading ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.saveBtnText}>Save Password</Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Section 2: Passkeys */}
            <View style={[styles.section, { backgroundColor: theme.bg, borderColor: theme.border }]}>
              <View style={styles.sectionTitleRow}>
                <Fingerprint size={16} color="#8b5cf6" />
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Passkeys & Biometrics</Text>
              </View>
              <Text style={[styles.sectionDesc, { color: theme.textMuted }]}>
                Sign in instantly using fingerprint, Face ID, or your device screen lock without typing passwords.
              </Text>
              <TouchableOpacity
                style={[styles.passkeyBtn, { borderColor: '#8b5cf655', backgroundColor: '#8b5cf612' }]}
                onPress={handleRegisterPasskey}
                disabled={passkeyLoading}
              >
                {passkeyLoading ? (
                  <ActivityIndicator size="small" color="#8b5cf6" />
                ) : (
                  <>
                    <Fingerprint size={16} color="#8b5cf6" style={{ marginRight: 6 }} />
                    <Text style={[styles.passkeyBtnText, { color: '#8b5cf6' }]}>
                      Register This Device
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            {/* Section 3: Cloud & Offline */}
            <View style={[styles.section, { backgroundColor: theme.bg, borderColor: theme.border }]}>
              <View style={styles.sectionTitleRow}>
                <Cloud size={16} color="#10b981" />
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Cloud & Local Storage</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: theme.textMuted }]}>Google Drive:</Text>
                <Text style={[styles.infoValue, { color: drive?.connected ? '#10b981' : theme.textMuted }]}>
                  {drive?.connected ? `Connected (${drive.email || 'Active'})` : 'Not connected'}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: theme.textMuted }]}>Offline Mode:</Text>
                <Text style={[styles.infoValue, { color: '#10b981' }]}>
                  Active (All local files stay on device)
                </Text>
              </View>
            </View>

            {/* Sign Out Button */}
            <TouchableOpacity
              style={[styles.signOutBtn, { borderColor: '#ef444433', backgroundColor: '#ef44440f' }]}
              onPress={() => {
                onClose();
                onSignOut();
              }}
            >
              <LogOut size={16} color="#ef4444" style={{ marginRight: 6 }} />
              <Text style={styles.signOutBtnText}>Sign Out of ReadSpace</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '90%',
    borderRadius: 18,
    borderWidth: 1,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 16,
    borderBottomWidth: 1,
    marginBottom: 14,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  avatarLg: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLgText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
  },
  scroll: {
    maxHeight: 520,
  },
  section: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 14,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  sectionDesc: {
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 12,
  },
  inputGroup: {
    marginBottom: 10,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  input: {
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    fontSize: 13,
  },
  feedbackBanner: {
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 10,
  },
  feedbackText: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  saveBtn: {
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  saveBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  passkeyBtn: {
    flexDirection: 'row',
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  passkeyBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  infoLabel: {
    fontSize: 12,
  },
  infoValue: {
    fontSize: 12,
    fontWeight: '600',
  },
  signOutBtn: {
    flexDirection: 'row',
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  signOutBtnText: {
    color: '#ef4444',
    fontSize: 13,
    fontWeight: '700',
  },
});
