import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Clock,
  CheckCircle,
  AlertTriangle,
  FileText,
  Bookmark,
  Cloud,
  FolderOpen,
  Trash2,
  FileCode,
  Music,
  Video,
  Image as ImageIcon,
} from 'lucide-react-native';
import { AppActivity, DocKind, ReaderSettings } from '../types';
import { Storage } from '../services/storage';
import { useSessionVersion } from '../services/sessionBus';
import { THEMES } from '../theme/colors';

interface ActivityScreenProps {
  navigation: any;
  settings: ReaderSettings;
}

function getIconForKind(kind?: DocKind, color = '#2563eb') {
  switch (kind) {
    case 'pdf':
      return <FileText size={16} color="#ef4444" />;
    case 'docx':
    case 'pptx':
      return <FileText size={16} color="#3b82f6" />;
    case 'image':
      return <ImageIcon size={16} color="#10b981" />;
    case 'markdown':
    case 'html':
      return <FileCode size={16} color="#06b6d4" />;
    case 'audio':
      return <Music size={16} color="#8b5cf6" />;
    case 'video':
      return <Video size={16} color="#ec4899" />;
    default:
      return <FileText size={16} color={color} />;
  }
}

export const ActivityScreen: React.FC<ActivityScreenProps> = ({ navigation, settings }) => {
  const [activities, setActivities] = useState<AppActivity[]>([]);
  const [filter, setFilter] = useState<'all' | 'opened' | 'saved' | 'cloud'>('all');
  const [refreshing, setRefreshing] = useState(false);

  const theme = THEMES[settings.theme];

  const loadActivities = async () => {
    const list = await Storage.getActivities();
    setActivities(list);
  };

  const sessionVersion = useSessionVersion();
  useEffect(() => {
    loadActivities();
    const unsub = navigation.addListener('focus', loadActivities);
    return unsub;
  }, [navigation, sessionVersion]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadActivities();
    setRefreshing(false);
  };

  const handleClearHistory = () => {
    Alert.alert('Clear Activity History', 'Are you sure you want to clear your recent activity log?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          await Storage.clearActivities();
          setActivities([]);
        },
      },
    ]);
  };

  const handleOpenDoc = async (act: AppActivity) => {
    if (act.docId || act.docUri) {
      const docs = await Storage.getDocs();
      const doc = docs.find((d) => d.id === act.docId || d.uri === act.docUri);
      if (doc) {
        navigation.navigate('Reader', { doc });
      } else if (act.docUri) {
        navigation.navigate('Reader', {
          doc: {
            id: act.docId || `act_doc_${Date.now()}`,
            name: act.title,
            uri: act.docUri,
            kind: act.docKind || 'text',
            lastOpenedAt: Date.now(),
          },
        });
      }
    }
  };

  const timeAgo = (timestamp: number) => {
    const diff = Math.max(1, Math.round((Date.now() - timestamp) / 1000));
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  const filtered = activities.filter((act) => {
    if (filter === 'opened') return act.type === 'open_file' || act.type === 'open_folder';
    if (filter === 'saved') return act.type === 'save_bookmark' || act.type === 'save_link';
    if (filter === 'cloud') return act.type === 'sync_drive' || act.type === 'transfer' || act.type === 'save_link';
    return true;
  });

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.safeArea, { backgroundColor: theme.bg }]}>
      <View style={styles.container}>
        {/* Top Header */}
        <View style={styles.topBar}>
          <View>
            <Text style={[styles.title, { color: theme.fg || theme.text }]}>Activity</Text>
            <Text style={[styles.subtitle, { color: theme.muted }]}>
              {activities.length} logged event{activities.length === 1 ? '' : 's'}
            </Text>
          </View>
          {activities.length > 0 && (
            <TouchableOpacity style={styles.clearBtn} onPress={handleClearHistory} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Trash2 size={16} color={theme.muted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Filter Chips */}
        <View style={styles.filterRow}>
          {[
            { id: 'all', label: 'All' },
            { id: 'opened', label: 'Opened' },
            { id: 'saved', label: 'Bookmarks' },
            { id: 'cloud', label: 'Cloud' },
          ].map((f) => {
            const active = filter === f.id;
            return (
              <TouchableOpacity
                key={f.id}
                style={[
                  styles.filterPill,
                  {
                    backgroundColor: active ? theme.accent : theme.card,
                    borderColor: active ? theme.accent : theme.border,
                  },
                ]}
                onPress={() => setFilter(f.id as any)}
              >
                <Text
                  style={[
                    styles.filterText,
                    {
                      color: active ? theme.accentFg : theme.muted,
                      fontWeight: active ? '700' : '500',
                    },
                  ]}
                >
                  {f.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
        >
          {filtered.length === 0 ? (
            <View style={[styles.emptyBox, { borderColor: theme.border, backgroundColor: theme.card }]}>
              <Clock size={36} color={theme.muted} />
              <Text style={[styles.emptyTitle, { color: theme.fg }]}>No Recent Activity</Text>
              <Text style={[styles.emptyDesc, { color: theme.muted }]}>
                {filter === 'all'
                  ? 'Documents you open, save, or sync will be listed here automatically in real time.'
                  : `No activities found matching the "${filter}" filter.`}
              </Text>
            </View>
          ) : (
            filtered.map((act) => {
              return (
                <TouchableOpacity
                  key={act.id}
                  style={[styles.activityCard, { backgroundColor: theme.card, borderColor: theme.border }]}
                  onPress={() => handleOpenDoc(act)}
                  activeOpacity={act.docId || act.docUri ? 0.7 : 1}
                >
                  <View style={[styles.typeIconBox, { backgroundColor: theme.sel }]}>
                    {act.type === 'save_bookmark' ? (
                      <Bookmark size={17} color="#f59e0b" />
                    ) : act.type === 'sync_drive' ? (
                      <Cloud size={17} color="#10b981" />
                    ) : act.type === 'open_folder' ? (
                      <FolderOpen size={17} color="#3b82f6" />
                    ) : (
                      getIconForKind(act.docKind, theme.accent)
                    )}
                  </View>

                  <View style={styles.activityInfo}>
                    <Text style={[styles.activityTitle, { color: theme.fg }]} numberOfLines={1}>
                      {act.title}
                    </Text>
                    <View style={styles.metaRow}>
                      <Text style={[styles.activitySub, { color: theme.muted }]}>
                        {act.subtitle || (act.type === 'save_bookmark' ? 'Saved file' : 'Opened file')}
                      </Text>
                      <Text style={[styles.dot, { color: theme.muted }]}>·</Text>
                      <Text style={[styles.activityTime, { color: theme.muted }]}>
                        {timeAgo(act.timestamp)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.rightBadge}>
                    {act.status === 'completed' && <CheckCircle size={14} color="#10b981" />}
                    {act.status === 'running' && <Clock size={14} color="#f59e0b" />}
                    {act.status === 'failed' && <AlertTriangle size={14} color="#ef4444" />}
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: { fontSize: 24, fontWeight: '800' },
  subtitle: { fontSize: 12, marginTop: 2 },
  clearBtn: {
    padding: 8,
    borderRadius: 8,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  filterPill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterText: {
    fontSize: 12,
  },
  list: { paddingBottom: 100 },
  activityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
    gap: 12,
  },
  typeIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityInfo: { flex: 1 },
  activityTitle: { fontSize: 14, fontWeight: '600' },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3, gap: 4 },
  activitySub: { fontSize: 12 },
  dot: { fontSize: 12 },
  activityTime: { fontSize: 11 },
  rightBadge: {
    paddingLeft: 6,
  },
  emptyBox: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 36,
    alignItems: 'center',
    gap: 8,
    marginTop: 30,
  },
  emptyTitle: { fontSize: 15, fontWeight: '700' },
  emptyDesc: { fontSize: 12, textAlign: 'center', lineHeight: 18, maxWidth: 280 },
});
