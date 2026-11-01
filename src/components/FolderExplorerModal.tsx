import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Folder,
  FolderOpen,
  ChevronDown,
  ChevronRight,
  FileText,
  FileCode,
  Music,
  Video,
  X,
  Search,
  RefreshCw,
  FolderPlus,
  PanelLeftClose,
  AlertCircle,
  CloudUpload,
  Cloud,
  Image as ImageIcon,
} from 'lucide-react-native';
import { FolderEntry, MobileDoc, WorkspaceFolder, DriveAccount, UserAccount, DocKind } from '../types';
import { openFolderEntry, pickWorkspaceFolder, checkWorkspaceNeedReconnect, scanDirectoryUri } from '../services/folder';
import { Storage } from '../services/storage';
import { Api } from '../services/api';
import { ThemeColors } from '../theme/colors';
import { CloudTransferModal } from './CloudTransferModal';

interface FolderExplorerModalProps {
  visible: boolean;
  workspace: WorkspaceFolder | null;
  theme: ThemeColors;
  currentDocUri?: string;
  onClose: () => void;
  onOpenDoc: (doc: MobileDoc) => void;
  onWorkspaceChanged: (ws: WorkspaceFolder) => void;
}

function getIconForKind(kind: FolderEntry['kind'], color: string) {
  switch (kind) {
    case 'pdf':
      return <FileText size={15} color="#ef4444" />;
    case 'docx':
    case 'pptx':
      return <FileText size={15} color="#3b82f6" />;
    case 'image':
      return <ImageIcon size={15} color="#10b981" />;
    case 'markdown':
    case 'html':
      return <FileCode size={15} color="#06b6d4" />;
    case 'audio':
      return <Music size={15} color="#8b5cf6" />;
    case 'video':
      return <Video size={15} color="#ec4899" />;
    default:
      return <FileText size={15} color={color} />;
  }
}

export interface WorkspaceExplorerViewProps {
  workspace: WorkspaceFolder | null;
  theme: ThemeColors;
  currentDocUri?: string;
  onClose?: () => void;
  onOpenDoc: (doc: MobileDoc) => void;
  onWorkspaceChanged: (ws: WorkspaceFolder) => void;
  style?: any;
}

