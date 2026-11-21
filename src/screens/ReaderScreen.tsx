import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  useWindowDimensions,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  SlidersHorizontal,
  Bookmark as BookmarkIcon,
  PanelLeft,
  Folder,
  Maximize2,
  Plus,
  X,
  FileText,
  FileCode,
  Image as ImageIcon,
  Music,
  Video,
  Download,
  BookOpen,
  Scroll,
  Sun,
  AlignLeft,
  AlignJustify,
} from 'lucide-react-native';
import { HybridReader } from '../components/HybridReader';
import { FolderExplorerModal, WorkspaceExplorerView } from '../components/FolderExplorerModal';
import { Storage } from '../services/storage';
import { DriveDownloadService } from '../services/driveDownload';
import { pickDocuments } from '../services/picker';
import { MobileDoc, ReaderSettings, WorkspaceFolder } from '../types';
import { THEMES, ThemeName } from '../theme/colors';

function getTabIconForKind(kind?: MobileDoc['kind'], active = false, accent = '#2563eb') {
  const size = 13;
  switch (kind) {
    case 'pdf':
      return <FileText size={size} color="#ef4444" />;
    case 'docx':
    case 'pptx':
      return <FileText size={size} color="#3b82f6" />;
    case 'image':
      return <ImageIcon size={size} color="#10b981" />;
    case 'audio':
      return <Music size={size} color="#8b5cf6" />;
    case 'video':
      return <Video size={size} color="#ec4899" />;
    case 'markdown':
    case 'html':
      return <FileCode size={size} color="#06b6d4" />;
    default:
      return <FileText size={size} color={active ? accent : '#64748b'} />;
  }
}

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
  const [openTabs, setOpenTabs] = useState<MobileDoc[]>(initialDoc ? [initialDoc] : []);
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceFolder | null>(route.params?.workspace || null);
  const { width: windowWidth } = useWindowDimensions();
  const isDesktop = windowWidth >= 768;
  const [sidebarOpen, setSidebarOpen] = useState(
    route.params?.initialSidebarOpen !== undefined ? route.params.initialSidebarOpen : isDesktop
  );
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isZenMode, setIsZenMode] = useState(Boolean(settings.zen));
  const [savedSidebarState, setSavedSidebarState] = useState(sidebarOpen);
  const theme = THEMES[settings.theme];
  const insets = useSafeAreaInsets();
  const lastPositionSaveRef = useRef(0);

  // Preload recent documents to populate the tab switcher bar
  useEffect(() => {
    Storage.getDocs().then((recentList) => {
      if (recentList && recentList.length > 0) {
        setOpenTabs((prev) => {
          const map = new Map<string, MobileDoc>();
          if (currentDoc) map.set(currentDoc.id, currentDoc);
          for (const d of prev) map.set(d.id, d);
          for (const d of recentList.slice(0, 8)) {
            if (!map.has(d.id)) map.set(d.id, d);
          }
          return Array.from(map.values());
        });
      }
    });
  }, []);

  const handleSelectTab = (tabDoc: MobileDoc) => {
    if (tabDoc.id === currentDoc?.id) return;
    setCurrentDoc(tabDoc);
    void Storage.saveDoc(tabDoc);
    // Keep the switcher in most-recently-used order
    setOpenTabs((prev) =>
      [tabDoc, ...prev.filter((t) => t.id !== tabDoc.id)].slice(0, 8)
    );
  };

  // Central open-doc handler so files opened from the explorer sidebar also
  // land in the "recently open" switcher (previously they were skipped,
  // making the nav bar fall out of sync with what you were reading).
  const openDocInReader = (newDoc: MobileDoc) => {
    setCurrentDoc(newDoc);
    void Storage.saveDoc(newDoc);
    setOpenTabs((prev) => {
      const deduped = prev.filter((t) => t.id !== newDoc.id);
      return [newDoc, ...deduped].slice(0, 8);
    });
  };

  const handleCloseTab = (e: any, tabId: string) => {
    if (e && e.stopPropagation) e.stopPropagation();
    setOpenTabs((prev) => {
      const remaining = prev.filter((d) => d.id !== tabId);
      if (tabId === currentDoc?.id) {
        if (remaining.length > 0) {
          setCurrentDoc(remaining[0]);
        } else {
          navigation.goBack();
        }
      }
      return remaining;
    });
  };

  const handleOpenNewFile = async () => {
    try {
      const picked = await pickDocuments();
      if (picked && picked.length > 0) {
        const newDoc = picked[0];
        await Storage.saveDoc(newDoc);
        setOpenTabs((prev) => {
          const existing = prev.find((t) => t.id === newDoc.id);
          if (existing) return prev;
          return [newDoc, ...prev];
        });
        setCurrentDoc(newDoc);
      }
    } catch (err: any) {
      console.warn('Could not pick new file:', err);
    }
  };

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

  // Scrolling fires a position message on nearly every frame — throttle the
  // AsyncStorage write (page changes are still always saved) so long reads
  // with several files open stay smooth.
  const handlePositionChange = (position: any) => {
    if (!currentDoc?.id) return;
    const now = Date.now();
    if (position?.page === undefined && now - lastPositionSaveRef.current < 700) return;
    lastPositionSaveRef.current = now;
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
      Alert.alert('Removed', `"${currentDoc.name}" removed from saved files.`);
    } else {
      await Storage.addBookmark({
        id: `bm_${Date.now()}`,
        docId: currentDoc.id,
        title: currentDoc.name,
        kind: currentDoc.kind,
        uri: currentDoc.uri,
        size: currentDoc.size,
        mime: currentDoc.mime,
        isDrive: currentDoc.isDrive,
        driveFileId: currentDoc.driveFileId,
        base64Data: currentDoc.base64Data,
        createdAt: Date.now(),
      });
      setIsBookmarked(true);
      Alert.alert('Saved to Bookmarks', `"${currentDoc.name}" is saved. You can find it under the Saved tab in your Library.`);
    }
  };

  const handleDownloadCurrentDoc = async () => {
    if (!currentDoc || isDownloading) return;
    const fileId = currentDoc.driveFileId || currentDoc.id.replace('drive_', '').replace('gdrive_', '');
    if (!fileId) return;

    setIsDownloading(true);
    try {
      await DriveDownloadService.downloadSingleFile({
        fileId,
        fileName: currentDoc.name,
        mimeType: currentDoc.mime,
      });
      Alert.alert('Download Complete', `"${currentDoc.name}" has been downloaded to local device storage.`);
    } catch (err: any) {
      Alert.alert('Download Failed', err?.message || 'Could not save file locally.');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={[styles.safeArea, { backgroundColor: isZenMode ? theme.bg : theme.panel }]}>
      {/* Zen Mode Floating Exit Pill — anchored below the status-bar inset so it
          can never be clipped by the notch/system bar. */}
      {isZenMode ? (
        <TouchableOpacity
          style={[styles.zenExitBtn, { backgroundColor: theme.panel, borderColor: theme.border, top: insets.top + 10 }]}
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

            {currentDoc?.isDrive && (
              <TouchableOpacity
                style={styles.actionIconBtn}
                onPress={handleDownloadCurrentDoc}
                disabled={isDownloading}
                accessibilityLabel="Download file locally"
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Download size={18} color={theme.fg} />
              </TouchableOpacity>
            )}

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

      {/* File Switcher Tab Bar */}
      {!isZenMode && (
        <View style={[styles.tabBarContainer, { backgroundColor: theme.panel, borderBottomColor: theme.border }]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabScrollContent}
          >
            {openTabs.map((tab) => {
              const active = tab.id === currentDoc?.id;
              return (
                <TouchableOpacity
                  key={tab.id}
                  style={[
                    styles.tabItem,
                    {
                      backgroundColor: active ? theme.sel : (theme.bg || '#f8fafc'),
                      borderColor: active ? theme.accent : theme.border,
                    },
                  ]}
                  onPress={() => handleSelectTab(tab)}
                  activeOpacity={0.7}
                >
                  <View style={styles.tabIconWrap}>
                    {getTabIconForKind(tab.kind, active, theme.accent)}
                  </View>
                  <Text
                    style={[
                      styles.tabTitle,
                      { color: active ? theme.accent : theme.fg, fontWeight: active ? '700' : '500' },
                    ]}
                    numberOfLines={1}
                  >
                    {tab.name}
                  </Text>
                  {openTabs.length > 1 && (
                    <TouchableOpacity
                      style={[styles.tabCloseBtn, { backgroundColor: active ? theme.accent + '20' : 'transparent' }]}
                      onPress={(e) => handleCloseTab(e, tab.id)}
                      hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
                      accessibilityLabel={`Close ${tab.name}`}
                    >
                      <X size={11} color={active ? theme.accent : theme.muted} />
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              );
            })}

            {/* Load New File Button */}
            <TouchableOpacity
              style={[styles.newTabBtn, { backgroundColor: theme.sel, borderColor: theme.border }]}
              onPress={handleOpenNewFile}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Open new file"
            >
              <Plus size={13} color={theme.accent} />
              <Text style={[styles.newTabText, { color: theme.accent }]}>+ File</Text>
            </TouchableOpacity>
          </ScrollView>
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
                  openDocInReader(newDoc);
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
              openDocInReader(newDoc);
              setSidebarOpen(false);
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
            style={[styles.modalSheet, { backgroundColor: theme.card, borderColor: theme.border, maxHeight: '88%' }]}
          >
            <View style={styles.sheetHeader}>
              <Text style={[styles.modalTitle, { color: theme.fg }]}>Reader Appearance</Text>
              <TouchableOpacity
                onPress={() => setShowSettingsModal(false)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <X size={18} color={theme.muted} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
              {/* Reading Mode (Google Play Books 3D Curl vs Continuous Scroll) */}
              <Text style={[styles.sheetLabel, { color: theme.muted }]}>PAGE TURNING MODE</Text>
              <View style={styles.modeRow}>
                <TouchableOpacity
                  style={[
                    styles.modeCard,
                    { backgroundColor: theme.panel, borderColor: theme.border },
                    (settings.readingMode || 'scroll') === 'scroll' && { borderColor: theme.accent, backgroundColor: theme.sel },
                  ]}
                  onPress={() => onUpdateSettings({ readingMode: 'scroll' })}
                >
                  <Scroll size={18} color={(settings.readingMode || 'scroll') === 'scroll' ? theme.accent : theme.muted} />
                  <Text style={[styles.modeCardTitle, { color: (settings.readingMode || 'scroll') === 'scroll' ? theme.accent : theme.fg }]}>
                    Continuous
                  </Text>
                  <Text style={[styles.modeCardDesc, { color: theme.muted }]}>
                    Standard vertical continuous document scroll
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.modeCard,
                    { backgroundColor: theme.panel, borderColor: theme.border },
                    settings.readingMode === 'curl' && { borderColor: theme.accent, backgroundColor: theme.sel },
                  ]}
                  onPress={() => onUpdateSettings({ readingMode: 'curl' })}
                >
                  <BookOpen size={18} color={settings.readingMode === 'curl' ? theme.accent : theme.muted} />
                  <Text style={[styles.modeCardTitle, { color: settings.readingMode === 'curl' ? theme.accent : theme.fg }]}>
                    3D Page Curl
                  </Text>
                  <Text style={[styles.modeCardDesc, { color: theme.muted }]}>
                    Curved 3D page curl with spine crease & shadows
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Night Light Amber Warmth (Google Play Books Night Light Shader replica) */}
              <View style={styles.labelWithBadge}>
                <Text style={[styles.sheetLabel, { color: theme.muted, marginBottom: 0 }]}>NIGHT LIGHT (WARMTH)</Text>
                <Text style={[styles.sliderValueText, { color: (settings.nightLight || 0) > 0 ? '#d97706' : theme.muted }]}>
                  {(settings.nightLight || 0) > 0 ? `${settings.nightLight}% Warmth` : 'Off'}
                </Text>
              </View>
              <View style={styles.nightLightRow}>
                {[0, 25, 50, 75, 100].map((val) => {
                  const active = (settings.nightLight || 0) === val;
                  return (
                    <TouchableOpacity
                      key={val}
                      style={[
                        styles.nightLightPill,
                        {
                          backgroundColor: val === 0 ? theme.panel : `rgba(251, 191, 36, ${0.12 + (val / 100) * 0.3})`,
                          borderColor: active ? '#f59e0b' : theme.border,
                        },
                        active && { borderWidth: 2 },
                      ]}
                      onPress={() => onUpdateSettings({ nightLight: val })}
                    >
                      {val > 0 && <Sun size={12} color={active ? '#d97706' : '#b45309'} style={{ marginRight: 3 }} />}
                      <Text
                        style={[
                          styles.nightLightText,
                          { color: active ? (val === 0 ? theme.accent : '#d97706') : theme.fg },
                        ]}
                      >
                        {val === 0 ? 'Off' : `${val}%`}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

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

              {/* Font Family */}
              <Text style={[styles.sheetLabel, { color: theme.muted }]}>TYPEFACE</Text>
              <View style={styles.fontFamilyRow}>
                {[
                  { key: 'system', label: 'System' },
                  { key: 'serif', label: 'Serif' },
                  { key: 'mono', label: 'Mono' },
                  { key: 'dyslexic', label: 'Dyslexic' },
                ].map((f) => {
                  const active = (settings.fontFamily || 'system') === f.key;
                  return (
                    <TouchableOpacity
                      key={f.key}
                      style={[
                        styles.fontFamilyPill,
                        { backgroundColor: theme.panel, borderColor: theme.border },
                        active && { borderColor: theme.accent, backgroundColor: theme.sel },
                      ]}
                      onPress={() => onUpdateSettings({ fontFamily: f.key as any })}
                    >
                      <Text
                        style={[
                          styles.fontFamilyText,
                          { color: active ? theme.accent : theme.fg },
                        ]}
                      >
                        {f.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Font Size & Alignment */}
              <View style={styles.dualControlsRow}>
                <View style={{ flex: 1, marginRight: 8 }}>
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
                      onPress={() => onUpdateSettings({ fontSize: Math.min(32, settings.fontSize + 2) })}
                    >
                      <Text style={[styles.fontBtnText, { color: theme.accent }]}>A+</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={[styles.sheetLabel, { color: theme.muted }]}>ALIGNMENT</Text>
                  <View style={styles.alignRow}>
                    <TouchableOpacity
                      style={[
                        styles.alignBtn,
                        { backgroundColor: theme.panel, borderColor: theme.border },
                        (settings.textAlign || 'left') === 'left' && { borderColor: theme.accent, backgroundColor: theme.sel },
                      ]}
                      onPress={() => onUpdateSettings({ textAlign: 'left' })}
                    >
                      <AlignLeft size={15} color={(settings.textAlign || 'left') === 'left' ? theme.accent : theme.muted} />
                      <Text style={[styles.alignBtnText, { color: (settings.textAlign || 'left') === 'left' ? theme.accent : theme.fg }]}>
                        Left
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.alignBtn,
                        { backgroundColor: theme.panel, borderColor: theme.border },
                        settings.textAlign === 'justify' && { borderColor: theme.accent, backgroundColor: theme.sel },
                      ]}
                      onPress={() => onUpdateSettings({ textAlign: 'justify' })}
                    >
                      <AlignJustify size={15} color={settings.textAlign === 'justify' ? theme.accent : theme.muted} />
                      <Text style={[styles.alignBtnText, { color: settings.textAlign === 'justify' ? theme.accent : theme.fg }]}>
                        Justify
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              {/* Line Spacing */}
              <Text style={[styles.sheetLabel, { color: theme.muted }]}>LINE SPACING</Text>
              <View style={styles.spacingRow}>
                {[
                  { key: 1.4, label: 'Compact' },
                  { key: 1.6, label: 'Normal' },
                  { key: 1.9, label: 'Relaxed' },
                ].map((s) => {
                  const active = Math.abs((settings.lineHeight || 1.6) - s.key) < 0.05;
                  return (
                    <TouchableOpacity
                      key={s.key}
                      style={[
                        styles.spacingPill,
                        { backgroundColor: theme.panel, borderColor: theme.border },
                        active && { borderColor: theme.accent, backgroundColor: theme.sel },
                      ]}
                      onPress={() => onUpdateSettings({ lineHeight: s.key })}
                    >
                      <Text style={[styles.spacingText, { color: active ? theme.accent : theme.fg }]}>
                        {s.label} ({s.key})
                      </Text>
                    </TouchableOpacity>
                  );
                })}
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
            </ScrollView>
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
  titleArea: { flex: 1, minWidth: 0, marginRight: 8 },
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
    padding: 20,
    paddingBottom: 28,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalTitle: { fontSize: 17, fontWeight: '700' },
  sheetLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 8 },
  labelWithBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sliderValueText: { fontSize: 11, fontWeight: '700' },
  modeRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 18,
  },
  modeCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    alignItems: 'flex-start',
  },
  modeCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 6,
    marginBottom: 2,
  },
  modeCardDesc: {
    fontSize: 10,
    lineHeight: 14,
  },
  nightLightRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 18,
  },
  nightLightPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
  },
  nightLightText: {
    fontSize: 11,
    fontWeight: '700',
  },
  themesRow: { flexDirection: 'row', gap: 8, marginBottom: 18 },
  themePill: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  themePillText: { fontSize: 12, fontWeight: '600' },
  fontFamilyRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 18,
  },
  fontFamilyPill: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  fontFamilyText: {
    fontSize: 11,
    fontWeight: '600',
  },
  dualControlsRow: {
    flexDirection: 'row',
    marginBottom: 18,
  },
  alignRow: {
    flexDirection: 'row',
    gap: 6,
  },
  alignBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
  },
  alignBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  spacingRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 18,
  },
  spacingPill: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  spacingText: {
    fontSize: 11,
    fontWeight: '600',
  },
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
    top: 14,
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
  tabBarContainer: {
    borderBottomWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  tabScrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: 12,
  },
  tabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    maxWidth: 180,
  },
  tabIconWrap: {
    marginRight: 6,
  },
  tabTitle: {
    fontSize: 12,
    marginRight: 4,
    maxWidth: 110,
  },
  tabCloseBtn: {
    padding: 3,
    marginLeft: 3,
    borderRadius: 10,
  },
  newTabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    gap: 4,
  },
  newTabText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
