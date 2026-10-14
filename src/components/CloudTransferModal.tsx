import React, { useState, useEffect, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import {
  Cloud,
  CloudUpload,
  CheckCircle2,
  AlertTriangle,
  X,
  FileText,
  RefreshCw,
  Check,
  Folder,
  ArrowUpRight,
  ShieldAlert,
} from 'lucide-react-native';
import { WorkspaceFolder, DriveAccount, UserAccount, FolderEntry } from '../types';
import { Api } from '../services/api';
import { ThemeColors } from '../theme/colors';
import { getWorkspaceBlob } from '../services/webIdb';
import * as FileSystem from 'expo-file-system';

interface CandidateItem {
  relativePath: string;
  name: string;
  size?: number;
  classification: 'likely_new' | 'same_candidate' | 'name_collision';
  reason?: string;
  remoteId?: string;
  mimeType?: string;
}

interface CloudTransferModalProps {
  visible: boolean;
  workspace: WorkspaceFolder | null;
  drive: DriveAccount | null;
  user: UserAccount | null;
  theme: ThemeColors;
  onClose: () => void;
  onSyncCompleted?: () => void;
}

export const CloudTransferModal: React.FC<CloudTransferModalProps> = ({
  visible,
  workspace,
  drive,
  user,
  theme,
  onClose,
  onSyncCompleted,
}) => {
  const [scanning, setScanning] = useState(false);
  const [candidates, setCandidates] = useState<CandidateItem[]>([]);
  const [remoteCount, setRemoteCount] = useState(0);
  const [targetFolderName, setTargetFolderName] = useState('');
  const [tabFilter, setTabFilter] = useState<'all' | 'new' | 'collision' | 'same'>('new');
  const [selectedPaths, setSelectedPaths] = useState<Record<string, boolean>>({});
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number; currentName: string }>({
    current: 0,
    total: 0,
    currentName: '',
  });

  // Flatten workspace entries to path candidates
  const localFiles = useMemo(() => {
    if (!workspace?.entries) return [];
    const files: Array<{ relativePath: string; name: string; size?: number; mimeType?: string }> = [];

    function collect(entries: FolderEntry[], prefix = '') {
      for (const e of entries) {
        const rel = prefix ? `${prefix}/${e.name}` : e.name;
        if (!e.isDirectory) {
          files.push({
            relativePath: e.relativePath || rel,
            name: e.name,
            size: e.size,
            mimeType: e.mimeType,
          });
        } else if (e.children) {
          collect(e.children, rel);
        }
      }
    }

    collect(workspace.entries);
    return files;
  }, [workspace]);

  // Run scan whenever modal opens
  useEffect(() => {
    if (visible && workspace && drive?.connected) {
      void runScan();
    }
  }, [visible, workspace?.id, drive?.connected]);

  const runScan = async () => {
    if (!workspace) return;
    setScanning(true);
    setTargetFolderName(workspace.name || 'Local Folder');

    try {
      const manifest = localFiles.map((f) => ({
        relativePath: f.relativePath,
        name: f.name,
        size: f.size,
      }));

      // Find or create Drive folder matching workspace name
      const targetFolderId = `create:${workspace.name || 'Workspace'}`;
      const res = await Api.scanTransfers(targetFolderId, manifest);

      const items: CandidateItem[] = res.candidates.map((c) => {
        const local = localFiles.find((f) => f.relativePath === c.relativePath || f.name === c.name);
        return {
          ...c,
          mimeType: local?.mimeType,
        };
      });

      setCandidates(items);
      setRemoteCount(res.remoteCount);

      // Pre-select new files by default
      const defaultSelected: Record<string, boolean> = {};
      items.forEach((c) => {
        if (c.classification === 'likely_new') {
          defaultSelected[c.relativePath] = true;
        }
      });
      setSelectedPaths(defaultSelected);
    } catch (err: any) {
      Alert.alert('Scan Failed', err?.message || 'Could not compare local files with Google Drive.');
    } finally {
      setScanning(false);
    }
  };

  // Metrics
  const newCount = candidates.filter((c) => c.classification === 'likely_new').length;
  const sameCount = candidates.filter((c) => c.classification === 'same_candidate').length;
  const collisionCount = candidates.filter((c) => c.classification === 'name_collision').length;

  const filteredCandidates = useMemo(() => {
    switch (tabFilter) {
      case 'new':
        return candidates.filter((c) => c.classification === 'likely_new');
      case 'collision':
        return candidates.filter((c) => c.classification === 'name_collision');
      case 'same':
        return candidates.filter((c) => c.classification === 'same_candidate');
      default:
        return candidates;
    }
  }, [candidates, tabFilter]);

  const selectedCount = Object.values(selectedPaths).filter(Boolean).length;

  const toggleSelect = (path: string) => {
    setSelectedPaths((prev) => ({ ...prev, [path]: !prev[path] }));
  };

  const selectAll = () => {
    const next: Record<string, boolean> = {};
    candidates.forEach((c) => {
      next[c.relativePath] = true;
    });
    setSelectedPaths(next);
  };

  const selectNewOnly = () => {
    const next: Record<string, boolean> = {};
    candidates.forEach((c) => {
      if (c.classification === 'likely_new') {
        next[c.relativePath] = true;
      }
    });
    setSelectedPaths(next);
  };

  const clearSelection = () => {
    setSelectedPaths({});
  };

  // Upload execution
  const handleUpload = async (itemsToUpload: CandidateItem[]) => {
    if (itemsToUpload.length === 0) return;
    setUploading(true);
    let successCount = 0;
    let failCount = 0;
    const targetFolderId = `create:${workspace?.name || 'Workspace'}`;

    try {
      for (let i = 0; i < itemsToUpload.length; i++) {
        const item = itemsToUpload[i];
        setUploadProgress({
          current: i + 1,
          total: itemsToUpload.length,
          currentName: item.name,
        });

        try {
          // Fetch binary blob/data for item
          let fileData: any = null;

          if (Platform.OS === 'web') {
            const blob = await getWorkspaceBlob(workspace?.id, item.relativePath || item.name);
            if (blob) {
              fileData = blob;
            } else {
              // Try text fallback
              fileData = new Blob([''], { type: item.mimeType || 'application/octet-stream' });
            }
          } else {
            // Native Android / iOS
            const foundEntry = workspace?.entries?.find((e) => e.name === item.name);
            if (foundEntry?.uri) {
              fileData = await FileSystem.readAsStringAsync(foundEntry.uri, {
                encoding: FileSystem.EncodingType.Base64,
              });
            }
          }

          if (fileData) {
            await Api.uploadFileToDrive(
              targetFolderId,
              item.name,
              item.mimeType || 'application/octet-stream',
              fileData
            );
            successCount++;
          } else {
            failCount++;
          }
        } catch (uploadErr) {
          console.warn(`Failed to upload ${item.name}:`, uploadErr);
          failCount++;
        }
      }

      // Record transfer job
      void Api.recordTransferJob({
        direction: 'upload',
        destinationDriveFolderId: targetFolderId,
        status: failCount === 0 ? 'succeeded' : 'partial',
        items: itemsToUpload.map((it) => ({
          fileName: it.name,
          relativePath: it.relativePath,
          size: it.size,
          status: 'succeeded',
        })),
      });

      Alert.alert(
        'Upload Complete',
        `Successfully uploaded ${successCount} file(s) to Google Drive in folder "${targetFolderName}".${
          failCount > 0 ? ` (${failCount} skipped/failed)` : ''
        }`
      );

      if (onSyncCompleted) onSyncCompleted();
      onClose();
    } catch (e: any) {
      Alert.alert('Upload Error', e?.message || 'Could not complete Drive transfer.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.dialogCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: theme.border }]}>
            <View style={styles.headerLeft}>
              <View style={[styles.cloudIconCircle, { backgroundColor: '#10b98118' }]}>
                <CloudUpload size={20} color="#10b981" />
              </View>
              <View>
                <Text style={[styles.title, { color: theme.text }]}>Drive Workspace Sync</Text>
                <Text style={[styles.subtitle, { color: theme.textMuted }]}>
                  Compare local files & upload new items to Google Drive
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} disabled={uploading}>
              <X size={18} color={theme.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Not Signed In or Drive Not Connected Notice */}
          {(!user || !drive?.connected) ? (
            <View style={styles.unauthedBox}>
              <ShieldAlert size={40} color="#f59e0b" style={{ marginBottom: 12 }} />
              <Text style={[styles.unauthedTitle, { color: theme.text }]}>Google Drive Not Connected</Text>
              <Text style={[styles.unauthedDesc, { color: theme.textMuted }]}>
                Sign in and authorize Google Drive to compare local files, detect new additions, and upload workspaces directly to the cloud.
              </Text>
              <TouchableOpacity
                style={[styles.authActionBtn, { backgroundColor: '#10b981' }]}
                onPress={async () => {
                  try {
                    await Api.startGoogleAuth(true, (data) => {
                      if (data.drive?.connected && onSyncCompleted) {
                        onSyncCompleted();
                      }
                    });
                  } catch (e: any) {
                    Alert.alert('Google Auth', e?.message || 'Failed to start Google sign in');
                  }
                }}
              >
                <Cloud size={16} color="#ffffff" style={{ marginRight: 6 }} />
                <Text style={styles.authActionText}>Authorize Google Drive (OAuth)</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {/* Target Folder Pill Banner */}
              <View style={[styles.targetBanner, { backgroundColor: theme.bg, borderColor: theme.border }]}>
                <Folder size={16} color="#f59e0b" style={{ marginRight: 6 }} />
                <Text style={[styles.targetText, { color: theme.text }]} numberOfLines={1}>
                  Target in Drive: <Text style={{ fontWeight: '700' }}>📁 {targetFolderName}</Text> ({remoteCount} in Drive)
                </Text>
                <TouchableOpacity onPress={runScan} disabled={scanning || uploading} style={styles.rescanBtn}>
                  <RefreshCw size={13} color={theme.primary} />
                </TouchableOpacity>
              </View>

              {/* Stat Metric Cards */}
              <View style={styles.metricsRow}>
                <TouchableOpacity
                  style={[
                    styles.metricCard,
                    { backgroundColor: '#10b98114', borderColor: '#10b98140' },
                    tabFilter === 'new' && { borderWidth: 2, borderColor: '#10b981' },
                  ]}
                  onPress={() => setTabFilter('new')}
                >
                  <Text style={[styles.metricCount, { color: '#059669' }]}>{newCount}</Text>
                  <Text style={[styles.metricLabel, { color: '#059669' }]}>New (Local)</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.metricCard,
                    { backgroundColor: '#3b82f614', borderColor: '#3b82f640' },
                    tabFilter === 'same' && { borderWidth: 2, borderColor: '#3b82f6' },
                  ]}
                  onPress={() => setTabFilter('same')}
                >
                  <Text style={[styles.metricCount, { color: '#2563eb' }]}>{sameCount}</Text>
                  <Text style={[styles.metricLabel, { color: '#2563eb' }]}>In Drive</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.metricCard,
                    { backgroundColor: '#f59e0b14', borderColor: '#f59e0b40' },
                    tabFilter === 'collision' && { borderWidth: 2, borderColor: '#f59e0b' },
                  ]}
                  onPress={() => setTabFilter('collision')}
                >
                  <Text style={[styles.metricCount, { color: '#d97706' }]}>{collisionCount}</Text>
                  <Text style={[styles.metricLabel, { color: '#d97706' }]}>Modified</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.metricCard,
                    { backgroundColor: theme.bg, borderColor: theme.border },
                    tabFilter === 'all' && { borderWidth: 2, borderColor: theme.primary },
                  ]}
                  onPress={() => setTabFilter('all')}
                >
                  <Text style={[styles.metricCount, { color: theme.text }]}>{candidates.length}</Text>
                  <Text style={[styles.metricLabel, { color: theme.textMuted }]}>Total Files</Text>
                </TouchableOpacity>
              </View>

              {/* Selection Toolbar */}
              <View style={[styles.toolbar, { borderBottomColor: theme.border }]}>
                <View style={styles.toolPills}>
                  <TouchableOpacity style={styles.toolBtn} onPress={selectNewOnly}>
                    <Text style={[styles.toolBtnText, { color: theme.primary }]}>Select New</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.toolBtn} onPress={selectAll}>
                    <Text style={[styles.toolBtnText, { color: theme.textMuted }]}>Select All</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.toolBtn} onPress={clearSelection}>
                    <Text style={[styles.toolBtnText, { color: theme.textMuted }]}>Clear</Text>
                  </TouchableOpacity>
                </View>
                <Text style={[styles.selectedSummary, { color: theme.textMuted }]}>
                  <Text style={{ fontWeight: '700', color: theme.text }}>{selectedCount}</Text> of {candidates.length} selected
                </Text>
              </View>

              {/* Candidate List */}
              {scanning ? (
                <View style={styles.centerLoading}>
                  <ActivityIndicator size="large" color={theme.primary} />
                  <Text style={[styles.loadingText, { color: theme.textMuted }]}>
                    Comparing local workspace with Google Drive…
                  </Text>
                </View>
              ) : filteredCandidates.length === 0 ? (
                <View style={styles.emptyCandidates}>
                  <CheckCircle2 size={32} color="#10b981" style={{ marginBottom: 8 }} />
                  <Text style={[styles.emptyTitle, { color: theme.text }]}>No Files in This Category</Text>
                  <Text style={[styles.emptySub, { color: theme.textMuted }]}>
                    {tabFilter === 'new'
                      ? 'All local files are already synced with Google Drive!'
                      : 'No modified or colliding files found.'}
                  </Text>
                </View>
              ) : (
                <ScrollView style={styles.candidateScroll} showsVerticalScrollIndicator={false}>
                  {filteredCandidates.map((c) => {
                    const isChecked = !!selectedPaths[c.relativePath];
                    const isNew = c.classification === 'likely_new';
                    const isCol = c.classification === 'name_collision';

                    return (
                      <TouchableOpacity
                        key={c.relativePath}
                        style={[
                          styles.candidateRow,
                          { borderBottomColor: theme.border + '60' },
                          isChecked && { backgroundColor: theme.primary + '0a' },
                        ]}
                        onPress={() => toggleSelect(c.relativePath)}
                        activeOpacity={0.7}
                      >
                        {/* Checkbox */}
                        <View
                          style={[
                            styles.checkbox,
                            { borderColor: isChecked ? theme.primary : theme.border },
                            isChecked && { backgroundColor: theme.primary },
                          ]}
                        >
                          {isChecked && <Check size={12} color="#ffffff" />}
                        </View>

                        {/* File Details */}
                        <View style={styles.candidateInfo}>
                          <View style={styles.fileNameRow}>
                            <FileText size={14} color={isNew ? '#10b981' : isCol ? '#f59e0b' : theme.textMuted} style={{ marginRight: 6 }} />
                            <Text style={[styles.candidateName, { color: theme.text }]} numberOfLines={1}>
                              {c.name}
                            </Text>
                          </View>
                          <Text style={[styles.candidatePath, { color: theme.textMuted }]} numberOfLines={1}>
                            {c.relativePath} · {c.size ? `${(c.size / 1024).toFixed(1)} KB` : '0 B'}
                          </Text>
                          {c.reason && (
                            <Text style={[styles.candidateReason, { color: isNew ? '#059669' : '#d97706' }]}>
                              {c.reason}
                            </Text>
                          )}
                        </View>

                        {/* Status Badge */}
                        <View
                          style={[
                            styles.statusBadge,
                            {
                              backgroundColor: isNew ? '#10b98118' : isCol ? '#f59e0b18' : '#3b82f618',
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.statusBadgeText,
                              {
                                color: isNew ? '#059669' : isCol ? '#d97706' : '#2563eb',
                              },
                            ]}
                          >
                            {isNew ? 'NEW' : isCol ? 'MODIFIED' : 'SYNCED'}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}

              {/* Upload Progress Bar (when active) */}
              {uploading && (
                <View style={[styles.progressBox, { backgroundColor: theme.bg, borderColor: theme.border }]}>
                  <View style={styles.progressHeader}>
                    <Text style={[styles.progressTitle, { color: theme.text }]}>
                      Uploading to Google Drive… ({uploadProgress.current}/{uploadProgress.total})
                    </Text>
                    <ActivityIndicator size="small" color={theme.primary} />
                  </View>
                  <Text style={[styles.progressFile, { color: theme.textMuted }]} numberOfLines={1}>
                    {uploadProgress.currentName}
                  </Text>
                </View>
              )}

              {/* Action Buttons Footer */}
              <View style={[styles.footer, { borderTopColor: theme.border }]}>
                <TouchableOpacity
                  style={[styles.cancelBtn, { borderColor: theme.border }]}
                  onPress={onClose}
                  disabled={uploading}
                >
                  <Text style={[styles.cancelText, { color: theme.textMuted }]}>Close</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.uploadActionBtn,
                    { backgroundColor: theme.primary },
                    (selectedCount === 0 || uploading) && { opacity: 0.5 },
                  ]}
                  disabled={selectedCount === 0 || uploading}
                  onPress={() => {
                    const toUpload = candidates.filter((c) => selectedPaths[c.relativePath]);
                    void handleUpload(toUpload);
                  }}
                >
                  <CloudUpload size={16} color="#ffffff" style={{ marginRight: 6 }} />
                  <Text style={styles.uploadActionText}>
                    {uploading ? 'Uploading…' : `Upload to Drive (${selectedCount})`}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  dialogCard: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '88%',
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  cloudIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 11.5,
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
  },
  unauthedBox: {
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unauthedTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  unauthedDesc: {
    fontSize: 12.5,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
    maxWidth: 340,
  },
  authActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  authActionText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  targetBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderBottomWidth: 1,
  },
  targetText: {
    fontSize: 12,
    flex: 1,
  },
  rescanBtn: {
    padding: 4,
  },
  metricsRow: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
  },
  metricCard: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  metricCount: {
    fontSize: 16,
    fontWeight: '800',
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  toolPills: {
    flexDirection: 'row',
    gap: 6,
  },
  toolBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  toolBtnText: {
    fontSize: 11,
    fontWeight: '600',
  },
  selectedSummary: {
    fontSize: 11,
  },
  centerLoading: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 12,
    marginTop: 12,
  },
  emptyCandidates: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  emptySub: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },
  candidateScroll: {
    flex: 1,
    maxHeight: 280,
  },
  candidateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  candidateInfo: {
    flex: 1,
    marginRight: 8,
  },
  fileNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  candidateName: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  candidatePath: {
    fontSize: 11,
    marginTop: 2,
  },
  candidateReason: {
    fontSize: 10.5,
    marginTop: 2,
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  statusBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  progressBox: {
    padding: 10,
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressTitle: {
    fontSize: 12,
    fontWeight: '700',
  },
  progressFile: {
    fontSize: 11,
    marginTop: 3,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderTopWidth: 1,
  },
  cancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
  },
  cancelText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  uploadActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
  },
  uploadActionText: {
    color: '#ffffff',
    fontSize: 12.5,
    fontWeight: '700',
  },
});