export const WorkspaceExplorerView: React.FC<WorkspaceExplorerViewProps> = ({
  workspace,
  theme,
  currentDocUri,
  onClose,
  onOpenDoc,
  onWorkspaceChanged,
  style,
}) => {
  const [filter, setFilter] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [openingUri, setOpeningUri] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [allWorkspaces, setAllWorkspaces] = useState<WorkspaceFolder[]>([]);
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [showCloudSync, setShowCloudSync] = useState(false);
  const [drive, setDrive] = useState<DriveAccount | null>(null);
  const [user, setUser] = useState<UserAccount | null>(null);

  // Load user and drive for cloud sync operations
  useEffect(() => {
    void Storage.getDriveAccount().then(setDrive);
    void Storage.getUserAccount().then(setUser);
  }, []);

  // Check if current workspace has expired web file session
  useEffect(() => {
    let mounted = true;
    void checkWorkspaceNeedReconnect(workspace).then((expired) => {
      if (mounted) setNeedsReconnect(expired);
    });
    return () => {
      mounted = false;
    };
  }, [workspace?.id, workspace?.entries?.length]);

  // Load all saved workspaces to enable switching
  useEffect(() => {
    void Storage.getWorkspaces().then(setAllWorkspaces);
  }, [workspace?.id]);

  const toggleDir = async (uri: string, entry?: FolderEntry) => {
    const willOpen = !expanded[uri];
    setExpanded((prev) => ({ ...prev, [uri]: willOpen }));

    if (willOpen && entry && (entry.isDrive || entry.driveFileId || entry.uri?.startsWith('gdrive://')) && (!entry.children || entry.children.length === 0)) {
      const folderId = entry.driveFileId || entry.uri.replace('gdrive://', '');
      try {
        const files = await Api.listDriveFiles(folderId);
        const children: FolderEntry[] = files.map((item) => {
          const isDir = item.mimeType === 'application/vnd.google-apps.folder' || item.mimeType?.includes('folder');
          const ext = (item.name || '').split('.').pop()?.toLowerCase() || '';
          let kind: DocKind | undefined = undefined;
          if (!isDir) {
            if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext) || item.mimeType?.startsWith('image/')) kind = 'image';
            else if (ext === 'pdf' || item.mimeType?.includes('pdf') || item.mimeType?.includes('google-apps.document') || item.mimeType?.includes('google-apps.presentation')) kind = 'pdf';
            else if (ext === 'docx' || item.mimeType?.includes('wordprocessingml')) kind = 'docx';
            else if (ext === 'pptx' || item.mimeType?.includes('presentationml')) kind = 'pptx';
            else if (['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'].includes(ext) || item.mimeType?.startsWith('audio/')) kind = 'audio';
            else if (['mp4', 'webm', 'mov', 'mkv'].includes(ext) || item.mimeType?.startsWith('video/')) kind = 'video';
            else if (ext === 'md' || ext === 'markdown') kind = 'markdown';
            else kind = 'text';
          }
          return {
            name: item.name,
            uri: `gdrive://${item.id}`,
            isDirectory: isDir,
            size: item.size ? Number(item.size) : undefined,
            mimeType: item.mimeType,
            kind,
            driveFileId: item.id,
            isDrive: true,
            workspaceId: entry.workspaceId,
          };
        });
        entry.children = children;
        if (workspace) {
          const updatedWs = { ...workspace, entries: [...(workspace.entries || [])] };
          onWorkspaceChanged(updatedWs);
        }
      } catch (e) {
        console.warn('Could not load subfolder files in explorer:', e);
      }
    } else if (willOpen && entry && entry.isDirectory && !entry.isDrive && (!entry.children || entry.children.length === 0)) {
      try {
        const subEntries = await scanDirectoryUri(entry.uri, 2);
        entry.children = subEntries;
        if (workspace) {
          const updatedWs = { ...workspace, entries: [...(workspace.entries || [])] };
          onWorkspaceChanged(updatedWs);
        }
      } catch (e) {
        console.warn('Could not load local subfolder in explorer:', e);
      }
    }
  };

  function findMatchingEntry(entries: FolderEntry[], targetName: string): FolderEntry | null {
    for (const e of entries) {
      if (!e.isDirectory && (e.name === targetName || e.name.toLowerCase() === targetName.toLowerCase())) {
        return e;
      }
      if (e.children && e.children.length > 0) {
        const found = findMatchingEntry(e.children, targetName);
        if (found) return found;
      }
    }
    return null;
  }

  const handlePickNewFolder = async (targetEntry?: FolderEntry) => {
    setScanning(true);
    try {
      const ws = await pickWorkspaceFolder();
      if (ws) {
        onWorkspaceChanged(ws);
        setNeedsReconnect(false);
        void Storage.getWorkspaces().then(setAllWorkspaces);

        // If user was trying to open a specific file, open it immediately
        if (targetEntry && ws.entries) {
          const matched = findMatchingEntry(ws.entries, targetEntry.name);
          if (matched) {
            try {
              const doc = await openFolderEntry(matched);
              onOpenDoc(doc);
            } catch (err: any) {
              console.warn('Could not auto-open target entry after pick:', err);
            }
          }
        }
      }
    } catch (e: any) {
      Alert.alert('Picker Error', e?.message || 'Could not pick directory.');
    } finally {
      setScanning(false);
    }
  };

  const handleRefresh = async () => {
    if (!workspace) return;
    setScanning(true);
    try {
      if (workspace.isDrive) {
        const folderId = workspace.driveFolderId || workspace.uri?.replace('gdrive://', '') || 'root';
        const files = await Api.listDriveFiles(folderId, true);
        const children: FolderEntry[] = files.map((item) => {
          const isDir = item.mimeType === 'application/vnd.google-apps.folder' || item.mimeType?.includes('folder');
          const ext = (item.name || '').split('.').pop()?.toLowerCase() || '';
          let kind: DocKind | undefined = undefined;
          if (!isDir) {
            if (ext === 'pdf' || item.mimeType?.includes('pdf') || item.mimeType?.includes('google-apps.document') || item.mimeType?.includes('google-apps.presentation')) kind = 'pdf';
            else if (ext === 'docx' || item.mimeType?.includes('wordprocessingml')) kind = 'docx';
            else if (ext === 'pptx' || item.mimeType?.includes('presentationml')) kind = 'pptx';
            else if (['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'].includes(ext) || item.mimeType?.startsWith('audio/')) kind = 'audio';
            else if (['mp4', 'webm', 'mov', 'mkv'].includes(ext) || item.mimeType?.startsWith('video/')) kind = 'video';
            else if (ext === 'md' || ext === 'markdown') kind = 'markdown';
            else kind = 'text';
          }
          return {
            name: item.name,
            uri: `gdrive://${item.id}`,
            isDirectory: isDir,
            size: item.size ? Number(item.size) : undefined,
            mimeType: item.mimeType,
            kind,
            driveFileId: item.id,
            isDrive: true,
            workspaceId: workspace.id,
          };
        });
        const updated: WorkspaceFolder = {
          ...workspace,
          entries: children,
          fileCount: children.filter((e) => !e.isDirectory).length,
        };
        onWorkspaceChanged(updated);
        await Storage.saveWorkspace(updated);
        return;
      }

      const saved = await Storage.getWorkspaces();
      const updated = saved.find((w) => w.id === workspace.id);
      if (updated) {
        onWorkspaceChanged(updated);
        void checkWorkspaceNeedReconnect(updated).then(setNeedsReconnect);
      }
    } catch (err) {
      console.warn('Could not refresh workspace:', err);
    } finally {
      setScanning(false);
    }
  };

  const handleOpenFile = async (entry: FolderEntry) => {
    setOpeningUri(entry.uri);
    try {
      const doc = await openFolderEntry(entry);
      onOpenDoc(doc);
    } catch (e: any) {
      if (e?.code === 'WORKSPACE_SESSION_EXPIRED' || e?.message?.includes('expired')) {
        setNeedsReconnect(true);
        Alert.alert(
          'Reconnect Folder Access',
          `Browser file access for "${entry.name}" has expired across reloads. Tap "Select Folder" to re-grant offline access and open immediately.`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Select Folder',
              onPress: () => {
                void handlePickNewFolder(entry);
              },
            },
          ]
        );
        return;
      }
      Alert.alert('Error Opening File', e?.message || 'Could not read file from device.');
    } finally {
      setOpeningUri(null);
    }
  };

  // Flatten & filter for search
  const filteredEntries = useMemo(() => {
    if (!filter.trim() || !workspace?.entries) return null;
    const q = filter.trim().toLowerCase();
    const result: FolderEntry[] = [];

    function searchIn(entries: FolderEntry[]) {
      for (const e of entries) {
        if (!e.isDirectory && e.name.toLowerCase().includes(q)) {
          result.push(e);
        }
        if (e.children) searchIn(e.children);
      }
    }
    searchIn(workspace.entries);
    return result;
  }, [filter, workspace]);

  const renderTree = (entries: FolderEntry[], depth = 0): React.ReactNode => {
    const sorted = [...entries].sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });

    return sorted.map((entry) => {
      if (entry.isDirectory) {
        const isOpen = !!expanded[entry.uri];
        const childCount = entry.children?.length ?? 0;
        return (
          <View key={entry.uri}>
            <TouchableOpacity
              style={[styles.treeRow, { paddingLeft: 10 + depth * 16 }]}
              onPress={() => toggleDir(entry.uri, entry)}
              activeOpacity={0.7}
            >
              <View style={styles.chevron}>
                {isOpen ? (
                  <ChevronDown size={14} color={theme.textMuted} />
                ) : (
                  <ChevronRight size={14} color={theme.textMuted} />
                )}
              </View>
              {isOpen ? (
                <FolderOpen size={16} color="#f59e0b" style={{ marginRight: 7 }} />
              ) : (
                <Folder size={16} color="#f59e0b" style={{ marginRight: 7 }} />
              )}
              <Text style={[styles.folderName, { color: theme.text }]} numberOfLines={1}>
                {entry.name}
              </Text>
              {childCount > 0 && (
                <Text style={[styles.childCount, { color: theme.textMuted }]}>{childCount}</Text>
              )}
            </TouchableOpacity>
            {isOpen && entry.children && (
              <View style={[styles.treeBranch, { borderLeftColor: theme.border + '60', marginLeft: 16 + depth * 16 }]}>
                {renderTree(entry.children, depth + 1)}
              </View>
            )}
          </View>
        );
      }

      const isBusy = openingUri === entry.uri;
      const isSelected =
        currentDocUri &&
        (currentDocUri === entry.uri ||
          currentDocUri === entry.name ||
          (entry.relativePath && currentDocUri.endsWith(entry.relativePath)));

      return (
        <TouchableOpacity
          key={entry.uri}
          style={[
            styles.treeRow,
            { paddingLeft: 22 + depth * 16 },
            isSelected && {
              backgroundColor: theme.primary + '18',
              borderLeftWidth: 3,
              borderLeftColor: theme.primary,
            },
          ]}
          onPress={() => handleOpenFile(entry)}
          disabled={isBusy}
          activeOpacity={0.7}
        >
          {isBusy ? (
            <ActivityIndicator size="small" color={theme.primary} style={{ marginRight: 7 }} />
          ) : (
            <View style={{ marginRight: 7 }}>{getIconForKind(entry.kind, theme.primary)}</View>
          )}
          <Text
            style={[
              styles.fileName,
              { color: isSelected ? theme.primary : theme.text },
              isSelected && { fontWeight: '700' },
            ]}
            numberOfLines={1}
          >
            {entry.name}
          </Text>
          {entry.kind && (
            <View style={[styles.kindBadge, { backgroundColor: theme.primary + '14' }]}>
              <Text style={[styles.kindText, { color: theme.primary }]}>{entry.kind.toUpperCase()}</Text>
            </View>
          )}
        </TouchableOpacity>
      );
    });
  };

  return (
    <View style={[styles.viewContainer, { backgroundColor: theme.surface }, style]}>
      {/* Top Explorer Header Bar */}
      <View style={[styles.drawerHeader, { borderBottomColor: theme.border }]}>
        <View style={styles.headerTitleRow}>
          <View style={styles.titleWithIcon}>
            <Folder size={14} color={theme.primary} style={{ marginRight: 6 }} />
            <Text style={[styles.explorerTag, { color: theme.textMuted }]}>WORKSPACE EXPLORER</Text>
          </View>
          <View style={styles.headerIcons}>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={handleRefresh}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <RefreshCw size={14} color={theme.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => handlePickNewFolder()}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <FolderPlus size={15} color={theme.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => setShowCloudSync(true)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <CloudUpload size={16} color="#10b981" />
            </TouchableOpacity>
            {onClose && (
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={onClose}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <PanelLeftClose size={17} color={theme.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Current Workspace Folder Badge */}
        <View style={[styles.workspaceCard, { backgroundColor: theme.bg, borderColor: theme.border }]}>
          <View style={[styles.iconWrap, { backgroundColor: workspace?.isDrive ? '#10b98120' : '#f59e0b20' }]}>
            {workspace?.isDrive ? (
              <Cloud size={18} color="#10b981" />
            ) : (
              <Folder size={18} color="#f59e0b" />
            )}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.wsTitle, { color: theme.text }]} numberOfLines={1}>
              {workspace?.name || 'Local Folder'}
            </Text>
            <Text style={[styles.wsSubtitle, { color: theme.textMuted }]}>
              {workspace?.isDrive
                ? `${workspace?.fileCount ?? 0} item(s) • Google Drive Workspace`
                : workspace?.fileCount !== undefined
                ? `${workspace.fileCount} file(s) in workspace`
                : 'Folder view'}
            </Text>
          </View>
        </View>

        {/* Reconnect Banner when session expired */}
        {needsReconnect && (
          <TouchableOpacity
            style={[styles.reconnectBanner, { backgroundColor: '#fef3c7', borderColor: '#f59e0b' }]}
            onPress={() => handlePickNewFolder()}
            activeOpacity={0.8}
          >
            <AlertCircle size={15} color="#d97706" style={{ marginRight: 8 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.reconnectBannerTitle}>Browser Session Expired</Text>
              <Text style={styles.reconnectBannerSub}>Tap to reconnect folder & enable offline files</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Multi-workspace Switcher Pills */}
        {allWorkspaces.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.wsPillsScroll}>
            {allWorkspaces.map((ws) => {
              const isActive = workspace?.id === ws.id;
              return (
                <TouchableOpacity
                  key={ws.id}
                  style={[
                    styles.wsPill,
                    {
                      borderColor: isActive ? theme.primary : theme.border,
                      backgroundColor: isActive ? theme.primary + '18' : theme.bg,
                    },
                  ]}
                  onPress={() => onWorkspaceChanged(ws)}
                >
                  <Folder size={11} color={isActive ? theme.primary : theme.textMuted} style={{ marginRight: 4 }} />
                  <Text
                    style={[
                      styles.wsPillText,
                      { color: isActive ? theme.primary : theme.textMuted },
                      isActive && { fontWeight: '700' },
                    ]}
                    numberOfLines={1}
                  >
                    {ws.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* Search Filter Input */}
        <View style={[styles.searchBox, { backgroundColor: theme.bg, borderColor: theme.border }]}>
          <Search size={14} color={theme.textMuted} style={{ marginRight: 6 }} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Filter files in tree…"
            placeholderTextColor={theme.textMuted}
            value={filter}
            onChangeText={setFilter}
          />
          {filter.length > 0 && (
            <TouchableOpacity onPress={() => setFilter('')}>
              <X size={14} color={theme.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Tree Scroll View */}
      <ScrollView style={styles.treeScroll} showsVerticalScrollIndicator={false}>
        {filteredEntries ? (
          filteredEntries.length === 0 ? (
            <View style={styles.emptyView}>
              <Text style={[styles.emptyText, { color: theme.textMuted }]}>No matching files found.</Text>
            </View>
          ) : (
            filteredEntries.map((e) => {
              const isSelected =
                currentDocUri &&
                (currentDocUri === e.uri || currentDocUri === e.name || (e.relativePath && currentDocUri.endsWith(e.relativePath)));
              return (
                <TouchableOpacity
                  key={e.uri}
                  style={[
                    styles.treeRow,
                    { paddingLeft: 12 },
                    isSelected && {
                      backgroundColor: theme.primary + '18',
                      borderLeftWidth: 3,
                      borderLeftColor: theme.primary,
                    },
                  ]}
                  onPress={() => handleOpenFile(e)}
                >
                  <View style={{ marginRight: 7 }}>{getIconForKind(e.kind, theme.primary)}</View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.fileName,
                        { color: isSelected ? theme.primary : theme.text },
                        isSelected && { fontWeight: '700' },
                      ]}
                      numberOfLines={1}
                    >
                      {e.name}
                    </Text>
                    {e.relativePath && e.relativePath !== e.name && (
                      <Text style={[styles.breadcrumb, { color: theme.textMuted }]} numberOfLines={1}>
                        {e.relativePath}
                      </Text>
                    )}
                  </View>
                  {e.kind && (
                    <View style={[styles.kindBadge, { backgroundColor: theme.primary + '14' }]}>
                      <Text style={[styles.kindText, { color: theme.primary }]}>{e.kind.toUpperCase()}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })
          )
        ) : workspace?.entries && workspace.entries.length > 0 ? (
          renderTree(workspace.entries)
        ) : (
          <View style={styles.emptyView}>
            <Text style={[styles.emptyText, { color: theme.textMuted }]}>This folder appears to be empty.</Text>
          </View>
        )}
      </ScrollView>

      {/* Bottom Action Footer */}
      <View style={[styles.drawerFooter, { borderTopColor: theme.border }]}>
        <TouchableOpacity
          style={[styles.pickFolderBtn, { borderColor: theme.primary, backgroundColor: theme.primary + '10' }]}
          onPress={() => handlePickNewFolder()}
          disabled={scanning}
        >
          {scanning ? (
            <ActivityIndicator size="small" color={theme.primary} />
          ) : (
            <>
              <FolderOpen size={15} color={theme.primary} style={{ marginRight: 6 }} />
              <Text style={[styles.pickFolderBtnText, { color: theme.primary }]}>
                Open Another Local Folder
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Drive Sync & Comparison Modal */}
      <CloudTransferModal
        visible={showCloudSync}
        workspace={workspace}
        drive={drive}
        user={user}
        theme={theme}
        onClose={() => setShowCloudSync(false)}
        onSyncCompleted={() => {
          void Storage.getDriveAccount().then(setDrive);
        }}
      />
    </View>
  );
};

export const FolderExplorerModal: React.FC<FolderExplorerModalProps> = ({
  visible,
  workspace,
  theme,
  currentDocUri,
  onClose,
  onOpenDoc,
  onWorkspaceChanged,
}) => {
  const insets = useSafeAreaInsets();
  const screenWidth = Dimensions.get('window').width;
  const drawerWidth = Math.min(340, Math.max(280, screenWidth * 0.85));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        {/* Left Sidebar Drawer */}
        <View
          style={[
            styles.drawer,
            {
              width: drawerWidth,
              backgroundColor: theme.surface,
              borderRightColor: theme.border,
              paddingTop: Math.max(insets.top, 14),
              paddingBottom: Math.max(insets.bottom, 14),
            },
          ]}
        >
          <WorkspaceExplorerView
            workspace={workspace}
            theme={theme}
            currentDocUri={currentDocUri}
            onClose={onClose}
            onOpenDoc={(doc) => {
              onClose();
              onOpenDoc(doc);
            }}
            onWorkspaceChanged={onWorkspaceChanged}
            style={{ flex: 1 }}
          />
        </View>

        {/* Scrim / Backdrop on the right */}
        <TouchableOpacity style={styles.scrim} activeOpacity={1} onPress={onClose} />
      </View>
    </Modal>
  );
};

export const FolderExplorerDrawer = FolderExplorerModal;

const styles = StyleSheet.create({
  viewContainer: {
    flex: 1,
    flexDirection: 'column',
  },
  modalRoot: {
    flex: 1,
    flexDirection: 'row',
  },
  drawer: {
    height: '100%',
    borderRightWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 20,
    display: 'flex',
    flexDirection: 'column',
  },
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  drawerHeader: {
    paddingHorizontal: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  headerTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  titleWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  explorerTag: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  headerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBtn: {
    padding: 5,
    borderRadius: 6,
  },
  workspaceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
    gap: 8,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wsTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  wsSubtitle: {
    fontSize: 11,
    marginTop: 1,
  },
  reconnectBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 7,
    borderWidth: 1,
    marginBottom: 8,
  },
  reconnectBannerTitle: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#92400e',
  },
  reconnectBannerSub: {
    fontSize: 10.5,
    color: '#b45309',
  },
  wsPillsScroll: {
    marginBottom: 8,
    maxHeight: 28,
  },
  wsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1,
    marginRight: 6,
  },
  wsPillText: {
    fontSize: 11,
    maxWidth: 100,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 34,
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    paddingVertical: 0,
  },
  treeScroll: {
    flex: 1,
    paddingVertical: 6,
  },
  treeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 34,
    paddingRight: 10,
  },
  chevron: {
    width: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  folderName: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  fileName: {
    fontSize: 12.5,
    flex: 1,
  },
  childCount: {
    fontSize: 10.5,
    marginRight: 4,
    fontWeight: '500',
  },
  treeBranch: {
    borderLeftWidth: 1,
  },
  kindBadge: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 6,
  },
  kindText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  breadcrumb: {
    fontSize: 10,
    marginTop: 1,
  },
  emptyView: {
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  drawerFooter: {
    padding: 10,
    borderTopWidth: 1,
  },
  pickFolderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 38,
    borderRadius: 8,
    borderWidth: 1,
  },
  pickFolderBtnText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
});
