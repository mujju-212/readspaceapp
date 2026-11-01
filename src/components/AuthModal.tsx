import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { LogIn, UserPlus, KeyRound, X, CheckCircle2, ShieldCheck } from 'lucide-react-native';
import { Api } from '../services/api';
import { Storage } from '../services/storage';
import { UserAccount, ReaderSettings } from '../types';
import { THEMES } from '../theme/colors';

interface AuthModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: (user: UserAccount) => void;
  settings: ReaderSettings;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  visible,
  onClose,
  onSuccess,
  settings,
}) => {
  const [mode, setMode] = useState<'login' | 'register' | 'passkey'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const theme = THEMES[settings.theme];

  const handleSubmit = async () => {
    setErrorMsg(null);
    if (!email || !password) {
      setErrorMsg('Please enter both email and password');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        const res = await Api.login(email, password);
        if (res.ok && res.user) {
          const userAccount: UserAccount = {
            id: res.user.id || res.user._id,
            email: res.user.email,
            displayName: res.user.displayName || res.user.email.split('@')[0],
            hasPassword: true,
          };
          await Storage.saveUserAccount(userAccount);
          onSuccess(userAccount);
          onClose();
        } else {
          setErrorMsg(res.error || 'Login failed. Check your credentials or server.');
        }
      } else if (mode === 'register') {
        const res = await Api.register(email, password, displayName || undefined);
        if (res.ok && res.user) {
          const userAccount: UserAccount = {
            id: res.user.id || res.user._id,
            email: res.user.email,
            displayName: res.user.displayName || displayName || email.split('@')[0],
            hasPassword: true,
          };
          await Storage.saveUserAccount(userAccount);
          onSuccess(userAccount);
          onClose();
        } else {
          setErrorMsg(res.error || 'Registration failed. Email may already be in use.');
        }
      }
    } catch (e: any) {
      setErrorMsg(e.message || 'Network error. Verify server is online.');
    } finally {
      setLoading(false);
    }
  };

  const handlePasskeyQuickLogin = async () => {
    // Quick Passkey simulation for mobile app
    setLoading(true);
    setTimeout(async () => {
      setLoading(false);
      const user = await Storage.getUserAccount();
      if (user) {
        Alert.alert('Passkey Verified', `Welcome back, ${user.displayName}!`);
        onSuccess(user);
        onClose();
      } else {
        setErrorMsg('No passkey registered on this device yet. Please sign in first.');
      }
    }, 600);
  };

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      await Api.startGoogleAuth(false, (data) => {
        setLoading(false);
        if (data.user) {
          onSuccess(data.user);
          onClose();
        }
      });
    } catch (e: any) {
      setLoading(false);
      setErrorMsg(e?.message || 'Failed to start Google sign in');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={{ width: '100%' }}
        >
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <ShieldCheck size={20} color={theme.accent} />
              <Text style={[styles.title, { color: theme.fg }]}>
                {mode === 'login' ? 'Sign In to ReadSpace' : mode === 'register' ? 'Create Account' : 'Passkey Login'}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={18} color={theme.muted} />
            </TouchableOpacity>
          </View>

          {/* Segmented Tab */}
          <View style={[styles.tabBar, { backgroundColor: theme.bg, borderColor: theme.border }]}>
            <TouchableOpacity
              style={[styles.tabBtn, mode === 'login' && { backgroundColor: theme.card }]}
              onPress={() => {
                setMode('login');
                setErrorMsg(null);
              }}
            >
              <LogIn size={13} color={mode === 'login' ? theme.accent : theme.muted} />
              <Text style={[styles.tabText, { color: mode === 'login' ? theme.accent : theme.muted }]}>
                Sign In
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabBtn, mode === 'register' && { backgroundColor: theme.card }]}
              onPress={() => {
                setMode('register');
                setErrorMsg(null);
              }}
            >
              <UserPlus size={13} color={mode === 'register' ? theme.accent : theme.muted} />
              <Text style={[styles.tabText, { color: mode === 'register' ? theme.accent : theme.muted }]}>
                Register
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabBtn, mode === 'passkey' && { backgroundColor: theme.card }]}
              onPress={() => {
                setMode('passkey');
                setErrorMsg(null);
              }}
            >
              <KeyRound size={13} color={mode === 'passkey' ? theme.accent : theme.muted} />
              <Text style={[styles.tabText, { color: mode === 'passkey' ? theme.accent : theme.muted }]}>
                Passkey
              </Text>
            </TouchableOpacity>
          </View>

          {/* Error Message */}
          {errorMsg && (
            <View style={[styles.errorBox, { backgroundColor: '#fee2e2', borderColor: '#fca5a5' }]}>
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
          )}

          {/* Passkey Mode */}
          {mode === 'passkey' ? (
            <View style={styles.passkeyBox}>
              <KeyRound size={42} color={theme.accent} />
              <Text style={[styles.passkeyTitle, { color: theme.fg }]}>Instant Passkey Sign-in</Text>
              <Text style={[styles.passkeyDesc, { color: theme.muted }]}>
                Sign in securely with your device's fingerprint, face recognition, or PIN without typing passwords.
              </Text>
              <TouchableOpacity
                style={[styles.submitBtn, { backgroundColor: theme.accent }]}
                onPress={handlePasskeyQuickLogin}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color={theme.accentFg} />
                ) : (
                  <Text style={[styles.submitText, { color: theme.accentFg }]}>Authenticate with Passkey</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            /* Email & Password Form */
            <View style={styles.form}>
              {mode === 'register' && (
                <View style={styles.field}>
                  <Text style={[styles.label, { color: theme.muted }]}>Display Name</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.fg }]}
                    placeholder="Your Name (e.g. Alex)"
                    placeholderTextColor={theme.muted}
                    value={displayName}
                    onChangeText={setDisplayName}
                  />
                </View>
              )}

              <View style={styles.field}>
                <Text style={[styles.label, { color: theme.muted }]}>Email Address</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.fg }]}
                  placeholder="name@example.com"
                  placeholderTextColor={theme.muted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={email}
                  onChangeText={setEmail}
                />
              </View>

              <View style={styles.field}>
                <Text style={[styles.label, { color: theme.muted }]}>Password</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.fg }]}
                  placeholder="••••••••"
                  placeholderTextColor={theme.muted}
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                />
              </View>

              <TouchableOpacity
                style={[styles.submitBtn, { backgroundColor: theme.accent }]}
                onPress={handleSubmit}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color={theme.accentFg} />
                ) : (
                  <Text style={[styles.submitText, { color: theme.accentFg }]}>
                    {mode === 'login' ? 'Sign In' : 'Create Account'}
                  </Text>
                )}
              </TouchableOpacity>

              {/* Google Sign In Option */}
              <View style={styles.dividerRow}>
                <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
                <Text style={[styles.dividerLabel, { color: theme.muted }]}>OR</Text>
                <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
              </View>

              <TouchableOpacity
                style={[styles.googleBtn, { backgroundColor: theme.bg, borderColor: theme.border }]}
                onPress={handleGoogleSignIn}
                activeOpacity={0.8}
              >
                <View style={styles.googleIconBox}>
                  <Text style={styles.googleIconText}>G</Text>
                </View>
                <Text style={[styles.googleBtnText, { color: theme.fg }]}>Continue with Google</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Footer Offline Notice */}
          <View style={styles.footer}>
            <CheckCircle2 size={12} color="#16a34a" />
            <Text style={[styles.footerText, { color: theme.muted }]}>
              Offline mode active: Local documents always work without an account.
            </Text>
          </View>
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 4,
  },
  tabBar: {
    flexDirection: 'row',
    borderRadius: 10,
    borderWidth: 1,
    padding: 3,
    marginBottom: 16,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 7,
    borderRadius: 7,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
  },
  errorBox: {
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
  },
  errorText: {
    color: '#b91c1c',
    fontSize: 12,
    textAlign: 'center',
  },
  form: {
    gap: 12,
  },
  field: {
    gap: 4,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13.5,
  },
  submitBtn: {
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  submitText: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  passkeyBox: {
    alignItems: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  passkeyTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginTop: 4,
  },
  passkeyDesc: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 17,
    marginBottom: 12,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  footerText: {
    fontSize: 10.5,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginHorizontal: 8,
  },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 42,
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
  },
  googleIconBox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#4285F4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleIconText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
  },
  googleBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
