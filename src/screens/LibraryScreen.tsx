import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Search,
  FolderPlus,
  Trash2,
  Cloud,
  HardDrive,
  RefreshCw,
  Bookmark,
  ExternalLink,
  Folder,
  FolderOpen,
  Plus,
  FileText,
  FileCode,
  Music,
  Video,
  FileSpreadsheet,
  Presentation,
  Link2,
  PanelLeft,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react-native';
import { Storage } from '../services/storage';
import { pickDocuments } from '../services/picker';
import { pickWorkspaceFolder, openFolderEntry, findFirstFileEntry, createDriveWorkspace } from '../services/folder';
import { openDriveResource } from '../services/gdrive';
import { Api } from '../services/api';
import { MobileDoc, ReaderSettings, SavedLink, WorkspaceFolder } from '../types';
import { THEMES } from '../theme/colors';
import { OpenDriveLinkModal } from '../components/OpenDriveLinkModal';
import { FolderExplorerModal } from '../components/FolderExplorerModal';

interface LibraryScreenProps {
  navigation: any;
  route: any;
  settings: ReaderSettings;
}

export const LibraryScreen: React.FC<LibraryScreenProps> = ({ navigation, route, settings }) => {
  const [tab, setTab] = useState<'local' | 'saved' | 'drive'>(route.params?.initialTab || 'local');
  const [docs, setDocs] = useState<MobileDoc[]>([]);
  const [savedLinks, setSavedLinks] = useState<SavedLink[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceFolder[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceFolder | null>(null);

  const [driveFiles, setDriveFiles] = useState<any[]>([]);
  const [driveConnected, setDriveConnected] = useState(false);
  const [driveFolderId, setDriveFolderId] = useState<string>('root');
  const [driveBreadcrumbs, setDriveBreadcrumbs] = useState<Array<{ id: string; name: string }>>([
    { id: 'root', name: 'My Drive' },
  ]);
  const [search, setSearch] = useState('');
  const [filterKind, setFilterKind] = useState<string>('all');
  const [loading, setLoading] = useState(false);

  // Modals
  const [showDriveLinkModal, setShowDriveLinkModal] = useState(false);
  const [driveLinkSaveMode, setDriveLinkSaveMode] = useState(false);
  const [showExplorerModal, setShowExplorerModal] = useState(false);

  const theme = THEMES[settings.theme];

  const loadData = async (folderId?: string, force = false) => {
    const targetFolder = folderId || driveFolderId;
    const [localDocs, links, wsList, status] = await Promise.all([
      Storage.getDocs(),
      Storage.getSavedLinks(),
      Storage.getWorkspaces(),
      Api.getDriveStatus(),
    ]);
    setDocs(localDocs);
    setSavedLinks(links);
    setWorkspaces(wsList);
    if (wsList.length > 0 && !activeWorkspace) {
      setActiveWorkspace(wsList[0]);
    }

    setDriveConnected(status.connected);
    if (status.connected && (tab === 'drive' || folderId)) {
      const files = await Api.listDriveFiles(targetFolder, force);
      setDriveFiles(files);
    }
  };

  useEffect(() => {
    loadData();
    const unsub = navigation.addListener('focus', () => {
      loadData();
      if (route.params?.initialTab) {
        setTab(route.params.initialTab);
      }
    });
    return unsub;
  }, [navigation, route.params?.initialTab]);

  // Lazy load Drive files only when user switches to Drive tab
  useEffect(() => {
    if (tab === 'drive' && driveConnected && driveFiles.length === 0) {
      setLoading(true);
      Api.listDriveFiles(driveFolderId).then((files) => {
        setDriveFiles(files);
      }).finally(() => setLoading(false));
    }
  }, [tab, driveConnected]);

  const handlePickFile = async () => {
    try {
      const picked = await pickDocuments();
      if (picked.length > 0) {
        for (const d of picked) {
          await Storage.saveDoc(d);
        }
        await loadData();
        navigation.navigate('Reader', { doc: picked[0], workspace: activeWorkspace || undefined });
      }
    } catch (e: any) {
      Alert.alert('Picker Error', e.message || 'Could not pick document.');
    }
  };

  const handlePickFolder = async () => {
    try {
      const ws = await pickWorkspaceFolder();
      if (ws) {
        setActiveWorkspace(ws);
        await loadData();
        const firstFile = findFirstFileEntry(ws.entries || []);
        if (firstFile) {
          try {
            const doc = await openFolderEntry(firstFile);
            navigation.navigate('Reader', { doc, workspace: ws, initialSidebarOpen: true });
            return;
          } catch (err: any) {
            console.warn('Could not open first file in folder:', err);
          }
        }
        setShowExplorerModal(true);
      }
    } catch (e: any) {
      Alert.alert('Folder Error', e.message || 'Could not open folder.');
    }
  };

  const handleDelete = (doc: MobileDoc) => {
    Alert.alert('Remove Document', `Remove "${doc.name}" from library?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await Storage.removeDoc(doc.id);
          await loadData();
        },
      },
    ]);
  };

  const handleDeleteSavedLink = (link: SavedLink) => {
    Alert.alert('Remove Saved Link', `Remove "${link.title}" from saved links?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await Storage.removeSavedLink(link.id);
          await loadData();
        },
      },
    ]);
  };

  const handleOpenDoc = (doc: MobileDoc) => {
    navigation.navigate('Reader', { doc });
  };

  const handleOpenSavedLink = async (link: SavedLink) => {
    setLoading(true);
    try {
      const serverUrl = await Storage.getServerUrl();
      const apiKey = await Storage.getDriveApiKey();
      const res = await openDriveResource(
        {
          id: link.folderId || link.fileId || '',
          hint: link.hint,
          resourceKey: link.resourceKey,
          originalUrl: link.url,
        },
        serverUrl,
        apiKey,
        link.title
      );
      if (res.doc) {
        handleOpenDoc(res.doc);
      }
    } catch (e: any) {
      Alert.alert('Open Error', e?.message || 'Could not open saved link.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDriveFolder = async (folder: { id: string; name: string }) => {
    // Instant cache check for immediate UI response
    const cached = await Api.listDriveFiles(folder.id, false);
    if (cached && cached.length > 0) {
      setDriveFiles(cached);
      setDriveFolderId(folder.id);
      setDriveBreadcrumbs((prev) => [...prev, folder]);
      return;
    }

    setLoading(true);
    try {
      const files = await Api.listDriveFiles(folder.id);
      setDriveFiles(files);
      setDriveFolderId(folder.id);
      setDriveBreadcrumbs((prev) => [...prev, folder]);
    } catch (e: any) {
      Alert.alert('Drive Error', e?.message || 'Could not load folder contents.');
    } finally {
      setLoading(false);
    }
  };

  const handleNavigateDriveBreadcrumb = async (index: number) => {
    if (index === driveBreadcrumbs.length - 1) return;
    const target = driveBreadcrumbs[index];
    setDriveBreadcrumbs((prev) => prev.slice(0, index + 1));
    setDriveFolderId(target.id);

    // Instant cache check for immediate back navigation
    const cached = await Api.listDriveFiles(target.id, false);
    if (cached && cached.length > 0) {
      setDriveFiles(cached);
      return;
    }

    setLoading(true);
    try {
      const files = await Api.listDriveFiles(target.id);
      setDriveFiles(files);
    } catch (e: any) {
      Alert.alert('Drive Error', e?.message || 'Could not load folder contents.');
    } finally {
      setLoading(false);
    }
  };

  const handleDriveItemPress = (item: any) => {
    const isFolder = item.mimeType === 'application/vnd.google-apps.folder' || item.mimeType?.includes('folder');
    if (isFolder) {
      handleOpenDriveFolder({ id: item.id, name: item.name });
    } else {
      handleOpenDriveFile(item);
    }
  };

  const handleOpenDriveFile = async (driveItem: any) => {
    setLoading(true);
    try {
      const isGoogleDoc = driveItem.mimeType?.includes('google-apps.document');
      const isGoogleSheet = driveItem.mimeType?.includes('google-apps.spreadsheet');
      const isGoogleSlide = driveItem.mimeType?.includes('google-apps.presentation');

      let exportMime: string | undefined;
      if (isGoogleDoc || isGoogleSlide) exportMime = 'application/pdf';
      else if (isGoogleSheet) exportMime = 'text/csv';

      const res = await Api.downloadDriveFile(driveItem.id, exportMime);
      if (res.isFolder) {
        await handleOpenDriveFolder({ id: res.folderId || driveItem.id, name: driveItem.name });
        return;
      }

      if (res.base64) {
        const mime = res.mimeType || driveItem.mimeType || '';
        const ext = (driveItem.name || '').split('.').pop()?.toLowerCase() || '';

        let kind: MobileDoc['kind'] = 'text';
        if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp', 'ico'].includes(ext) || mime.startsWith('image/')) kind = 'image';
        else if (ext === 'pdf' || mime.includes('pdf') || isGoogleDoc || isGoogleSlide) kind = 'pdf';
        else if (ext === 'docx' || mime.includes('wordprocessingml')) kind = 'docx';
        else if (ext === 'pptx' || mime.includes('presentationml')) kind = 'pptx';
        else if (['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'].includes(ext) || mime.startsWith('audio/')) kind = 'audio';
        else if (['mp4', 'webm', 'mov', 'mkv'].includes(ext) || mime.startsWith('video/')) kind = 'video';
        else if (ext === 'md' || ext === 'markdown') kind = 'markdown';
        else if (isGoogleSheet || ext === 'csv' || mime.includes('csv')) kind = 'text';

        const doc: MobileDoc = {
          id: `drive_${driveItem.id}`,
          name: driveItem.name,
          uri: `gdrive://${driveItem.id}`,
          mime,
          kind,
          isDrive: true,
          driveFileId: driveItem.id,
          lastOpenedAt: Date.now(),
          base64Data: res.base64,
        };

        await Storage.saveDoc(doc);
        await loadData();

        // Create Drive workspace representing the current folder for the sidebar explorer
        const currentCrumb = driveBreadcrumbs[driveBreadcrumbs.length - 1];
        const driveWs = createDriveWorkspace(driveFolderId, currentCrumb?.name || 'Google Drive', driveFiles);
        await Storage.saveWorkspace(driveWs);
        setActiveWorkspace(driveWs);

        navigation.navigate('Reader', { doc, workspace: driveWs, initialSidebarOpen: true });
      } else {
        Alert.alert('Download Failed', res.error || 'Could not retrieve file data from Google Drive.');
      }
    } catch (e: any) {
      Alert.alert('Open Error', e?.message || 'Failed to open file.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDriveFolderWorkspace = async () => {
    const currentCrumb = driveBreadcrumbs[driveBreadcrumbs.length - 1];
    const driveWs = createDriveWorkspace(driveFolderId, currentCrumb?.name || 'Google Drive', driveFiles);
    await Storage.saveWorkspace(driveWs);
    setActiveWorkspace(driveWs);

    const firstFile = driveFiles.find((f) => !f.mimeType?.includes('folder'));
    if (firstFile) {
      await handleOpenDriveFile(firstFile);
    } else {
      setShowExplorerModal(true);
    }
  };

  // Filter Local Docs
  const filteredLocalDocs = useMemo(() => {
    return docs.filter((d) => {
      const matchSearch = !search || d.name.toLowerCase().includes(search.toLowerCase());
      const matchKind = filterKind === 'all' || d.kind === filterKind;
      return matchSearch && matchKind;
    });
  }, [docs, search, filterKind]);

  // Filter Saved Links
  const filteredSavedLinks = useMemo(() => {
    return savedLinks.filter((l) => {
      return !search || l.title.toLowerCase().includes(search.toLowerCase()) || (l.collection && l.collection.toLowerCase().includes(search.toLowerCase()));
    });
  }, [savedLinks, search]);

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.safeArea, { backgroundColor: theme.bg }]}>
      <View style={styles.container}>
        {/* Top Header */}
        <View style={styles.topBar}>
          <Text style={[styles.title, { color: theme.text }]}>Library</Text>
          <View style={styles.topActionsRow}>
            {tab === 'local' && (
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: '#8b5cf618', borderColor: '#8b5cf640' }]}
                  onPress={handlePickFile}
                >
                  <FileText size={14} color="#8b5cf6" />
                  <Text style={[styles.actionBtnText, { color: '#8b5cf6' }]}>File</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: theme.primary + '18', borderColor: theme.primary + '40' }]}
                  onPress={handlePickFolder}
                >
                  <FolderOpen size={14} color={theme.primary} />
                  <Text style={[styles.actionBtnText, { color: theme.primary }]}>Folder</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: '#f59e0b18', borderColor: '#f59e0b40' }]}
                  onPress={() => setShowExplorerModal(true)}
                >
                  <PanelLeft size={14} color="#f59e0b" />
                  <Text style={[styles.actionBtnText, { color: '#f59e0b' }]}>Tree</Text>
                </TouchableOpacity>
              </View>
            )}
            {tab === 'drive' && driveConnected && (
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: '#10b98118', borderColor: '#10b98140' }]}
                  onPress={handleOpenDriveFolderWorkspace}
                >
                  <PanelLeft size={14} color="#10b981" />
                  <Text style={[styles.actionBtnText, { color: '#10b981' }]}>Tree</Text>
                </TouchableOpacity>
              </View>
            )}
            {tab === 'saved' && (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: theme.primary + '18', borderColor: theme.primary + '40' }]}
                onPress={() => {
                  setDriveLinkSaveMode(true);
                  setShowDriveLinkModal(true);
                }}
              >
                <Plus size={15} color={theme.primary} />
                <Text style={[styles.actionBtnText, { color: theme.primary }]}>Save Link</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* 3-Way Segmented Control */}
        <View style={[styles.segmentContainer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <TouchableOpacity
            style={[styles.segmentBtn, tab === 'local' && { backgroundColor: theme.primary }]}
            onPress={() => setTab('local')}
          >
            <HardDrive size={14} color={tab === 'local' ? '#ffffff' : theme.textSecondary} />
            <Text
              style={[styles.segmentText, { color: tab === 'local' ? '#ffffff' : theme.textSecondary }]}
              numberOfLines={1}
            >
              On Device
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.segmentBtn, tab === 'saved' && { backgroundColor: theme.primary }]}
            onPress={() => setTab('saved')}
          >
            <Bookmark size={14} color={tab === 'saved' ? '#ffffff' : theme.textSecondary} />
            <Text
              style={[styles.segmentText, { color: tab === 'saved' ? '#ffffff' : theme.textSecondary }]}
              numberOfLines={1}
            >
              {savedLinks.length > 0 ? `Saved (${savedLinks.length})` : 'Saved'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.segmentBtn, tab === 'drive' && { backgroundColor: theme.primary }]}
            onPress={() => setTab('drive')}
          >
            <Cloud size={14} color={tab === 'drive' ? '#ffffff' : theme.textSecondary} />
            <Text
              style={[styles.segmentText, { color: tab === 'drive' ? '#ffffff' : theme.textSecondary }]}
              numberOfLines={1}
            >
              Drive
            </Text>
          </TouchableOpacity>
        </View>

        {/* Search Box */}
        <View style={[styles.searchBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Search size={16} color={theme.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder={
              tab === 'local' ? 'Search local files…' : tab === 'saved' ? 'Search saved links or collections…' : 'Search Drive files…'
            }
            placeholderTextColor={theme.textMuted}
            value={search}
            onChangeText={setSearch}
          />
        </View>

        {/* TAB 1: ON DEVICE */}
        {tab === 'local' && (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.listContainer}>
            {/* Active Workspace Banner */}
            {activeWorkspace && (
              <TouchableOpacity
                style={[styles.workspaceBanner, { backgroundColor: '#f59e0b12', borderColor: '#f59e0b35' }]}
                onPress={async () => {
                  const firstFile = findFirstFileEntry(activeWorkspace.entries || []);
                  if (firstFile) {
                    try {
                      const doc = await openFolderEntry(firstFile);
                      navigation.navigate('Reader', { doc, workspace: activeWorkspace, initialSidebarOpen: true });
                      return;
                    } catch (e) {
                      console.warn('Could not open workspace first file:', e);
                    }
                  }
                  setShowExplorerModal(true);
                }}
              >
                <View style={styles.workspaceBannerLeft}>
                  <FolderOpen size={20} color="#f59e0b" />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.wsBannerTitle, { color: theme.text }]} numberOfLines={1}>
                      {activeWorkspace.name}
                    </Text>
                    <Text style={[styles.wsBannerSub, { color: theme.textMuted }]}>
                      {activeWorkspace.fileCount || 'Multiple'} files · Tap to open Workbench
                    </Text>
                  </View>
                </View>
                <Text style={[styles.wsBannerAction, { color: '#f59e0b' }]}>Open Workbench →</Text>
              </TouchableOpacity>
            )}

            {/* Filter Chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
              {['all', 'pdf', 'image', 'pptx', 'docx', 'audio', 'video', 'markdown', 'text'].map((k) => (
                <TouchableOpacity
                  key={k}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: filterKind === k ? theme.primary : theme.surface,
                      borderColor: filterKind === k ? theme.primary : theme.border,
                    },
                  ]}
                  onPress={() => setFilterKind(k)}
                >
                  <Text style={[styles.chipText, { color: filterKind === k ? '#ffffff' : theme.textSecondary }]}>
                    {k.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {filteredLocalDocs.length === 0 ? (
              <View style={[styles.emptyBox, { borderColor: theme.border }]}>
                <HardDrive size={36} color={theme.textMuted} />
                <Text style={[styles.emptyTitle, { color: theme.text }]}>No Local Files</Text>
                <Text style={[styles.emptyDesc, { color: theme.textMuted }]}>
                  Open a local directory or pick files from your device to read offline.
                </Text>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                  <TouchableOpacity
                    style={[styles.emptyBtn, { backgroundColor: '#f59e0b' }]}
                    onPress={handlePickFolder}
                  >
                    <FolderOpen size={15} color="#ffffff" style={{ marginRight: 6 }} />
                    <Text style={styles.emptyBtnText}>Open Folder</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.emptyBtn, { backgroundColor: theme.primary }]}
                    onPress={handlePickFile}
                  >
                    <Plus size={15} color="#ffffff" style={{ marginRight: 6 }} />
                    <Text style={styles.emptyBtnText}>Pick File</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              filteredLocalDocs.map((doc) => (
                <View
                  key={doc.id}
                  style={[styles.fileCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
                >
                  <TouchableOpacity
                    style={styles.cardMain}
                    onPress={() => handleOpenDoc(doc)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.kindBadge, { backgroundColor: theme.primary + '18' }]}>
                      <Text style={[styles.kindBadgeText, { color: theme.primary }]}>
                        {doc.kind.slice(0, 4).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.cardInfo}>
                      <Text style={[styles.fileName, { color: theme.text }]} numberOfLines={1}>
                        {doc.name}
                      </Text>
                      <Text style={[styles.fileMeta, { color: theme.textMuted }]}>
                        {doc.kind.toUpperCase()}
                        {doc.size ? ` · ${(doc.size / 1024).toFixed(1)} KB` : ''}
                      </Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(doc)}>
                    <Trash2 size={16} color={theme.textMuted} />
                  </TouchableOpacity>
                </View>
              ))
            )}
          </ScrollView>
        )}

        {/* TAB 2: SAVED LINKS */}
        {tab === 'saved' && (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.listContainer}>
            {filteredSavedLinks.length === 0 ? (
              <View style={[styles.emptyBox, { borderColor: theme.border }]}>
                <Bookmark size={36} color={theme.textMuted} />
                <Text style={[styles.emptyTitle, { color: theme.text }]}>No Saved Links</Text>
                <Text style={[styles.emptyDesc, { color: theme.textMuted }]}>
                  Bookmark references to shared Google Drive files or folders into collections.
                </Text>
                <TouchableOpacity
                  style={[styles.emptyBtn, { backgroundColor: theme.primary, marginTop: 12 }]}
                  onPress={() => {
                    setDriveLinkSaveMode(true);
                    setShowDriveLinkModal(true);
                  }}
                >
                  <Plus size={15} color="#ffffff" style={{ marginRight: 6 }} />
                  <Text style={styles.emptyBtnText}>Save a Link</Text>
                </TouchableOpacity>
              </View>
            ) : (
              filteredSavedLinks.map((link) => (
                <View
                  key={link.id}
                  style={[styles.fileCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
                >
                  <TouchableOpacity
                    style={styles.cardMain}
                    onPress={() => handleOpenSavedLink(link)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.kindBadge, { backgroundColor: '#8b5cf618' }]}>
                      <Bookmark size={18} color="#8b5cf6" />
                    </View>
                    <View style={styles.cardInfo}>
                      <Text style={[styles.fileName, { color: theme.text }]} numberOfLines={1}>
                        {link.title}
                      </Text>
                      <Text style={[styles.fileMeta, { color: theme.textMuted }]}>
                        Collection: {link.collection || 'General'} · Google {link.hint.toUpperCase()}
                      </Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => handleDeleteSavedLink(link)}
                  >
                    <Trash2 size={16} color={theme.textMuted} />
                  </TouchableOpacity>
                </View>
              ))
            )}
          </ScrollView>
        )}

        {/* TAB 3: GOOGLE DRIVE */}
        {tab === 'drive' && (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.listContainer}>
            {!driveConnected ? (
              <View style={[styles.driveConnectBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Cloud size={38} color={theme.primary} />
                <Text style={[styles.driveConnectTitle, { color: theme.text }]}>Google Drive Not Connected</Text>
                <Text style={[styles.driveConnectDesc, { color: theme.textMuted }]}>
                  Connect your Google Drive in Settings to browse cloud workspaces directly, or paste a public link in
                  Saved Links.
                </Text>
                <TouchableOpacity
                  style={[styles.driveConnectBtn, { backgroundColor: '#10b981' }]}
                  onPress={async () => {
                    try {
                      await Api.startGoogleAuth(true, async (data) => {
                        if (data.drive?.connected) {
                          setDriveConnected(true);
                          await loadData();
                        }
                      });
                    } catch (e: any) {
                      Alert.alert('Google Auth', e?.message || 'Could not start Google Drive connection');
                    }
                  }}
                >
                  <Cloud size={16} color="#ffffff" style={{ marginRight: 6 }} />
                  <Text style={[styles.driveConnectBtnText, { color: '#ffffff' }]}>Authorize Google Drive (OAuth)</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {/* Folder Breadcrumb & Back Navigation */}
                <View style={[styles.breadcrumbBar, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  {driveBreadcrumbs.length > 1 && (
                    <TouchableOpacity
                      style={[styles.backFolderBtn, { backgroundColor: theme.primary + '18' }]}
                      onPress={() => handleNavigateDriveBreadcrumb(driveBreadcrumbs.length - 2)}
                    >
                      <ChevronLeft size={16} color={theme.primary} />
                      <Text style={[styles.backFolderText, { color: theme.primary }]}>Back</Text>
                    </TouchableOpacity>
                  )}
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ alignItems: 'center' }} style={{ flex: 1 }}>
                    {driveBreadcrumbs.map((crumb, idx) => (
                      <View key={crumb.id + idx} style={{ flexDirection: 'row', alignItems: 'center' }}>
                        {idx > 0 && <Text style={{ color: theme.textMuted, marginHorizontal: 4 }}>/</Text>}
                        <TouchableOpacity
                          onPress={() => handleNavigateDriveBreadcrumb(idx)}
                          disabled={idx === driveBreadcrumbs.length - 1}
                        >
                          <Text
                            style={{
                              fontSize: 13,
                              color: idx === driveBreadcrumbs.length - 1 ? theme.text : theme.primary,
                              fontWeight: idx === driveBreadcrumbs.length - 1 ? '700' : '500',
                            }}
                            numberOfLines={1}
                          >
                            {crumb.name}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </ScrollView>
                  <TouchableOpacity
                    style={[styles.refreshFolderBtn, { backgroundColor: theme.primary + '14' }]}
                    onPress={async () => {
                      setLoading(true);
                      try {
                        const files = await Api.listDriveFiles(driveFolderId, true);
                        setDriveFiles(files);
                      } finally {
                        setLoading(false);
                      }
                    }}
                  >
                    <RefreshCw size={13} color={theme.primary} />
                  </TouchableOpacity>
                </View>

                {loading ? (
                  <ActivityIndicator size="large" color={theme.primary} style={{ marginTop: 40 }} />
                ) : driveFiles.length === 0 ? (
                  <View style={[styles.emptyBox, { borderColor: theme.border }]}>
                    <Folder size={36} color={theme.textMuted} />
                    <Text style={[styles.emptyTitle, { color: theme.text }]}>Folder Empty</Text>
                    <Text style={[styles.emptyDesc, { color: theme.textMuted }]}>
                      This Google Drive directory has no files or folders.
                    </Text>
                  </View>
                ) : (
                  driveFiles.map((item) => {
                    const isFolder = item.mimeType === 'application/vnd.google-apps.folder' || item.mimeType?.includes('folder');
                    return (
                      <View
                        key={item.id}
                        style={[styles.fileCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
                      >
                        <TouchableOpacity
                          style={styles.cardMain}
                          onPress={() => handleDriveItemPress(item)}
                          activeOpacity={0.7}
                        >
                          <View style={[styles.kindBadge, { backgroundColor: isFolder ? '#f59e0b18' : '#10b98118' }]}>
                            {isFolder ? <Folder size={18} color="#f59e0b" /> : <FileText size={18} color="#10b981" />}
                          </View>
                          <View style={styles.cardInfo}>
                            <Text style={[styles.fileName, { color: theme.text }]} numberOfLines={1}>
                              {item.name}
                            </Text>
                            <Text style={[styles.fileMeta, { color: theme.textMuted }]}>
                              {isFolder
                                ? 'Folder • Tap to open'
                                : item.mimeType?.includes('google-apps.document')
                                ? 'Google Doc • Auto-converts to PDF'
                                : item.mimeType?.includes('google-apps.spreadsheet')
                                ? 'Google Sheet • Auto-converts to CSV'
                                : 'Cloud Document'}
                            </Text>
                          </View>
                          {isFolder && <ChevronRight size={18} color={theme.textMuted} style={{ marginRight: 8 }} />}
                        </TouchableOpacity>
                      </View>
                    );
                  })
                )}
              </>
            )}
          </ScrollView>
        )}
      </View>

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
        onLinkSaved={() => {
          setShowDriveLinkModal(false);
          loadData();
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
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1, padding: 16 },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    flexWrap: 'wrap',
    gap: 8,
  },
  topActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: { fontSize: 24, fontWeight: '800' },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  actionBtnText: { fontSize: 13, fontWeight: '700' },
  segmentContainer: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 12,
    padding: 3,
    marginBottom: 12,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    borderRadius: 9,
  },
  segmentText: { fontSize: 12, fontWeight: '600' },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 40,
    marginBottom: 10,
  },
  searchInput: { flex: 1, fontSize: 13.5 },
  workspaceBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 12,
  },
  workspaceBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  wsBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  wsBannerSub: {
    fontSize: 11,
    marginTop: 2,
  },
  wsBannerAction: {
    fontSize: 12,
    fontWeight: '700',
  },
  chipsRow: { gap: 6, paddingBottom: 10 },
  chip: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 16,
    borderWidth: 1,
  },
  chipText: { fontSize: 11.5, fontWeight: '600' },
  listContainer: { paddingBottom: 100 },
  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  cardMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  kindBadge: {
    width: 38,
    height: 38,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  kindBadgeText: { fontSize: 10, fontWeight: '800' },
  cardInfo: { flex: 1 },
  fileName: { fontSize: 14, fontWeight: '600' },
  fileMeta: { fontSize: 11, marginTop: 2 },
  deleteBtn: { padding: 8 },
  emptyBox: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    gap: 6,
    marginTop: 20,
  },
  emptyTitle: { fontSize: 15, fontWeight: '600' },
  emptyDesc: { fontSize: 12, textAlign: 'center' },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  emptyBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  driveConnectBox: {
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    gap: 8,
    marginTop: 20,
  },
  driveConnectTitle: { fontSize: 17, fontWeight: '700', marginTop: 4 },
  driveConnectDesc: { fontSize: 12, textAlign: 'center', marginBottom: 6 },
  driveConnectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  driveConnectBtnText: { fontSize: 13, fontWeight: '700' },
  breadcrumbBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 12,
    gap: 8,
  },
  backFolderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 4,
  },
  backFolderText: {
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 2,
  },
  refreshFolderBtn: {
    padding: 6,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
});
