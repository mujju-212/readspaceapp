import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  TextInput,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  FileText,
  FolderOpen,
  Cloud,
  Clock,
  PlayCircle,
  User,
  Trash2,
  Bookmark,
  WifiOff,
  Sparkles,
  Link2,
  Search,
  ExternalLink,
  ChevronRight,
  Folder,
} from 'lucide-react-native';
import { Storage } from '../services/storage';
import { pickDocuments } from '../services/picker';
import { pickWorkspaceFolder, openFolderEntry, findFirstFileEntry } from '../services/folder';
import { MobileDoc, ReaderSettings, SavedLink, UserAccount, WorkspaceFolder, DriveAccount } from '../types';
import { THEMES } from '../theme/colors';
import { AuthModal } from '../components/AuthModal';
import { OpenDriveLinkModal } from '../components/OpenDriveLinkModal';
import { SavedLinksModal } from '../components/SavedLinksModal';
import { FolderExplorerModal } from '../components/FolderExplorerModal';
import { AccountMenuModal } from '../components/AccountMenuModal';
import { AccountSecurityModal } from '../components/AccountSecurityModal';
import { CloudTransferModal } from '../components/CloudTransferModal';
import { Api } from '../services/api';

interface HomeScreenProps {
  navigation: any;
  settings: ReaderSettings;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({ navigation, settings }) => {
  const [docs, setDocs] = useState<MobileDoc[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceFolder[]>([]);
  const [savedLinks, setSavedLinks] = useState<SavedLink[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceFolder | null>(null);
  const [user, setUser] = useState<UserAccount | null>(null);
  const [drive, setDrive] = useState<DriveAccount | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // Modals
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [showAccountSecurityModal, setShowAccountSecurityModal] = useState(false);
  const [showDriveLinkModal, setShowDriveLinkModal] = useState(false);
  const [driveLinkSaveMode, setDriveLinkSaveMode] = useState(false);
  const [showSavedLinksModal, setShowSavedLinksModal] = useState(false);
  const [showExplorerModal, setShowExplorerModal] = useState(false);
  const [showCloudTransferModal, setShowCloudTransferModal] = useState(false);
  const [loadingOverlay, setLoadingOverlay] = useState(false);
  const [loadingOverlayMsg, setLoadingOverlayMsg] = useState('Opening folder…');

  const theme = THEMES[settings.theme];

  const loadData = async () => {
    // If returning from full-page redirect OAuth on web
    if (typeof window !== 'undefined' && window.location && window.location.search) {
      const params = new URLSearchParams(window.location.search);
      const token = params.get('token');
      const signedIn = params.get('signedin') === '1';
      const driveParam = params.get('drive') === '1';
      if (token) {
        await Storage.saveSessionToken(token);
      }
      if (signedIn || driveParam || token) {
        await Api.syncSession();
        try {
          window.history.replaceState({}, document.title, window.location.pathname);
        } catch {}
      }
    }

    const [list, wsList, links, storedUser, storedDrive] = await Promise.all([
      Storage.getDocs(),
      Storage.getWorkspaces(),
      Storage.getSavedLinks(),
      Storage.getUserAccount(),
      Storage.getDriveAccount(),
    ]);
    setDocs(list);
    setWorkspaces(wsList);
    setSavedLinks(links);
    setUser(storedUser);
    setDrive(storedDrive);
    if (wsList.length > 0 && !activeWorkspace) {
      setActiveWorkspace(wsList[0]);
    }
  };

  useEffect(() => {
    loadData();
    const unsub = navigation.addListener('focus', loadData);
    return unsub;
  }, [navigation]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleOpenDoc = (doc: MobileDoc) => {
    navigation.navigate('Reader', { doc, workspace: activeWorkspace || undefined });
  };

  // Open Folder: picks a directory, loads workspace, finds first file, and opens Reader workbench
  const handleOpenFolder = async () => {
    setLoadingOverlay(true);
    setLoadingOverlayMsg('Opening directory…');
    try {
      const ws = await pickWorkspaceFolder();
      if (ws) {
        setLoadingOverlayMsg(`Scanning ${ws.name}…`);
        setActiveWorkspace(ws);
        await loadData();
        const firstFile = findFirstFileEntry(ws.entries || []);
        if (firstFile) {
          try {
            setLoadingOverlayMsg(`Opening ${firstFile.name}…`);
            const doc = await openFolderEntry(firstFile);
            setLoadingOverlay(false);
            navigation.navigate('Reader', { doc, workspace: ws, initialSidebarOpen: true });
            return;
          } catch (err: any) {
            console.warn('Could not open first file in folder:', err);
          }
        }
        setShowExplorerModal(true);
      }
    } catch (err: any) {
      Alert.alert('Folder Error', err?.message || 'Could not open folder.');
    } finally {
      setLoadingOverlay(false);
    }
  };

  // Open File: picks an individual file and opens it directly in Reader
  const handleOpenFile = async () => {
    try {
      const picked = await pickDocuments();
      if (picked.length > 0) {
        const doc = picked[0];
        setLoadingOverlay(true);
        setLoadingOverlayMsg(`Opening ${doc.name}…`);
        await Storage.saveDoc(doc);
        await loadData();
        setLoadingOverlay(false);
        navigation.navigate('Reader', { doc, workspace: activeWorkspace || undefined });
      }
    } catch (err: any) {
      Alert.alert('Picker Error', err?.message || 'Could not pick file.');
    } finally {
      setLoadingOverlay(false);
    }
  };

  // Open Workspace from Recent list: loads first file and opens Reader workbench
  const handleOpenWorkspace = async (ws: WorkspaceFolder) => {
    setLoadingOverlay(true);
    setLoadingOverlayMsg(`Opening ${ws.name}…`);
    try {
      setActiveWorkspace(ws);
      const firstFile = findFirstFileEntry(ws.entries || []);
      if (firstFile) {
        try {
          setLoadingOverlayMsg(`Loading ${firstFile.name}…`);
          const doc = await openFolderEntry(firstFile);
          setLoadingOverlay(false);
          navigation.navigate('Reader', { doc, workspace: ws, initialSidebarOpen: true });
          return;
        } catch (err) {
          console.warn('Could not open first file in workspace:', err);
        }
      }
      setShowExplorerModal(true);
    } finally {
      setLoadingOverlay(false);
    }
  };

  const handleDeleteDoc = async (id: string, name: string) => {
    Alert.alert('Remove Document', `Remove "${name}" from your recent list?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await Storage.removeDoc(id);
          await loadData();
        },
      },
    ]);
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const timeAgo = (timestamp?: number) => {
    if (!timestamp) return '';
    const diff = Math.max(1, Math.round((Date.now() - timestamp) / 1000));
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  // Continue reading item (most recently opened doc)
  const continueDoc = docs.length > 0 ? docs[0] : null;

  // Filter docs for search
  const filteredDocs = searchQuery.trim()
    ? docs.filter((d) => d.name.toLowerCase().includes(searchQuery.trim().toLowerCase()))
    : docs;

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.safeArea, { backgroundColor: theme.bg }]}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        {/* Top Header */}
        <View style={styles.header}>
          <View style={styles.brandContainer}>
            <View style={[styles.logoBadge, { backgroundColor: theme.primary }]}>
              <FileText size={18} color="#ffffff" />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.brandTitle, { color: theme.text }]}>ReadSpace</Text>
              <Text style={[styles.brandTagline, { color: theme.textMuted }]} numberOfLines={1}>
                {user ? `Signed in as ${user.displayName || user.email}` : 'One calm workspace for all your docs'}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.userChip, { backgroundColor: theme.surface, borderColor: theme.border }]}
            onPress={() => {
              if (user) {
                setShowAccountMenu(true);
              } else {
                setShowAuthModal(true);
              }
            }}
          >
            {user ? (
              <View style={styles.signedInChipRow}>
                <View style={[styles.userAvatar, { backgroundColor: theme.primary }]}>
                  <Text style={styles.userAvatarText}>{(user.displayName || user.email)[0].toUpperCase()}</Text>
                </View>
                <Text style={[styles.userChipText, { color: theme.text }]} numberOfLines={1}>
                  {user.displayName || user.email.split('@')[0]}
                </Text>
              </View>
            ) : (
              <View style={styles.offlineChipRow}>
                <WifiOff size={13} color={theme.textMuted} />
                <Text style={[styles.userChipText, { color: theme.textSecondary }]}>Account</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Global Search Bar */}
        <View style={[styles.searchBar, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Search size={16} color={theme.textMuted} style={{ marginRight: 8 }} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Search recent files, folders, or notes…"
            placeholderTextColor={theme.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {/* 4 Quick Action Cards (1:1 with Web App) */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Quick Actions</Text>
        </View>
        <View style={styles.qaGrid}>
          {/* 1. Open Folder */}
          <TouchableOpacity
            style={[styles.qaCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
            onPress={handleOpenFolder}
            activeOpacity={0.7}
          >
            <View style={[styles.qaIconWrap, { backgroundColor: '#3b82f618' }]}>
              <FolderOpen size={20} color="#3b82f6" />
            </View>
            <Text style={[styles.qaTitle, { color: theme.text }]}>Open Folder</Text>
            <Text style={[styles.qaDesc, { color: theme.textMuted }]}>
              Open workspace tree & preview documents
            </Text>
          </TouchableOpacity>

          {/* 2. Open File */}
          <TouchableOpacity
            style={[styles.qaCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
            onPress={handleOpenFile}
            activeOpacity={0.7}
          >
            <View style={[styles.qaIconWrap, { backgroundColor: '#8b5cf618' }]}>
              <FileText size={20} color="#8b5cf6" />
            </View>
            <Text style={[styles.qaTitle, { color: theme.text }]}>Open File</Text>
            <Text style={[styles.qaDesc, { color: theme.textMuted }]}>
              Pick PDF, Word, PPT or text file
            </Text>
          </TouchableOpacity>

          {/* 3. Google Drive */}
          <TouchableOpacity
            style={[styles.qaCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
            onPress={() => navigation.navigate('Library', { initialTab: 'drive' })}
            activeOpacity={0.7}
          >
            <View style={[styles.qaIconWrap, { backgroundColor: '#10b98118' }]}>
              <Cloud size={20} color="#10b981" />
            </View>
            <Text style={[styles.qaTitle, { color: theme.text }]}>Google Drive</Text>
            <Text style={[styles.qaDesc, { color: theme.textMuted }]}>
              Browse cloud files & make offline
            </Text>
          </TouchableOpacity>

          {/* 4. Saved Links */}
          <TouchableOpacity
            style={[styles.qaCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
            onPress={() => setShowSavedLinksModal(true)}
            activeOpacity={0.7}
          >
            <View style={[styles.qaIconWrap, { backgroundColor: '#ec489918' }]}>
              <Bookmark size={20} color="#ec4899" />
            </View>
            <Text style={[styles.qaTitle, { color: theme.text }]}>Saved Links</Text>
            <Text style={[styles.qaDesc, { color: theme.textMuted }]}>
              {savedLinks.length > 0 ? `${savedLinks.length} item(s) in collection` : 'Personal link collection'}
            </Text>
          </TouchableOpacity>

          {/* 5. Open Link */}
          <TouchableOpacity
            style={[styles.qaCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
            onPress={() => {
              setDriveLinkSaveMode(false);
              setShowDriveLinkModal(true);
            }}
            activeOpacity={0.7}
          >
            <View style={[styles.qaIconWrap, { backgroundColor: '#f59e0b18' }]}>
              <Link2 size={20} color="#f59e0b" />
            </View>
            <Text style={[styles.qaTitle, { color: theme.text }]}>Open Link</Text>
            <Text style={[styles.qaDesc, { color: theme.textMuted }]}>
              Paste a shared Drive URL or Doc
            </Text>
          </TouchableOpacity>

          {/* 6. Cloud Transfer */}
          <TouchableOpacity
            style={[styles.qaCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
            onPress={() => setShowCloudTransferModal(true)}
            activeOpacity={0.7}
          >
            <View style={[styles.qaIconWrap, { backgroundColor: '#06b6d418' }]}>
              <Cloud size={20} color="#06b6d4" />
            </View>
            <Text style={[styles.qaTitle, { color: theme.text }]}>Cloud Transfer</Text>
            <Text style={[styles.qaDesc, { color: theme.textMuted }]}>
              Sync workspace or backup to cloud
            </Text>
          </TouchableOpacity>
        </View>

        {/* Continue Reading Card */}
        {continueDoc && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Continue Reading</Text>
            </View>
            <TouchableOpacity
              style={[styles.continueCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
              onPress={() => handleOpenDoc(continueDoc)}
              activeOpacity={0.8}
            >
              <View style={styles.continueCardContent}>
                <View style={[styles.docKindCircle, { backgroundColor: theme.primary + '18' }]}>
                  <FileText size={22} color={theme.primary} />
                </View>
                <View style={styles.continueMeta}>
                  <View style={styles.badgeRow}>
                    <View style={[styles.formatBadge, { backgroundColor: theme.primary + '18' }]}>
                      <Text style={[styles.formatText, { color: theme.primary }]}>
                        {continueDoc.kind.toUpperCase()}
                      </Text>
                    </View>
                    {continueDoc.isDrive && (
                      <View style={[styles.formatBadge, { backgroundColor: '#10b98118' }]}>
                        <Text style={[styles.formatText, { color: '#10b981' }]}>CLOUD</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.continueName, { color: theme.text }]} numberOfLines={1}>
                    {continueDoc.name}
                  </Text>
                  <Text style={[styles.continueSub, { color: theme.textMuted }]}>
                    Opened {timeAgo(continueDoc.lastOpenedAt)}
                    {continueDoc.position?.page ? ` · Page ${continueDoc.position.page}` : ''}
                  </Text>
                </View>
              </View>
              <View style={[styles.resumeBtn, { backgroundColor: theme.primary }]}>
                <PlayCircle size={15} color="#ffffff" style={{ marginRight: 6 }} />
                <Text style={styles.resumeBtnText}>Resume</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* Recent Workspaces / Folders Section */}
        {workspaces.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Recent Folders & Workspaces</Text>
              <TouchableOpacity onPress={() => setShowCloudTransferModal(true)}>
                <Text style={[styles.viewAllText, { color: '#059669' }]}>☁️ Sync to Drive</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.wsRow}>
              {workspaces.map((ws) => (
                <TouchableOpacity
                  key={ws.id}
                  style={[styles.wsCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
                  onPress={() => handleOpenWorkspace(ws)}
                >
                  <View style={[styles.wsIconCircle, { backgroundColor: '#f59e0b18' }]}>
                    <Folder size={18} color="#f59e0b" />
                  </View>
                  <Text style={[styles.wsTitle, { color: theme.text }]} numberOfLines={1}>
                    {ws.name}
                  </Text>
                  <Text style={[styles.wsSub, { color: theme.textMuted }]}>
                    {ws.fileCount ? `${ws.fileCount} files` : 'Folder'}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Saved Links Section (Always visible 1:1 with Web App) */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Bookmark size={16} color={theme.primary} style={{ marginRight: 6 }} />
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Saved Links</Text>
            </View>
            <TouchableOpacity onPress={() => setShowSavedLinksModal(true)}>
              <Text style={[styles.viewAllText, { color: theme.primary }]}>
                {savedLinks.length > 0 ? `View All (${savedLinks.length})` : 'Open Panel'}
              </Text>
            </TouchableOpacity>
          </View>

          {savedLinks.length === 0 ? (
            <View style={[styles.savedLinksEmptyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={styles.savedLinksEmptyLeft}>
                <Text style={[styles.savedLinksEmptyTitle, { color: theme.text }]}>
                  Personal Collection of Shared Files
                </Text>
                <Text style={[styles.savedLinksEmptySub, { color: theme.textMuted }]}>
                  {user
                    ? 'Paste a shared Drive URL to keep a reference in your account — never a duplicate copy.'
                    : 'Sign in to sync your saved links collection across all your devices.'}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.savedLinksEmptyBtn, { backgroundColor: theme.primary }]}
                onPress={() => {
                  setDriveLinkSaveMode(true);
                  setShowDriveLinkModal(true);
                }}
              >
                <Text style={styles.savedLinksEmptyBtnText}>+ Save Link</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.savedLinksRow}>
              {savedLinks.slice(0, 6).map((l) => (
                <TouchableOpacity
                  key={l.id}
                  style={[styles.savedLinkCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
                  onPress={() => setShowSavedLinksModal(true)}
                >
                  <View style={[styles.badgePill, { backgroundColor: theme.primary + '14' }]}>
                    <Text style={[styles.badgePillText, { color: theme.primary }]}>{l.collection || 'General'}</Text>
                  </View>
                  <Text style={[styles.savedLinkTitle, { color: theme.text }]} numberOfLines={1}>
                    {l.title}
                  </Text>
                  <Text style={[styles.savedLinkSub, { color: theme.textMuted }]}>
                    Google {l.hint.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>

        {/* Recent Items List */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Recent Items</Text>
            <Text style={[styles.recentsCount, { color: theme.textMuted }]}>
              {filteredDocs.length} {filteredDocs.length === 1 ? 'file' : 'files'}
            </Text>
          </View>

          {filteredDocs.length === 0 ? (
            <View style={[styles.emptyBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <FileText size={32} color={theme.textMuted} style={{ marginBottom: 10 }} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>No Recent Documents</Text>
              <Text style={[styles.emptySubtitle, { color: theme.textMuted }]}>
                Open a local folder, pick a file, or paste a Drive link above.
              </Text>
            </View>
          ) : (
            filteredDocs.map((doc) => (
              <View
                key={doc.id}
                style={[styles.docItem, { backgroundColor: theme.surface, borderColor: theme.border }]}
              >
                <TouchableOpacity
                  style={styles.docItemMain}
                  onPress={() => handleOpenDoc(doc)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.docKindSmall, { backgroundColor: theme.primary + '18' }]}>
                    <FileText size={18} color={theme.primary} />
                  </View>
                  <View style={styles.docItemMeta}>
                    <Text style={[styles.docItemName, { color: theme.text }]} numberOfLines={1}>
                      {doc.name}
                    </Text>
                    <View style={styles.docItemSubRow}>
                      <View style={[styles.microBadge, { backgroundColor: theme.primary + '15' }]}>
                        <Text style={[styles.microBadgeText, { color: theme.primary }]}>
                          {doc.kind.toUpperCase()}
                        </Text>
                      </View>
                      {doc.size ? (
                        <Text style={[styles.docItemSubText, { color: theme.textMuted }]}>
                          {' · '}{formatSize(doc.size)}
                        </Text>
                      ) : null}
                      <Text style={[styles.docItemSubText, { color: theme.textMuted }]}>
                        {' · '}{timeAgo(doc.lastOpenedAt)}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => handleDeleteDoc(doc.id, doc.name)}
                >
                  <Trash2 size={16} color={theme.textMuted} />
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Auth Modal (when signed out) */}
      <AuthModal
        visible={showAuthModal}
        settings={settings}
        onClose={() => setShowAuthModal(false)}
        onSuccess={(u: UserAccount) => {
          setUser(u);
          setShowAuthModal(false);
          loadData();
        }}
      />

      {/* Account Popover Menu Modal (when signed in) */}
      <AccountMenuModal
        visible={showAccountMenu}
        user={user}
        drive={drive}
        settings={settings}
        onClose={() => setShowAccountMenu(false)}
        onOpenAccountSecurity={() => setShowAccountSecurityModal(true)}
        onOpenSavedLinks={() => setShowSavedLinksModal(true)}
        onOpenDrive={() => navigation.navigate('Library', { initialTab: 'drive' })}
        onSignOut={() => {
          setUser(null);
          loadData();
        }}
      />

      {/* Account & Security Modal */}
      <AccountSecurityModal
        visible={showAccountSecurityModal}
        user={user}
        drive={drive}
        settings={settings}
        onClose={() => setShowAccountSecurityModal(false)}
        onUserUpdated={(updatedUser) => {
          setUser(updatedUser);
          loadData();
        }}
        onSignOut={() => {
          setShowAccountSecurityModal(false);
          setUser(null);
          loadData();
        }}
      />

      {/* Open Drive Link Modal */}
      <OpenDriveLinkModal
        visible={showDriveLinkModal}
        isSaveMode={driveLinkSaveMode}
        theme={theme}
        onClose={() => setShowDriveLinkModal(false)}
        onDocOpened={(doc) => {
          setShowDriveLinkModal(false);
          loadData();
          handleOpenDoc(doc);
        }}
        onLinkSaved={(link) => {
          setShowDriveLinkModal(false);
          loadData();
        }}
      />

      {/* Saved Links Modal */}
      <SavedLinksModal
        visible={showSavedLinksModal}
        theme={theme}
        onClose={() => setShowSavedLinksModal(false)}
        onOpenDoc={(doc) => {
          setShowSavedLinksModal(false);
          loadData();
          handleOpenDoc(doc);
        }}
        onPasteNewLink={() => {
          setDriveLinkSaveMode(false);
          setShowDriveLinkModal(true);
        }}
      />

      {/* Folder Explorer Modal */}
      <FolderExplorerModal
        visible={showExplorerModal}
        workspace={activeWorkspace}
        theme={theme}
        onClose={() => setShowExplorerModal(false)}
        onOpenDoc={(doc) => {
          setShowExplorerModal(false);
          loadData();
          handleOpenDoc(doc);
        }}
        onWorkspaceChanged={(ws) => {
          setActiveWorkspace(ws);
          loadData();
        }}
      />

      {/* Cloud Transfer / Compare & Sync with Drive */}
      <CloudTransferModal
        visible={showCloudTransferModal}
        workspace={activeWorkspace}
        drive={drive}
        user={user}
        theme={theme}
        onClose={() => setShowCloudTransferModal(false)}
        onSyncCompleted={() => {
          loadData();
        }}
      />

      {/* Full-Screen Loading Overlay */}
      <Modal visible={loadingOverlay} transparent animationType="fade">
        <View style={styles.loadingOverlayBackdrop}>
          <View style={[styles.loadingOverlayCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <ActivityIndicator size="large" color={theme.primary} style={{ marginBottom: 14 }} />
            <Text style={[styles.loadingOverlayTitle, { color: theme.text }]}>{loadingOverlayMsg}</Text>
            <Text style={[styles.loadingOverlaySub, { color: theme.textMuted }]}>Please wait a moment…</Text>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 90,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  brandContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginRight: 8,
  },
  logoBadge: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  brandTagline: {
    fontSize: 12,
  },
  userChip: {
    flexShrink: 0,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  offlineChipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  signedInChipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  userChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  userAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    marginBottom: 20,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
  },
  section: {
    marginBottom: 22,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  viewAllText: {
    fontSize: 13,
    fontWeight: '600',
  },
  qaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
    marginBottom: 22,
  },
  qaCard: {
    width: '48.5%',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  qaIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  qaTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  qaDesc: {
    fontSize: 11,
    lineHeight: 15,
  },
  continueCard: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  continueCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  docKindCircle: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueMeta: {
    flex: 1,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 4,
  },
  formatBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  formatText: {
    fontSize: 10,
    fontWeight: '700',
  },
  continueName: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  continueSub: {
    fontSize: 12,
  },
  resumeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 38,
    borderRadius: 8,
  },
  resumeBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  wsRow: {
    gap: 10,
    paddingRight: 10,
  },
  wsCard: {
    width: 140,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  wsIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  wsTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  wsSub: {
    fontSize: 11,
  },
  savedLinksRow: {
    gap: 10,
    paddingRight: 10,
  },
  savedLinkCard: {
    width: 150,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  badgePill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginBottom: 6,
  },
  badgePillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  savedLinkTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  savedLinkSub: {
    fontSize: 11,
  },
  savedLinksEmptyCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  savedLinksEmptyLeft: {
    flex: 1,
  },
  savedLinksEmptyTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    marginBottom: 4,
  },
  savedLinksEmptySub: {
    fontSize: 12,
    lineHeight: 16,
  },
  savedLinksEmptyBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  savedLinksEmptyBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  recentsCount: {
    fontSize: 12,
  },
  docItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  docItemMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  docKindSmall: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  docItemMeta: {
    flex: 1,
  },
  docItemName: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  docItemSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  microBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  microBadgeText: {
    fontSize: 9,
    fontWeight: '700',
  },
  docItemSubText: {
    fontSize: 11,
  },
  deleteBtn: {
    padding: 8,
  },
  emptyBox: {
    padding: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 12,
    textAlign: 'center',
  },
  loadingOverlayBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingOverlayCard: {
    width: '100%',
    maxWidth: 320,
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  loadingOverlayTitle: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 6,
  },
  loadingOverlaySub: {
    fontSize: 13,
    textAlign: 'center',
  },
});
