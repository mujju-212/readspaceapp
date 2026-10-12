import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity } from 'react-native';
import { ArrowUpDown, CheckCircle, Clock, AlertTriangle } from 'lucide-react-native';
import { TransferJob, ReaderSettings } from '../types';
import { THEMES } from '../theme/colors';

interface ActivityScreenProps {
  settings: ReaderSettings;
}

export const ActivityScreen: React.FC<ActivityScreenProps> = ({ settings }) => {
  const [jobs] = useState<TransferJob[]>([
    {
      id: 'job_1',
      direction: 'download',
      docName: 'readspace-demo.pdf',
      progress: 100,
      status: 'completed',
      size: 140000,
      createdAt: Date.now() - 3600000,
    },
    {
      id: 'job_2',
      direction: 'download',
      docName: 'ai-overview.pptx',
      progress: 100,
      status: 'completed',
      size: 7363,
      createdAt: Date.now() - 7200000,
    },
  ]);

  const theme = THEMES[settings.theme];

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.bg }]}>
      <View style={styles.container}>
        <View style={styles.topBar}>
          <Text style={[styles.title, { color: theme.fg }]}>Activity</Text>
        </View>

        <ScrollView contentContainerStyle={styles.list}>
          {jobs.length === 0 ? (
            <View style={[styles.emptyBox, { borderColor: theme.border }]}>
              <ArrowUpDown size={36} color={theme.muted} />
              <Text style={[styles.emptyTitle, { color: theme.fg }]}>No recent transfers</Text>
              <Text style={[styles.emptyDesc, { color: theme.muted }]}>
                Files downloaded from Google Drive or uploaded to the cloud will appear here
              </Text>
            </View>
          ) : (
            jobs.map((j) => (
              <View
                key={j.id}
                style={[styles.jobCard, { backgroundColor: theme.card, borderColor: theme.border }]}
              >
                <View style={styles.jobIcon}>
                  {j.status === 'completed' && <CheckCircle size={20} color={theme.success} />}
                  {j.status === 'running' && <Clock size={20} color={theme.accent} />}
                  {j.status === 'failed' && <AlertTriangle size={20} color={theme.error} />}
                </View>
                <View style={styles.jobInfo}>
                  <Text style={[styles.jobName, { color: theme.fg }]} numberOfLines={1}>
                    {j.docName}
                  </Text>
                  <Text style={[styles.jobMeta, { color: theme.muted }]}>
                    {j.direction === 'download' ? 'Downloaded' : 'Uploaded'} ·{' '}
                    {j.size ? `${(j.size / 1024).toFixed(0)} KB` : ''}
                  </Text>
                </View>
                <Text style={[styles.jobStatus, { color: theme.success }]}>
                  {j.status.toUpperCase()}
                </Text>
              </View>
            ))
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1, padding: 16 },
  topBar: { marginBottom: 16 },
  title: { fontSize: 24, fontWeight: '800' },
  list: { paddingBottom: 40 },
  jobCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
    gap: 12,
  },
  jobIcon: { width: 32, alignItems: 'center' },
  jobInfo: { flex: 1 },
  jobName: { fontSize: 14, fontWeight: '600' },
  jobMeta: { fontSize: 11, marginTop: 2 },
  jobStatus: { fontSize: 11, fontWeight: '800' },
  emptyBox: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 36,
    alignItems: 'center',
    gap: 8,
    marginTop: 40,
  },
  emptyTitle: { fontSize: 15, fontWeight: '600' },
  emptyDesc: { fontSize: 12, textAlign: 'center' },
});
