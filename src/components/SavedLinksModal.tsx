import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Bookmark,
  X,
  Plus,
  Trash2,
  ExternalLink,
  Folder,
  FileText,
  FileSpreadsheet,
  Presentation,
  Clock,
  Sparkles,
} from 'lucide-react-native';
import { Storage } from '../services/storage';
import { openDriveResource } from '../services/gdrive';
import { MobileDoc, ParsedDriveLink, SavedLink } from '../types';
import { ThemeColors } from '../theme/colors';

interface SavedLinksModalProps {
  visible: boolean;
  theme: ThemeColors;
  onClose: () => void;
  onOpenDoc: (doc: MobileDoc) => void;
  onPasteNewLink: () => void;
}

function timeAgo(ts?: number): string {
  if (!ts) return '';
  const diffSec = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (diffSec < 3600) return `${Math.round(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.round(diffSec / 3600)}h ago`;
  return `${Math.round(diffSec / 86400)}d ago`;
}

function getIconForHint(hint: SavedLink['hint'], color: string) {
  switch (hint) {
    case 'folder':
      return <Folder size={18} color="#f59e0b" />;
    case 'gsheet':
      return <FileSpreadsheet size={18} color="#10b981" />;
    case 'gppt':
      return <Presentation size={18} color="#f97316" />;
    case 'gdoc':
    case 'file':
    default:
      return <FileText size={18} color={color} />;
  }
}

