import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Link2, Bookmark, ExternalLink, X, Key, CheckCircle, AlertTriangle, Folder, FileText } from 'lucide-react-native';
import { parseGDriveLink, KIND_LABELS, openDriveResource } from '../services/gdrive';
import { Storage } from '../services/storage';
import { MobileDoc, ParsedDriveLink, SavedLink } from '../types';
import { ThemeColors } from '../theme/colors';

interface OpenDriveLinkModalProps {
  visible: boolean;
  initialUrl?: string;
  isSaveMode?: boolean;
  theme: ThemeColors;
  onClose: () => void;
  onDocOpened: (doc: MobileDoc) => void;
  onLinkSaved?: (link: SavedLink) => void;
}

export const OpenDriveLinkModal: React.FC<OpenDriveLinkModalProps> = ({
  visible,
  initialUrl = '',
  isSaveMode = false,
  theme,
  onClose,
  onDocOpened,
  onLinkSaved,
}) => {
  const insets = useSafeAreaInsets();
  const [url, setUrl] = useState(initialUrl);
  const [title, setTitle] = useState('');
  const [collection, setCollection] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setUrl(initialUrl);
      setTitle('');
      setCollection('');
      setStatusMessage(null);
      void Storage.getDriveApiKey().then((k) => {
        setApiKey(k);
        if (k) setShowKeyInput(true);
      });
    }
  }, [visible, initialUrl]);

  const detected: ParsedDriveLink | null = useMemo(() => parseGDriveLink(url), [url]);
  const isNativeDoc = detected && ['gdoc', 'gsheet', 'gppt'].includes(detected.hint);
  const isFolder = detected && detected.hint === 'folder';

  const handleOpen = async () => {
    if (!detected) {
      Alert.alert('Invalid Link', 'Please paste a valid Google Drive file, folder, or Google Doc URL.');
      return;
    }

    setLoading(true);
    setStatusMessage('Connecting to Google Drive…');

    try {
      if (apiKey.trim()) {
        await Storage.setDriveApiKey(apiKey.trim());
      }
      const serverUrl = await Storage.getServerUrl();
      const res = await openDriveResource(detected, serverUrl, apiKey.trim(), title.trim() || undefined);

      if (res.doc) {
        onClose();
        onDocOpened(res.doc);
      } else if (res.folderFiles) {
        Alert.alert(
          'Drive Folder Found',
          `Folder contains ${res.folderFiles.length} item(s). You can browse this folder in the Google Drive tab.`,
          [{ text: 'OK', onPress: onClose }]
        );
      }
    } catch (err: any) {
      Alert.alert('Open Failed', err?.message || 'Could not open Drive link. Check if the file is shared publicly.');
    } finally {
      setLoading(false);
      setStatusMessage(null);
    }
  };

  const handleSave = async () => {
    if (!detected) {
      Alert.alert('Invalid Link', 'Please paste a valid Google Drive URL.');
      return;
    }

    const linkTitle = title.trim() || (detected.hint ? `Google ${KIND_LABELS[detected.hint]}` : 'Drive Link');
    const newLink: SavedLink = {
      id: `link_${Date.now()}`,
      title: linkTitle,
      url: detected.originalUrl,
      hint: detected.hint,
      fileId: isFolder ? undefined : detected.id,
      folderId: isFolder ? detected.id : undefined,
      resourceKey: detected.resourceKey,
      collection: collection.trim() || 'General',
      addedAt: Date.now(),
    };

    try {
      await Storage.saveSavedLink(newLink);
      Alert.alert('Link Saved', `Saved “${linkTitle}” to collection “${newLink.collection}”.`);
      if (onLinkSaved) onLinkSaved(newLink);
      onClose();
    } catch (e: any) {
      Alert.alert('Save Error', e?.message || 'Could not save link.');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: theme.surface, paddingBottom: Math.max(insets.bottom, 20) }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={[styles.iconWrap, { backgroundColor: theme.primary + '18' }]}>
                {isSaveMode ? <Bookmark size={20} color={theme.primary} /> : <Link2 size={20} color={theme.primary} />}
              </View>
              <Text style={[styles.title, { color: theme.text }]}>
                {isSaveMode ? 'Save to Collection' : 'Open from Google Drive'}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <X size={20} color={theme.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            <Text style={[styles.description, { color: theme.textMuted }]}>
              Paste any shared Google Drive URL (Doc, Sheet, Slide, PDF, or folder). Shared items must be set to
              <Text style={{ fontWeight: '700', color: theme.text }}> “Anyone with the link can view”</Text>.
            </Text>

            {/* URL Input */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: theme.textSecondary }]}>Drive Link or URL</Text>
              <TextInput
                style={[
                  styles.input,
                  { backgroundColor: theme.bg, borderColor: detected ? theme.primary : theme.border, color: theme.text },
                ]}
                placeholder="https://drive.google.com/... or docs.google.com/..."
                placeholderTextColor={theme.textMuted}
                value={url}
                onChangeText={setUrl}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {/* Detection status pill */}
            {detected && (
              <View style={[styles.detectBadge, { backgroundColor: theme.primary + '14', borderColor: theme.primary + '40' }]}>
                <CheckCircle size={15} color={theme.primary} />
                <Text style={[styles.detectText, { color: theme.primary }]}>
                  {KIND_LABELS[detected.hint]} detected · ID {detected.id.slice(0, 10)}…
                </Text>
              </View>
            )}

            {isNativeDoc && (
              <View style={[styles.infoBanner, { backgroundColor: '#10b98115', borderColor: '#10b98140' }]}>
                <Text style={[styles.infoBannerText, { color: '#059669' }]}>
                  ✓ Google Docs / Sheets / Slides open directly without an API key!
                </Text>
              </View>
            )}

            {/* Title / Alias Input */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: theme.textSecondary }]}>Title (Optional)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]}
                placeholder="e.g. Physics Chapter 3 or Study Notes"
                placeholderTextColor={theme.textMuted}
                value={title}
                onChangeText={setTitle}
              />
            </View>

            {/* Collection Input */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: theme.textSecondary }]}>Collection (e.g. College, Books, Projects)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]}
                placeholder="General"
                placeholderTextColor={theme.textMuted}
                value={collection}
                onChangeText={setCollection}
              />
            </View>

            {/* Optional API Key toggle */}
            {!isNativeDoc && (
              <View style={styles.keySection}>
                <TouchableOpacity
                  style={styles.keyToggle}
                  onPress={() => setShowKeyInput(!showKeyInput)}
                >
                  <Key size={14} color={theme.primary} />
                  <Text style={[styles.keyToggleText, { color: theme.primary }]}>
                    {showKeyInput ? 'Hide Google API Key' : 'Configure Google API Key (for large files/folders)'}
                  </Text>
                </TouchableOpacity>

                {showKeyInput && (
                  <View style={{ marginTop: 8 }}>
                    <TextInput
                      style={[styles.input, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]}
                      placeholder="AIzaSy... (free Google Drive API Key)"
                      placeholderTextColor={theme.textMuted}
                      value={apiKey}
                      onChangeText={setApiKey}
                      secureTextEntry
                    />
                    <Text style={[styles.subHint, { color: theme.textMuted }]}>
                      Stored securely on this device for reading shared Drive folders and binaries.
                    </Text>
                  </View>
                )}
              </View>
            )}

            {statusMessage && (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={theme.primary} />
                <Text style={[styles.loadingText, { color: theme.primary }]}>{statusMessage}</Text>
              </View>
            )}
          </ScrollView>

          {/* Action Buttons */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.btn, styles.cancelBtn, { borderColor: theme.border }]}
              onPress={onClose}
              disabled={loading}
            >
              <Text style={[styles.btnText, { color: theme.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>

            {isSaveMode ? (
              <TouchableOpacity
                style={[styles.btn, styles.primaryBtn, { backgroundColor: theme.primary }, (!detected || loading) && styles.btnDisabled]}
                onPress={handleSave}
                disabled={!detected || loading}
              >
                <Bookmark size={16} color="#ffffff" style={{ marginRight: 6 }} />
                <Text style={[styles.btnText, { color: '#ffffff', fontWeight: '700' }]}>Save Reference</Text>
              </TouchableOpacity>
            ) : (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  style={[styles.btn, styles.secondaryBtn, { borderColor: theme.border }, (!detected || loading) && styles.btnDisabled]}
                  onPress={handleSave}
                  disabled={!detected || loading}
                >
                  <Bookmark size={15} color={theme.primary} />
                  <Text style={[styles.btnText, { color: theme.primary, marginLeft: 4 }]}>Save</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.btn, styles.primaryBtn, { backgroundColor: theme.primary }, (!detected || loading) && styles.btnDisabled]}
                  onPress={handleOpen}
                  disabled={!detected || loading}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <>
                      <ExternalLink size={16} color="#ffffff" style={{ marginRight: 6 }} />
                      <Text style={[styles.btnText, { color: '#ffffff', fontWeight: '700' }]}>Open Now</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
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
    maxHeight: '88%',
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
    marginBottom: 14,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 6,
  },
  body: {
    marginBottom: 16,
  },
  description: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 16,
  },
  fieldGroup: {
    marginBottom: 14,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    height: 46,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 14,
  },
  detectBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
  },
  detectText: {
    fontSize: 13,
    fontWeight: '600',
  },
  infoBanner: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
  },
  infoBannerText: {
    fontSize: 12,
    fontWeight: '600',
  },
  keySection: {
    marginTop: 4,
    marginBottom: 12,
  },
  keyToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  keyToggleText: {
    fontSize: 13,
    fontWeight: '600',
  },
  subHint: {
    fontSize: 11,
    marginTop: 4,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  loadingText: {
    fontSize: 13,
    fontWeight: '500',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(150, 150, 150, 0.2)',
  },
  btn: {
    height: 44,
    paddingHorizontal: 18,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtn: {
    borderWidth: 1,
  },
  secondaryBtn: {
    borderWidth: 1,
  },
  primaryBtn: {
    minWidth: 120,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  btnText: {
    fontSize: 14,
  },
});
