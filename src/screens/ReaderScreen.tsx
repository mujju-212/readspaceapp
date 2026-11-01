import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Modal,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { ArrowLeft, SlidersHorizontal, Bookmark as BookmarkIcon, PanelLeft, Folder, Maximize2 } from 'lucide-react-native';
import { HybridReader } from '../components/HybridReader';
import { FolderExplorerModal, WorkspaceExplorerView } from '../components/FolderExplorerModal';
import { Storage } from '../services/storage';
import { MobileDoc, ReaderSettings, WorkspaceFolder } from '../types';
import { THEMES, ThemeName } from '../theme/colors';

interface ReaderScreenProps {
  route: any;
  navigation: any;
  settings: ReaderSettings;
  onUpdateSettings: (s: Partial<ReaderSettings>) => void;
}

export const ReaderScreen: React.FC<ReaderScreenProps> = ({
  route,
  navigation,
  settings,
  onUpdateSettings,
}) => {
  const initialDoc: MobileDoc = route.params?.doc;
  const [currentDoc, setCurrentDoc] = useState<MobileDoc>(initialDoc);
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceFolder | null>(route.params?.workspace || null);
  const { width: windowWidth } = useWindowDimensions();
  const isDesktop = windowWidth >= 768;
  const [sidebarOpen, setSidebarOpen] = useState(
    route.params?.initialSidebarOpen !== undefined ? route.params.initialSidebarOpen : isDesktop
  );
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [isZenMode, setIsZenMode] = useState(Boolean(settings.zen));
  const [savedSidebarState, setSavedSidebarState] = useState(sidebarOpen);
  const theme = THEMES[settings.theme];

  // Sync zen setting if changed externally
  useEffect(() => {
    if (settings.zen !== undefined && settings.zen !== isZenMode) {
      setIsZenMode(settings.zen);
      if (settings.zen) {
        setSidebarOpen(false);
      }
    }
  }, [settings.zen]);

  const toggleZenMode = () => {
    if (!isZenMode) {
      setSavedSidebarState(sidebarOpen);
      setSidebarOpen(false);
      setIsZenMode(true);
      onUpdateSettings({ zen: true });
    } else {
      setIsZenMode(false);
      setSidebarOpen(savedSidebarState);
      onUpdateSettings({ zen: false });
    }
  };

  // Sync if doc param changes
  useEffect(() => {
    if (route.params?.doc && route.params.doc.id !== currentDoc?.id) {
      setCurrentDoc(route.params.doc);
    }
  }, [route.params?.doc]);

  // Sync if workspace param changes
  useEffect(() => {
    if (route.params?.workspace) {
      setActiveWorkspace(route.params.workspace);
    }
  }, [route.params?.workspace]);

  // Load active workspace if not provided
  useEffect(() => {
    if (!activeWorkspace) {
      Storage.getWorkspaces().then((list) => {
        if (list.length > 0) {
          if (currentDoc?.isDrive) {
            const driveWs = list.find((w) => w.isDrive);
            if (driveWs) {
              setActiveWorkspace(driveWs);
              return;
            }
          }
          setActiveWorkspace(list[0]);
        }
      });
    }
  }, [currentDoc?.isDrive]);

  // Check if bookmarked
  useEffect(() => {
    if (currentDoc?.id) {
      Storage.getBookmarks(currentDoc.id).then((b) => setIsBookmarked(b.length > 0));
    }
  }, [currentDoc?.id]);

  const handlePositionChange = (position: any) => {
    if (!currentDoc?.id) return;
    Storage.updatePosition(currentDoc.id, position);
    if (currentDoc.driveFileId) {
      void Storage.getSavedLinks().then((links) => {
        const matching = links.find((l) => l.fileId === currentDoc.driveFileId || l.folderId === currentDoc.driveFileId);
        if (matching) {
          void Storage.updateSavedLinkProgress(matching.id, { scroll: position.scroll, page: position.page });
        }
      });
    }
  };

  const handleToggleBookmark = async () => {
    if (!currentDoc) return;
    if (isBookmarked) {
      await Storage.removeBookmark(currentDoc.id);
      setIsBookmarked(false);
    } else {
      await Storage.addBookmark({
        id: `bm_${Date.now()}`,
        docId: currentDoc.id,
        title: currentDoc.name,
        createdAt: Date.now(),
      });
      setIsBookmarked(true);
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: isZenMode ? theme.bg : theme.panel }]}>
      {/* Zen Mode Floating Exit Pill */}
      {isZenMode ? (
        <TouchableOpacity
          style={[styles.zenExitBtn, { backgroundColor: theme.panel, borderColor: theme.border }]}
          onPress={toggleZenMode}
          activeOpacity={0.75}
          accessibilityLabel="Exit zen mode"
        >
          <Text style={[styles.zenExitText, { color: theme.muted }]}>✕ Exit zen</Text>
        </TouchableOpacity>
      ) : (
        /* Top Mobile App Bar */
        <View style={[styles.topBar, { backgroundColor: theme.panel, borderBottomColor: theme.border }]}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <ArrowLeft size={20} color={theme.fg} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.sidebarToggleBtn,
              sidebarOpen && { backgroundColor: theme.sel, borderRadius: 6 },
            ]}
            onPress={() => setSidebarOpen((prev: boolean) => !prev)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel={sidebarOpen ? 'Hide file tree' : 'Show file tree'}
          >
            <PanelLeft size={19} color={sidebarOpen ? theme.accent : theme.fg} />
          </TouchableOpacity>

          <View style={styles.titleArea}>
            <Text style={[styles.docTitle, { color: theme.fg }]} numberOfLines={1}>
              {currentDoc?.name || 'Document'}
            </Text>
            <View style={styles.badgeRow}>
              {currentDoc?.kind && (
                <View style={[styles.badge, { backgroundColor: theme.sel }]}>
                  <Text style={[styles.badgeText, { color: theme.accent }]}>
                    {currentDoc.kind.toUpperCase()}
                  </Text>
                </View>
              )}
              {currentDoc?.isDrive ? (
                <View style={[styles.badge, { backgroundColor: theme.sel }]}>
                  <Text style={[styles.badgeText, { color: theme.accent }]}>DRIVE</Text>
                </View>
              ) : activeWorkspace ? (
                <View style={[styles.badge, { backgroundColor: theme.sel }]}>
                  <Text style={[styles.badgeText, { color: theme.accent }]} numberOfLines={1}>
                    {activeWorkspace.name}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          <View style={styles.rightActions}>
            <TouchableOpacity
              style={styles.actionIconBtn}
              onPress={toggleZenMode}
              accessibilityLabel="Enter zen mode"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Maximize2 size={18} color={theme.fg} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionIconBtn}
              onPress={handleToggleBookmark}
            >
              <BookmarkIcon
                size={18}
                color={isBookmarked ? theme.accent : theme.muted}
                fill={isBookmarked ? theme.accent : 'transparent'}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionIconBtn}
              onPress={() => setShowSettingsModal(true)}
              accessibilityLabel="Reader settings"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <SlidersHorizontal size={18} color={theme.fg} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Main Workbench Body: Split on desktop/tablet, drawer on mobile */}
      {isDesktop ? (
        <View style={styles.workbenchRow}>
          {sidebarOpen && !isZenMode && (
            <View style={[styles.dockedSidebar, { backgroundColor: theme.panel, borderRightColor: theme.border }]}>
              <WorkspaceExplorerView
                workspace={activeWorkspace}
                theme={theme}
                currentDocUri={currentDoc?.uri || currentDoc?.name}
                onClose={() => setSidebarOpen(false)}
                onOpenDoc={(newDoc) => {
                  setCurrentDoc(newDoc);
                  void Storage.saveDoc(newDoc);
                }}
                onWorkspaceChanged={(ws) => {
                  setActiveWorkspace(ws);
                }}
                style={{ flex: 1 }}
              />
            </View>
          )}
          <View style={styles.readerPane}>
            {currentDoc ? (
              <HybridReader
                key={currentDoc.id || currentDoc.uri}
                doc={currentDoc}
                settings={settings}
                onPositionChange={handlePositionChange}
              />
            ) : (
              <View style={[styles.emptyPreview, { backgroundColor: theme.bg }]}>
                <Text style={{ color: theme.muted }}>Select a document from the sidebar to preview.</Text>
              </View>
            )}
          </View>
        </View>
      ) : (
        <View style={styles.readerContainer}>
          {currentDoc ? (
            <HybridReader
              key={currentDoc.id || currentDoc.uri}
              doc={currentDoc}
              settings={settings}
              onPositionChange={handlePositionChange}
            />
          ) : (
            <View style={[styles.emptyPreview, { backgroundColor: theme.bg }]}>
              <Text style={{ color: theme.muted }}>Select a document to preview.</Text>
            </View>
          )}

          {/* Mobile Workspace Tree Explorer Sidebar Drawer */}
          <FolderExplorerModal
            visible={sidebarOpen}
            workspace={activeWorkspace}
            theme={theme}
            currentDocUri={currentDoc?.uri || currentDoc?.name}
            onClose={() => setSidebarOpen(false)}
            onOpenDoc={(newDoc) => {
              setCurrentDoc(newDoc);
              setSidebarOpen(false);
              void Storage.saveDoc(newDoc);
            }}
            onWorkspaceChanged={(ws) => {
              setActiveWorkspace(ws);
            }}
          />
        </View>
      )}

      {/* Reader Settings Bottom Sheet */}
      <Modal
        visible={showSettingsModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowSettingsModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowSettingsModal(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={[styles.modalSheet, { backgroundColor: theme.card, borderColor: theme.border }]}
          >
            <Text style={[styles.modalTitle, { color: theme.fg }]}>Reader Appearance</Text>

            {/* Themes */}
            <Text style={[styles.sheetLabel, { color: theme.muted }]}>THEME</Text>
            <View style={styles.themesRow}>
              {(['ice', 'light', 'dark', 'sepia'] as ThemeName[]).map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[
                    styles.themePill,
                    { backgroundColor: THEMES[t].card, borderColor: THEMES[t].border },
                    settings.theme === t && { borderWidth: 2, borderColor: theme.accent },
                  ]}
                  onPress={() => onUpdateSettings({ theme: t })}
                >
                  <Text style={[styles.themePillText, { color: THEMES[t].fg }]}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Font Size */}
            <Text style={[styles.sheetLabel, { color: theme.muted }]}>FONT SIZE</Text>
            <View style={styles.fontSizeRow}>
              <TouchableOpacity
                style={[styles.fontBtn, { backgroundColor: theme.sel }]}
                onPress={() => onUpdateSettings({ fontSize: Math.max(12, settings.fontSize - 2) })}
              >
                <Text style={[styles.fontBtnText, { color: theme.accent }]}>A−</Text>
              </TouchableOpacity>
              <Text style={[styles.fontSizeLabel, { color: theme.fg }]}>{settings.fontSize}px</Text>
              <TouchableOpacity
                style={[styles.fontBtn, { backgroundColor: theme.sel }]}
                onPress={() => onUpdateSettings({ fontSize: Math.min(28, settings.fontSize + 2) })}
              >
                <Text style={[styles.fontBtnText, { color: theme.accent }]}>A+</Text>
              </TouchableOpacity>
            </View>

            {/* Zen Mode / Focus */}
            <Text style={[styles.sheetLabel, { color: theme.muted }]}>FOCUS</Text>
            <TouchableOpacity
              style={[
                styles.zenModeRow,
                { backgroundColor: isZenMode ? theme.sel : theme.panel, borderColor: isZenMode ? theme.accent : theme.border },
              ]}
              onPress={() => {
                toggleZenMode();
                setShowSettingsModal(false);
              }}
              activeOpacity={0.8}
            >
              <Maximize2 size={18} color={isZenMode ? theme.accent : theme.fg} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.zenModeTitle, { color: theme.fg }]}>Zen Mode</Text>
                <Text style={[styles.zenModeSubtitle, { color: theme.muted }]}>
                  Distraction-free reading without toolbars
                </Text>
              </View>
              <View style={[styles.zenStatusBadge, { backgroundColor: isZenMode ? theme.accent : theme.border }]}>
                <Text style={[styles.zenStatusBadgeText, { color: isZenMode ? theme.accentFg : theme.muted }]}>
                  {isZenMode ? 'ACTIVE' : 'OFF'}
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.closeModalBtn, { backgroundColor: theme.accent }]}
              onPress={() => setShowSettingsModal(false)}
            >
              <Text style={[styles.closeModalBtnText, { color: theme.accentFg }]}>Done</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  topBar: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    borderBottomWidth: 1,
  },
  backBtn: { padding: 6, marginRight: 2 },
  sidebarToggleBtn: { padding: 6, marginRight: 8 },
  titleArea: { flex: 1 },
  docTitle: { fontSize: 14, fontWeight: '700' },
  badgeRow: { flexDirection: 'row', gap: 6, marginTop: 2 },
  badge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
  badgeText: { fontSize: 9, fontWeight: '800' },
  rightActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionIconBtn: { padding: 6 },
  readerContainer: { flex: 1 },
  workbenchRow: {
    flex: 1,
    flexDirection: 'row',
  },
  dockedSidebar: {
    width: 280,
    borderRightWidth: 1,
    height: '100%',
  },
  readerPane: {
    flex: 1,
    height: '100%',
  },
  emptyPreview: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    padding: 24,
    paddingBottom: 36,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', marginBottom: 16 },
  sheetLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 8 },
  themesRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  themePill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  themePillText: { fontSize: 12, fontWeight: '600' },
  fontSizeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    marginBottom: 24,
  },
  fontBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fontBtnText: { fontSize: 16, fontWeight: '700' },
  fontSizeLabel: { fontSize: 15, fontWeight: '600' },
  closeModalBtn: {
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  closeModalBtnText: { fontSize: 14, fontWeight: '700' },
  zenExitBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 52 : 14,
    right: 14,
    zIndex: 99,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  zenExitText: {
    fontSize: 12,
    fontWeight: '700',
  },
  zenModeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 20,
  },
  zenModeTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  zenModeSubtitle: {
    fontSize: 11,
    marginTop: 2,
  },
  zenStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  zenStatusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
});