export const SavedLinksModal: React.FC<SavedLinksModalProps> = ({
  visible,
  theme,
  onClose,
  onOpenDoc,
  onPasteNewLink,
}) => {
  const insets = useSafeAreaInsets();
  const [links, setLinks] = useState<SavedLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const loadLinks = async () => {
    setLoading(true);
    const all = await Storage.getSavedLinks();
    setLinks(all);
    setLoading(false);
  };

  useEffect(() => {
    if (visible) {
      void loadLinks();
    }
  }, [visible]);

  // Group links by collection
  const groups = useMemo(() => {
    const map = new Map<string, SavedLink[]>();
    for (const l of links) {
      const col = l.collection?.trim() || 'General';
      if (!map.has(col)) map.set(col, []);
      map.get(col)!.push(l);
    }
    return Array.from(map.entries()).sort((a, b) => {
      if (a[0] === 'General') return 1;
      if (b[0] === 'General') return -1;
      return a[0].localeCompare(b[0]);
    });
  }, [links]);

  const handleOpen = async (link: SavedLink) => {
    setOpeningId(link.id);
    try {
      const parsed: ParsedDriveLink = {
        id: link.folderId || link.fileId || '',
        hint: link.hint,
        resourceKey: link.resourceKey,
        originalUrl: link.url,
      };

      const serverUrl = await Storage.getServerUrl();
      const apiKey = await Storage.getDriveApiKey();
      const res = await openDriveResource(parsed, serverUrl, apiKey, link.title);

      if (res.doc) {
        await Storage.updateSavedLinkProgress(link.id, {});
        onClose();
        onOpenDoc(res.doc);
      } else if (res.folderFiles) {
        Alert.alert('Folder Opened', `Contains ${res.folderFiles.length} item(s). View in Drive tab.`);
      }
    } catch (e: any) {
      Alert.alert('Open Error', e?.message || 'Could not open saved link.');
    } finally {
      setOpeningId(null);
    }
  };

  const handleDelete = (link: SavedLink) => {
    Alert.alert(
      'Remove Saved Link',
      `Remove “${link.title}” from your saved links? The original file in Google Drive is not touched.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await Storage.removeSavedLink(link.id);
            setLinks((prev) => prev.filter((l) => l.id !== link.id));
          },
        },
      ]
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: theme.surface, paddingBottom: Math.max(insets.bottom, 20) }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={[styles.iconWrap, { backgroundColor: theme.primary + '18' }]}>
                <Bookmark size={20} color={theme.primary} />
              </View>
              <View>
                <Text style={[styles.title, { color: theme.text }]}>Saved Links</Text>
                <Text style={[styles.subtitle, { color: theme.textMuted }]}>
                  {links.length} curated reference{links.length === 1 ? '' : 's'}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={20} color={theme.textMuted} />
            </TouchableOpacity>
          </View>

          {/* List */}
          {loading ? (
            <View style={styles.emptyContainer}>
              <ActivityIndicator size="large" color={theme.primary} />
            </View>
          ) : links.length === 0 ? (
            <View style={styles.emptyContainer}>
              <View style={[styles.emptyIconCircle, { backgroundColor: theme.primary + '14' }]}>
                <Bookmark size={32} color={theme.primary} />
              </View>
              <Text style={[styles.emptyTitle, { color: theme.text }]}>No Saved Links Yet</Text>
              <Text style={[styles.emptyDesc, { color: theme.textMuted }]}>
                Paste any shared Google Drive file or folder URL to keep it organized in your personal collections.
              </Text>
              <TouchableOpacity
                style={[styles.emptyActionBtn, { backgroundColor: theme.primary }]}
                onPress={() => {
                  onClose();
                  onPasteNewLink();
                }}
              >
                <Plus size={16} color="#ffffff" style={{ marginRight: 6 }} />
                <Text style={styles.emptyActionBtnText}>Paste New Link</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={groups}
              keyExtractor={([colName]) => colName}
              contentContainerStyle={{ paddingBottom: 16 }}
              showsVerticalScrollIndicator={false}
              renderItem={({ item: [colName, colLinks] }) => (
                <View style={styles.groupContainer}>
                  {/* Collection Title */}
                  <View style={styles.groupHeader}>
                    <Text style={[styles.groupTitle, { color: theme.textSecondary }]}>{colName}</Text>
                    <View style={[styles.countBadge, { backgroundColor: theme.primary + '18' }]}>
                      <Text style={[styles.countText, { color: theme.primary }]}>{colLinks.length}</Text>
                    </View>
                  </View>

                  {/* Items in this collection */}
                  {colLinks.map((link) => {
                    const isBusy = openingId === link.id;
                    return (
                      <View
                        key={link.id}
                        style={[
                          styles.linkCard,
                          { backgroundColor: theme.bg, borderColor: theme.border },
                        ]}
                      >
                        <View style={styles.linkCardLeft}>
                          <View style={styles.iconCircle}>
                            {getIconForHint(link.hint, theme.primary)}
                          </View>
                          <View style={styles.linkMeta}>
                            <Text style={[styles.linkTitle, { color: theme.text }]} numberOfLines={1}>
                              {link.title}
                            </Text>
                            <View style={styles.metaRow}>
                              <Text style={[styles.metaText, { color: theme.textMuted }]}>
                                {link.hint.toUpperCase()}
                              </Text>
                              {link.lastOpenedAt && (
                                <Text style={[styles.metaText, { color: theme.textMuted }]}>
                                  {' · '}Opened {timeAgo(link.lastOpenedAt)}
                                </Text>
                              )}
                            </View>
                          </View>
                        </View>

                        {/* Actions */}
                        <View style={styles.linkActions}>
                          <TouchableOpacity
                            style={[styles.actionBtn, { backgroundColor: theme.primary }]}
                            onPress={() => handleOpen(link)}
                            disabled={isBusy}
                          >
                            {isBusy ? (
                              <ActivityIndicator size="small" color="#ffffff" />
                            ) : (
                              <>
                                <ExternalLink size={13} color="#ffffff" style={{ marginRight: 4 }} />
                                <Text style={styles.actionBtnText}>Open</Text>
                              </>
                            )}
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[styles.deleteBtn, { borderColor: theme.border }]}
                            onPress={() => handleDelete(link)}
                          >
                            <Trash2 size={14} color="#ef4444" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            />
          )}

          {/* Bottom Bar */}
          <View style={[styles.footer, { borderTopColor: theme.border }]}>
            <TouchableOpacity
              style={[styles.addLinkBtn, { borderColor: theme.primary }]}
              onPress={() => {
                onClose();
                onPasteNewLink();
              }}
            >
              <Plus size={16} color={theme.primary} style={{ marginRight: 6 }} />
              <Text style={[styles.addLinkBtnText, { color: theme.primary }]}>Paste Another Drive Link</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 12,
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
    gap: 12,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
  },
  groupContainer: {
    marginBottom: 16,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  groupTitle: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  countText: {
    fontSize: 11,
    fontWeight: '700',
  },
  linkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  linkCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 10,
  },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: 'rgba(150, 150, 150, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkMeta: {
    flex: 1,
  },
  linkTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  metaText: {
    fontSize: 11,
  },
  linkActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  actionBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  deleteBtn: {
    padding: 6,
    borderWidth: 1,
    borderRadius: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptyDesc: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
  },
  emptyActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  emptyActionBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  footer: {
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  addLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
  },
  addLinkBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
