import React, { useRef, useEffect, useState, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Image,
  Text,
  ScrollView,
  Animated,
  PanResponder,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import * as FileSystem from 'expo-file-system';
import { MobileDoc, ReaderSettings } from '../types';
import { THEMES } from '../theme/colors';
import { Api } from '../services/api';
import { Storage } from '../services/storage';
import { getWorkspaceBlob } from '../services/webIdb';
import { safUriToFilePath } from '../services/folder';
import { buildReaderHtml } from './readerHtmlBuilder';

let NativeWebView: any = null;
if (Platform.OS !== 'web') {
  try {
    NativeWebView = require('react-native-webview').WebView;
  } catch {
    NativeWebView = null;
  }
}

interface HybridReaderProps {
  doc: MobileDoc;
  settings: ReaderSettings;
  onPositionChange?: (position: { page?: number; scroll?: number; zoom?: number; time?: number; total?: number; percentage?: number }) => void;
}

const NativeImageViewer: React.FC<{
  imageUri: string;
  name: string;
  themeColors: any;
}> = ({ imageUri, name, themeColors }) => {
  const { width: winWidth, height: winHeight } = Dimensions.get('window');
  const scale = useRef(new Animated.Value(1)).current;
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const [scaleDisplay, setScaleDisplay] = useState(1);

  const scaleNum = useRef(1);
  const panOffset = useRef({ x: 0, y: 0 });
  const touchStartPoint = useRef({ x: 0, y: 0 });
  const initialPanAtTouch = useRef({ x: 0, y: 0 });
  const initialDistance = useRef(0);
  const baseScaleOnPinch = useRef(1);
  const basePanOnPinch = useRef({ x: 0, y: 0 });
  const screenFocalOnPinch = useRef({ x: 0, y: 0 });
  const isPinching = useRef(false);
  const activeTouchCount = useRef(0);
  const lastTapTime = useRef(0);

  const clampBounds = (x: number, y: number, currentScale: number) => {
    if (currentScale <= 1.05) {
      return { x: 0, y: 0 };
    }
    const maxBoundX = Math.max(0, (winWidth * 0.94 * (currentScale - 1)) / 2 + 30);
    const maxBoundY = Math.max(0, (winHeight * 0.88 * (currentScale - 1)) / 2 + 50);
    return {
      x: Math.min(maxBoundX, Math.max(-maxBoundX, x)),
      y: Math.min(maxBoundY, Math.max(-maxBoundY, y)),
    };
  };

  const animateTo = (newScale: number, targetX?: number, targetY?: number) => {
    const clampedScale = Math.min(6, Math.max(1, newScale));
    scaleNum.current = clampedScale;
    setScaleDisplay(clampedScale);

    const bounded = clampBounds(
      targetX !== undefined ? targetX : panOffset.current.x,
      targetY !== undefined ? targetY : panOffset.current.y,
      clampedScale
    );
    panOffset.current = bounded;

    Animated.parallel([
      Animated.spring(scale, {
        toValue: clampedScale,
        useNativeDriver: true,
        friction: 8,
        tension: 40,
      }),
      Animated.spring(pan, {
        toValue: bounded,
        useNativeDriver: true,
        friction: 8,
        tension: 40,
      }),
    ]).start();
  };

  const startPinch = (touches: any[]) => {
    const [t0, t1] = touches;
    initialDistance.current = Math.max(1, Math.hypot(t0.pageX - t1.pageX, t0.pageY - t1.pageY));
    baseScaleOnPinch.current = Math.max(scaleNum.current, 0.001);
    basePanOnPinch.current = { ...panOffset.current };
    screenFocalOnPinch.current = {
      x: (t0.pageX + t1.pageX) / 2 - winWidth / 2,
      y: (t0.pageY + t1.pageY) / 2 - winHeight / 2,
    };
    isPinching.current = true;
  };

  const applyPinch = (touches: any[]) => {
    const [t0, t1] = touches;
    const currentDistance = Math.max(1, Math.hypot(t0.pageX - t1.pageX, t0.pageY - t1.pageY));
    if (initialDistance.current <= 0) return;
    const ratio = currentDistance / initialDistance.current;
    const s0 = baseScaleOnPinch.current;
    const targetScale = Math.min(6, Math.max(1, s0 * ratio));

    const fx = screenFocalOnPinch.current.x;
    const fy = screenFocalOnPinch.current.y;
    const bx = basePanOnPinch.current.x;
    const by = basePanOnPinch.current.y;
    const factor = (targetScale - s0) / s0;
    const rawX = bx - factor * (fx - bx);
    const rawY = by - factor * (fy - by);

    const bounded = clampBounds(rawX, rawY, targetScale);
    scale.setValue(targetScale);
    pan.setValue(bounded);
    panOffset.current = bounded;
    scaleNum.current = targetScale;
    setScaleDisplay(targetScale);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,

      onPanResponderGrant: (evt) => {
        const touches = evt.nativeEvent.touches;
        if (touches.length >= 2) {
          startPinch(touches);
          activeTouchCount.current = touches.length;
        } else if (touches.length === 1) {
          isPinching.current = false;
          activeTouchCount.current = 1;
          touchStartPoint.current = { x: touches[0].pageX, y: touches[0].pageY };
          initialPanAtTouch.current = { ...panOffset.current };

          const now = Date.now();
          if (now - lastTapTime.current < 320) {
            lastTapTime.current = 0;
            activeTouchCount.current = 0;
            touchStartPoint.current = { x: touches[0].pageX, y: touches[0].pageY };
            initialPanAtTouch.current = { ...panOffset.current };
            if (scaleNum.current > 1.3) {
              animateTo(1, 0, 0);
            } else {
              const s0 = Math.max(scaleNum.current, 0.001);
              const target = 2.6;
              const fx = touches[0].pageX - winWidth / 2;
              const fy = touches[0].pageY - winHeight / 2;
              const factor = (target - s0) / s0;
              animateTo(target, panOffset.current.x - factor * (fx - panOffset.current.x), panOffset.current.y - factor * (fy - panOffset.current.y));
            }
            return;
          }
          lastTapTime.current = now;
        }
      },

      onPanResponderMove: (evt) => {
        const touches = evt.nativeEvent.touches;
        const count = touches.length;
        const prevCount = activeTouchCount.current;

        if (count !== prevCount) {
          if (prevCount <= 1 && count >= 2) {
            startPinch(touches);
          } else if (prevCount >= 2 && count === 1) {
            isPinching.current = false;
            const remaining = touches[0];
            touchStartPoint.current = { x: remaining.pageX, y: remaining.pageY };
            initialPanAtTouch.current = { ...panOffset.current };
          }
          activeTouchCount.current = count;
        }

        if (isPinching.current && count >= 2) {
          applyPinch(touches);
        } else if (count === 1 && !isPinching.current) {
          const dx = touches[0].pageX - touchStartPoint.current.x;
          const dy = touches[0].pageY - touchStartPoint.current.y;

          if (scaleNum.current > 1.05) {
            const rawX = initialPanAtTouch.current.x + dx;
            const rawY = initialPanAtTouch.current.y + dy;
            const bounded = clampBounds(rawX, rawY, scaleNum.current);
            pan.setValue(bounded);
            panOffset.current = bounded;
          }
        }
      },

      onPanResponderRelease: () => {
        isPinching.current = false;
        activeTouchCount.current = 0;
        if (scaleNum.current <= 1.05) {
          animateTo(1, 0, 0);
        } else {
          const bounded = clampBounds(panOffset.current.x, panOffset.current.y, scaleNum.current);
          animateTo(scaleNum.current, bounded.x, bounded.y);
        }
      },
      onPanResponderTerminate: () => {
        isPinching.current = false;
        activeTouchCount.current = 0;
        animateTo(scaleNum.current <= 1.05 ? 1 : scaleNum.current);
      },
    })
  ).current;

  const zoomIn = () => animateTo(scaleNum.current * 1.35);
  const zoomOut = () => animateTo(scaleNum.current * 0.74);
  const resetZoom = () => animateTo(1, 0, 0);
  const fitWidth = () => animateTo(2.4, 0, 0);

  return (
    <View style={[styles.container, styles.imageNativeContainer, { backgroundColor: themeColors.bg }]}>
      <View style={styles.imageGestureArea} {...panResponder.panHandlers}>
        <Animated.Image
          source={{ uri: imageUri }}
          style={[
            styles.imageHero,
            {
              transform: [{ scale }, { translateX: pan.x }, { translateY: pan.y }],
            },
          ]}
          resizeMode="contain"
        />
      </View>

      <View style={[styles.imageControlPill, { backgroundColor: themeColors.panel, borderColor: themeColors.border }]}>
        <TouchableOpacity style={styles.imagePillBtn} onPress={zoomOut} accessibilityLabel="Zoom out">
          <Text style={[styles.imagePillText, { color: themeColors.fg }]}>−</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.imagePillBtn} onPress={resetZoom} accessibilityLabel="Reset zoom">
          <Text style={[styles.imagePillBadge, { color: themeColors.accent }]}>{Math.round(scaleDisplay * 100)}%</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.imagePillBtn} onPress={zoomIn} accessibilityLabel="Zoom in">
          <Text style={[styles.imagePillText, { color: themeColors.fg }]}>+</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.imagePillBtn, styles.imagePillBtnWide]} onPress={fitWidth} accessibilityLabel="Fit width">
          <Text style={[styles.imagePillLabel, { color: themeColors.fg }]}>Fit</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};


