import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import {
  ShieldCheck,
  Cloud,
  CloudOff,
  Bookmark,
  LogOut,
  X,
  User,
  CheckCircle2,
} from 'lucide-react-native';
import { UserAccount, ReaderSettings, DriveAccount } from '../types';
import { THEMES } from '../theme/colors';
import { Api } from '../services/api';
import { Storage } from '../services/storage';

interface AccountMenuModalProps {
  visible: boolean;
  user: UserAccount | null;
  drive?: DriveAccount | null;
  settings: ReaderSettings;
  onClose: () => void;
  onOpenAccountSecurity: () => void;
  onOpenSavedLinks: () => void;
  onOpenDrive: () => void;
  onSignOut: () => void;
}

export const AccountMenuModal: React.FC<AccountMenuModalProps> = ({
  visible,
  user,
  drive,
  settings,
  onClose,
  onOpenAccountSecurity,
  onOpenSavedLinks,
  onOpenDrive,
  onSignOut,
}) => {
  const theme = THEMES[settings.theme];

  if (!user) return null;

  const handleDisconnectDrive = () => {
    Alert.alert('Disconnect Drive', 'Disconnect your Google Drive account from this session?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: async () => {
          await Api.disconnectDrive();
          await Storage.saveDriveAccount({ connected: false });
          onClose();
        },
      },
    ]);
  };

  const handleSignOutConfirm = () => {
    Alert.alert('Sign Out', 'Sign out of your ReadSpace account on this device?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await Api.logout();
          await Storage.saveUserAccount(null);
          onSignOut();
          onClose();
        },
      },
    ]);
  };

  const initial = (user.displayName || user.email || 'U')[0].toUpperCase();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.anchorContainer}>
          <TouchableOpacity
            activeOpacity={1}
            style={[styles.popover, { backgroundColor: theme.surface, borderColor: theme.border }]}
          >
            {/* Header / User Profile */}
            <View style={[styles.profileRow, { borderBottomColor: theme.border }]}>
              <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
                <Text style={styles.avatarText}>{initial}</Text>
              </View>
              <View style={styles.profileText}>
                <Text style={[styles.displayName, { color: theme.text }]} numberOfLines={1}>
                  {user.displayName || user.email.split('@')[0]}
                </Text>
                <Text style={[styles.email, { color: theme.textMuted }]} numberOfLines={1}>
                  {user.email}
                </Text>
                <View style={styles.statusRow}>
                  <View
                    style={[
                      styles.statusDot,
                      { backgroundColor: drive?.connected ? '#10b981' : theme.textMuted },
                    ]}
                  />
                  <Text style={[styles.statusText, { color: theme.textMuted }]}>
                    Drive: {drive?.connected ? `connected (${drive.email || 'authorized'})` : 'not connected'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <X size={16} color={theme.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Menu Action Items (1:1 with Web App acct-pop) */}
            <View style={styles.menuItems}>
              {/* 1. Account & Security */}
              <TouchableOpacity
                style={[styles.menuItem, { backgroundColor: theme.bg }]}
                onPress={() => {
                  onClose();
                  onOpenAccountSecurity();
                }}
              >
                <View style={[styles.menuIconWrap, { backgroundColor: '#3b82f618' }]}>
                  <ShieldCheck size={16} color="#3b82f6" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.menuItemText, { color: theme.text }]}>Account & Security</Text>
                  <Text style={[styles.menuItemSub, { color: theme.textMuted }]}>
                    Password, passkeys & settings
                  </Text>
                </View>
              </TouchableOpacity>

              {/* 2. Google Drive */}
              {drive?.connected ? (
                <TouchableOpacity
                  style={[styles.menuItem, { backgroundColor: theme.bg }]}
                  onPress={handleDisconnectDrive}
                >
                  <View style={[styles.menuIconWrap, { backgroundColor: '#ef444418' }]}>
                    <CloudOff size={16} color="#ef4444" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.menuItemText, { color: theme.text }]}>Disconnect Drive</Text>
                    <Text style={[styles.menuItemSub, { color: theme.textMuted }]}>
                      Revoke cloud access
                    </Text>
                  </View>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.menuItem, { backgroundColor: theme.bg }]}
                  onPress={async () => {
                    onClose();
                    try {
                      await Api.startGoogleAuth(true);
                    } catch (e: any) {
                      Alert.alert('Google Drive', e?.message || 'Could not start Google Drive authorization');
                    }
                  }}
                >
                  <View style={[styles.menuIconWrap, { backgroundColor: '#10b98118' }]}>
                    <Cloud size={16} color="#10b981" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.menuItemText, { color: theme.text }]}>Connect Drive</Text>
                    <Text style={[styles.menuItemSub, { color: theme.textMuted }]}>
                      Authorize Google Drive cloud
                    </Text>
                  </View>
                </TouchableOpacity>
              )}

              {/* 3. Saved Links */}
              <TouchableOpacity
                style={[styles.menuItem, { backgroundColor: theme.bg }]}
                onPress={() => {
                  onClose();
                  onOpenSavedLinks();
                }}
              >
                <View style={[styles.menuIconWrap, { backgroundColor: '#f59e0b18' }]}>
                  <Bookmark size={16} color="#f59e0b" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.menuItemText, { color: theme.text }]}>Saved Links</Text>
                  <Text style={[styles.menuItemSub, { color: theme.textMuted }]}>
                    View bookmarked collections
                  </Text>
                </View>
              </TouchableOpacity>

              {/* 4. Sign Out */}
              <TouchableOpacity
                style={[styles.menuItem, { backgroundColor: '#ef44440c', borderColor: '#ef444422', borderWidth: 1 }]}
                onPress={handleSignOutConfirm}
              >
                <View style={[styles.menuIconWrap, { backgroundColor: '#ef444418' }]}>
                  <LogOut size={16} color="#ef4444" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.menuItemText, { color: '#ef4444' }]}>Sign Out</Text>
                  <Text style={[styles.menuItemSub, { color: '#ef444499' }]}>
                    Exit account on this device
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 65,
    paddingRight: 16,
  },
  anchorContainer: {
    width: '100%',
    maxWidth: 320,
  },
  popover: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 12,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
  profileText: {
    flex: 1,
  },
  displayName: {
    fontSize: 14,
    fontWeight: '700',
  },
  email: {
    fontSize: 12,
    marginTop: 1,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 3,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
  },
  closeBtn: {
    padding: 4,
  },
  menuItems: {
    paddingTop: 10,
    gap: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 10,
    gap: 10,
  },
  menuIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItemText: {
    fontSize: 13,
    fontWeight: '600',
  },
  menuItemSub: {
    fontSize: 11,
    marginTop: 1,
  },
});