export const HybridReader: React.FC<HybridReaderProps> = ({ doc, settings, onPositionChange }) => {
  const webViewRef = useRef<any>(null);
  const iframeRef = useRef<any>(null);
  const themeColors = THEMES[settings.theme];

  const [dataOverride, setDataOverride] = useState<string | undefined>(undefined);
  const isDriveDoc = Boolean(
    doc.isDrive ||
    doc.driveFileId ||
    (doc.uri && doc.uri.startsWith('gdrive://')) ||
    (doc.id && doc.id.startsWith('drive_'))
  );

  const needsFileRead = !doc.base64Data && Boolean(
    isDriveDoc ||
    (Platform.OS !== 'web' &&
      doc.uri &&
      (doc.uri.startsWith('content://') || doc.uri.startsWith('file://')) &&
      doc.kind !== 'image' &&
      doc.kind !== 'video' &&
      doc.kind !== 'audio')
  );

  const [isFileReading, setIsFileReading] = useState<boolean>(needsFileRead);

  const effectiveDoc = useMemo(
    () => (dataOverride && dataOverride !== doc.base64Data ? { ...doc, base64Data: dataOverride } : doc),
    [doc, dataOverride]
  );

  useEffect(() => {
    setDataOverride(undefined);
    if (doc.base64Data) {
      setIsFileReading(false);
      return;
    }

    let dead = false;

    // 1. Google Drive Document — download file content via Api service
    if (isDriveDoc) {
      const fileId =
        doc.driveFileId ||
        (doc.uri ? doc.uri.replace('gdrive://', '') : doc.id.replace('drive_', ''));

      if (fileId) {
        setIsFileReading(true);
        let exportMime: string | undefined;
        if (doc.mime?.includes('google-apps.document') || doc.mime?.includes('google-apps.presentation')) {
          exportMime = 'application/pdf';
        } else if (doc.mime?.includes('google-apps.spreadsheet')) {
          exportMime = 'text/csv';
        }

        void (async () => {
          try {
            const res = await Api.downloadDriveFile(fileId, exportMime);
            if (!dead && res.base64) {
              setDataOverride(res.base64);
              void Storage.saveDoc({ ...doc, base64Data: res.base64 });
            }
          } catch (err) {
            console.warn('[HybridReader] Drive download error:', err);
          } finally {
            if (!dead) setIsFileReading(false);
          }
        })();
        return () => {
          dead = true;
        };
      }
    }

    // 2. Web browser: check IndexedDB / blob restoration
    if (Platform.OS === 'web') {
      setIsFileReading(true);
      void (async () => {
        try {
          const blob = await getWorkspaceBlob((doc as any).workspaceId, doc.name);
          if (!dead && blob) {
            const b64 = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => {
                const res = reader.result as string;
                resolve(res.includes(',') ? res.split(',')[1] : res);
              };
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
            if (!dead && b64) {
              setDataOverride(b64);
              void Storage.saveDoc({ ...doc, base64Data: b64 });
            }
          } else if (doc.uri && (doc.uri.startsWith('blob:') || doc.uri.startsWith('http') || doc.uri.startsWith('data:'))) {
            if (doc.uri.startsWith('data:')) {
              const b64 = doc.uri.split(',')[1] || doc.uri;
              if (!dead) setDataOverride(b64);
            } else {
              const res = await fetch(doc.uri);
              if (res.ok) {
                const b = await res.blob();
                const b64 = await new Promise<string>((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onload = () => {
                    const r = reader.result as string;
                    resolve(r.includes(',') ? r.split(',')[1] : r);
                  };
                  reader.onerror = reject;
                  reader.readAsDataURL(b);
                });
                if (!dead && b64) setDataOverride(b64);
              }
            }
          }
        } catch (e) {
          console.warn('[HybridReader] web blob restore error:', e);
        } finally {
          if (!dead) setIsFileReading(false);
        }
      })();
      return () => {
        dead = true;
      };
    }

    // 3. Android / iOS native filesystem read
    const uri = doc.uri || '';
    const readable =
      Boolean(uri) &&
      doc.kind !== 'image' &&
      doc.kind !== 'video' &&
      doc.kind !== 'audio';

    if (!readable) {
      setIsFileReading(false);
      return;
    }

    setIsFileReading(true);
    void (async () => {
      try {
        let readUri = uri;
        if (Platform.OS === 'android') {
          const direct = safUriToFilePath(uri);
          if (direct) {
            try {
              const info = await FileSystem.getInfoAsync(direct);
              if (info.exists) readUri = direct;
            } catch {}
          }
        }
        const { StorageAccessFramework } = FileSystem;
        let data: string | null = null;
        if (readUri.startsWith('file://')) {
          data = await FileSystem.readAsStringAsync(readUri, { encoding: FileSystem.EncodingType.Base64 });
        } else if (readUri.startsWith('content://') && StorageAccessFramework) {
          try {
            data = await StorageAccessFramework.readAsStringAsync(readUri, { encoding: FileSystem.EncodingType.Base64 });
          } catch (safErr) {
            const direct = safUriToFilePath(readUri);
            if (direct) {
              data = await FileSystem.readAsStringAsync(direct, { encoding: FileSystem.EncodingType.Base64 });
            } else {
              throw safErr;
            }
          }
        }
        if (!dead && data) {
          setDataOverride(data);
          void Storage.saveDoc({ ...doc, base64Data: data });
        }
      } catch (e) {
        console.warn('[readspace] could not re-read file data for reader:', e);
      } finally {
        if (!dead) setIsFileReading(false);
      }
    })();
    return () => {
      dead = true;
    };
  }, [doc.id, doc.uri, doc.base64Data, doc.isDrive, doc.driveFileId]);

  const htmlContent = useMemo(() => {
    if (doc.kind === 'image' && Platform.OS !== 'web') return '';
    return buildReaderHtml(effectiveDoc, settings, themeColors);
    // Intentionally omit settings from deps so live settings updates flow via postMessage without reloading WebView
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.kind, effectiveDoc.id, effectiveDoc.uri, effectiveDoc.base64Data, effectiveDoc.name]);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const handleWindowMessage = (event: MessageEvent) => {
        try {
          const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
          if (data?.action === 'position' && onPositionChange) {
            onPositionChange(data.position);
          }
        } catch {}
      };
      window.addEventListener('message', handleWindowMessage);
      return () => window.removeEventListener('message', handleWindowMessage);
    }
  }, [onPositionChange]);

  const initialSettingsRef = useRef(settings);
  const hasMountedSettingsRef = useRef(false);

  const postSettingsToReader = () => {
    const payload = JSON.stringify({
      action: 'updateSettings',
      themeColors: THEMES[settings.theme],
      settings: {
        theme: settings.theme,
        fontSize: settings.fontSize,
        lineHeight: settings.lineHeight,
        fontFamily: settings.fontFamily,
        contentWidth: settings.contentWidth,
        readingMode: settings.readingMode,
        nightLight: settings.nightLight,
        textAlign: settings.textAlign,
      },
    });

    if (Platform.OS === 'web') {
      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage(payload, '*');
      }
    } else {
      if (webViewRef.current?.postMessage) {
        webViewRef.current.postMessage(payload);
      }
    }
  };

  useEffect(() => {
    if (!hasMountedSettingsRef.current) {
      hasMountedSettingsRef.current = true;
      return;
    }
    postSettingsToReader();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  const handleWebViewLoaded = () => {
    if (settings !== initialSettingsRef.current) {
      postSettingsToReader();
    }
  };

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.action === 'position' && onPositionChange) {
        onPositionChange(data.position);
      }
    } catch {}
  };

  if (doc.kind === 'image' && (Platform.OS as string) !== 'web') {
    const imageUri = doc.base64Data
      ? (doc.base64Data.startsWith('data:') ? doc.base64Data : `data:${doc.mime || 'image/jpeg'};base64,${doc.base64Data}`)
      : doc.uri;

    return <NativeImageViewer imageUri={imageUri || ''} name={doc.name} themeColors={themeColors} />;
  }

  if (isFileReading) {
    return (
      <View style={[styles.loading, { backgroundColor: themeColors.bg }]}>
        <ActivityIndicator size="large" color={themeColors.accent} />
        <Text style={{ marginTop: 14, color: themeColors.muted, fontSize: 13, fontWeight: '600' }}>
          Opening {doc.name}…
        </Text>
      </View>
    );
  }

  if (Platform.OS === 'web') {
    return (
      <View style={styles.container}>
        <iframe
          ref={iframeRef}
          srcDoc={htmlContent}
          onLoad={handleWebViewLoaded}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            backgroundColor: themeColors.bg,
          }}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {NativeWebView ? (
        <NativeWebView
          key={`${doc.id || doc.name}_${effectiveDoc.base64Data ? 'ready' : 'empty'}`}
          ref={webViewRef}
          originWhitelist={['*']}
          source={{ html: htmlContent }}
          onMessage={handleMessage}
          onLoadEnd={handleWebViewLoaded}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          allowFileAccess={true}
          allowFileAccessFromFileURLs={true}
          allowUniversalAccessFromFileURLs={true}
          allowsInlineMediaPlayback={true}
          mediaPlaybackRequiresUserAction={false}
          scalesPageToFit={false}
          style={[styles.webview, { backgroundColor: themeColors.bg }]}
          renderLoading={() => (
            <View style={styles.loading}>
              <ActivityIndicator size="large" color={themeColors.accent} />
            </View>
          )}
        />
      ) : (
        <View style={styles.loading}>
          <Text style={{ color: themeColors.fg }}>WebView unavailable on this platform</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  loading: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageNativeContainer: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageGestureArea: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageHero: {
    width: '100%',
    height: '100%',
  },
  imageControlPill: {
    position: 'absolute',
    bottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 4,
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
  },
  imagePillBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imagePillBtnWide: {
    width: 44,
  },
  imagePillText: {
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 22,
  },
  imagePillBadge: {
    fontSize: 12,
    fontWeight: '800',
  },
  imagePillLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
});
