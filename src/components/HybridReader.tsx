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
import {
  OFFLINE_MARKED_B64,
  OFFLINE_DOMPURIFY_B64,
  OFFLINE_JSZIP_B64,
  OFFLINE_MAMMOTH_B64,
  OFFLINE_PDFJS_B64,
} from '../vendor/offlineVendors';

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
  onPositionChange?: (position: { page?: number; scroll?: number; zoom?: number; time?: number }) => void;
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

  // Begin (or restart) a pinch gesture: snapshot distance, current scale/pan and
  // the screen-space focal point (midpoint of the two fingers) so the zoom can
  // be anchored around exactly where the user is pinching.
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

  // Scale while keeping the content point under the pinch midpoint visually fixed
  const applyPinch = (touches: any[]) => {
    const [t0, t1] = touches;
    const currentDistance = Math.max(1, Math.hypot(t0.pageX - t1.pageX, t0.pageY - t1.pageY));
    if (initialDistance.current <= 0) return;
    const ratio = currentDistance / initialDistance.current;
    const s0 = baseScaleOnPinch.current;
    const targetScale = Math.min(6, Math.max(1, s0 * ratio));

    // For a center-anchored scale s with translation t, a content point o maps
    // to screen o*s + t. Keeping the focal point fixed gives:
    //   t' = t - (s' - s) * (focal - center - t) / s
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

          // Double tap detection
          const now = Date.now();
          if (now - lastTapTime.current < 320) {
            lastTapTime.current = 0;
            // Swallow the pointer motion right after the double tap
            activeTouchCount.current = 0;
            touchStartPoint.current = { x: touches[0].pageX, y: touches[0].pageY };
            initialPanAtTouch.current = { ...panOffset.current };
            if (scaleNum.current > 1.3) {
              animateTo(1, 0, 0);
            } else {
              // Zoom in anchored at the tapped point
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
            // Second finger landed mid-gesture — the pinch was previously dead
            // because it was only initialized in the grant handler.
            startPinch(touches);
          } else if (prevCount >= 2 && count === 1) {
            // Pinch ended with one finger still down — re-anchor drag on it
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
          fadeDuration={0}
          resizeMethod="scale"
          style={[
            styles.nativeImage,
            {
              transform: [
                { translateX: pan.x },
                { translateY: pan.y },
                { scale },
              ],
            },
          ]}
          resizeMode="contain"
        />
      </View>

      {/* Floating Zoom & Fit Toolbar */}
      <View style={[styles.imageToolbar, { backgroundColor: 'rgba(15, 23, 42, 0.90)', borderColor: themeColors.border }]}>
        <TouchableOpacity style={styles.toolbarBtn} onPress={zoomOut} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.toolbarBtnText}>−</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.scaleBadge} onPress={resetZoom}>
          <Text style={styles.scaleBadgeText}>{Math.round(scaleDisplay * 100)}%</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.toolbarBtn} onPress={zoomIn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.toolbarBtnText}>+</Text>
        </TouchableOpacity>

        <View style={styles.toolbarDivider} />

        <TouchableOpacity style={styles.fitBtn} onPress={fitWidth}>
          <Text style={styles.fitBtnText}>Fit Width</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.fitBtn} onPress={resetZoom}>
          <Text style={[styles.fitBtnText, { color: '#94a3b8' }]}>Reset</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

function buildReaderHtml(doc: MobileDoc, settings: ReaderSettings, themeColors: any): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes">
  <title>${doc.name}</title>
  <!-- Offline-bundled document engines (Guaranteed zero-network execution) -->
  <script>
  (function() {
    function runBundle(b64) {
      if (!b64) return;
      try {
        var code = atob(b64);
        (0, eval)(code);
      } catch(e) {
        try {
          var code2 = decodeURIComponent(escape(atob(b64)));
          (0, eval)(code2);
        } catch(e2) {
          try {
            var s = document.createElement('script');
            s.textContent = atob(b64);
            document.head.appendChild(s);
          } catch(e3) {
            console.warn('Bundle load error:', e3);
          }
        }
      }
    }
    runBundle(${JSON.stringify(OFFLINE_MARKED_B64)});
    runBundle(${JSON.stringify(OFFLINE_DOMPURIFY_B64)});
    runBundle(${JSON.stringify(OFFLINE_JSZIP_B64)});
    runBundle(${JSON.stringify(OFFLINE_MAMMOTH_B64)});
    runBundle(${JSON.stringify(OFFLINE_PDFJS_B64)});
  })();
  </script>
  <!-- CDNs for fallback when online -->
  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/marked/9.1.6/marked.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.0.6/purify.min.js"></script>
  <style>
    :root {
      --bg: ${themeColors.bg};
      --panel: ${themeColors.panel};
      --border: ${themeColors.border};
      --fg: ${themeColors.fg};
      --muted: ${themeColors.muted};
      --accent: ${themeColors.accent};
      --accent-fg: ${themeColors.accentFg};
      --pdf-bg: ${themeColors.pdfBg};
    }
    * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    body {
      margin: 0;
      padding: 0;
      background: var(--bg);
      color: var(--fg);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: ${settings.fontSize}px;
      line-height: ${settings.lineHeight};
      overflow-x: hidden;
    }
    
    /* PDF Viewer */
    .pdf-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 14px 10px 80px;
      background: var(--pdf-bg);
      min-height: 100vh;
    }
    .pdf-page {
      margin-bottom: 14px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.15);
      border-radius: 4px;
      overflow: hidden;
      background: #fff;
    }
    .pdf-page canvas {
      display: block;
      width: 100%;
      height: 100%;
      image-rendering: -webkit-optimize-contrast;
      image-rendering: high-quality;
    }
    img {
      max-width: 100%;
      height: auto;
      image-rendering: -webkit-optimize-contrast;
      image-rendering: high-quality;
    }
    .pdf-page-inner { position: relative; overflow: hidden; margin: 0 auto; background: #fff; }
    .textLayer { position: absolute; inset: 0; overflow: hidden; line-height: 1; text-size-adjust: none; }
    .textLayer span { color: transparent; position: absolute; white-space: pre; cursor: text; transform-origin: 0% 0%; }
    .textLayer ::selection { background: rgba(59, 130, 246, 0.35); }
    .rs-toast {
      position: fixed;
      bottom: 64px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(15, 23, 42, 0.95);
      color: #ffffff;
      padding: 9px 15px;
      border-radius: 10px;
      font-size: 12.5px;
      z-index: 60;
      opacity: 0;
      transition: opacity 0.25s;
      pointer-events: none;
    }
    .rs-toast.show { opacity: 1; }

    /* Presentation (PPTX) Viewer */
    .pptx-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 14px 10px 80px;
      min-height: 100vh;
    }
    .pptx-card {
      width: 100%;
      max-width: 680px;
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 16px;
      box-shadow: 0 8px 30px rgba(0,0,0,0.1);
      padding: 24px 20px;
      margin-bottom: 16px;
    }
    .pptx-slide-title {
      font-size: 20px;
      font-weight: 700;
      margin-top: 0;
      margin-bottom: 14px;
      border-bottom: 2px solid var(--border);
      padding-bottom: 8px;
    }
    .pptx-bullets {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .pptx-bullet {
      font-size: 15px;
      line-height: 1.5;
    }

    /* Audio Player */
    .audio-wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 30px 16px 80px;
      min-height: 80vh;
    }
    .audio-card {
      width: 100%;
      max-width: 480px;
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 20px;
      box-shadow: 0 12px 36px rgba(0,0,0,0.12);
      padding: 28px 22px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 18px;
    }
    .audio-disc {
      width: 100px;
      height: 100px;
      border-radius: 50%;
      background: radial-gradient(circle, #2a2d34 25%, #181a1f 26%, #181a1f 60%, #2a2d34 61%, #111317 100%);
      border: 4px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 32px;
      box-shadow: 0 6px 20px rgba(0,0,0,0.3);
      animation: disc-spin 3.6s linear infinite;
    }
    @keyframes disc-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    .audio-title {
      font-size: 18px;
      font-weight: 700;
      text-align: center;
      margin: 0;
    }
    .audio-controls {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .audio-play-btn {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: var(--accent);
      color: var(--accent-fg);
      border: none;
      font-size: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }
    .audio-progress {
      width: 100%;
      height: 6px;
      background: var(--border);
      border-radius: 4px;
      position: relative;
    }
    .audio-progress-fill {
      height: 100%;
      background: var(--accent);
      border-radius: 4px;
      width: 0%;
    }

    /* Video Player */
    .video-wrap {
      width: 100%;
      height: 100vh;
      background: #000;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    video {
      max-width: 100%;
      max-height: 100%;
    }

    /* Image Viewer */
    .image-viewer-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 85vh;
      padding: 20px 14px 80px;
      background: var(--bg);
    }
    .responsive-image {
      max-width: 100%;
      max-height: 75vh;
      object-fit: contain;
      border-radius: 8px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.18);
    }
    .image-info-bar {
      margin-top: 14px;
      font-size: 13px;
      color: var(--muted);
      text-align: center;
      max-width: 90%;
      word-break: break-all;
    }

    /* Document Reader (Markdown / Text / DOCX / HTML) */
    .reader-body {
      padding: 20px 18px 80px;
      user-select: text;
      -webkit-user-select: text;
      max-width: 760px;
      margin: 0 auto;
      word-break: break-word;
      overflow-wrap: break-word;
    }
    .reader-body h1 { font-size: 1.7em; margin: 1.2em 0 0.5em; font-weight: 700; line-height: 1.25; }
    .reader-body h2 { font-size: 1.4em; margin: 1.1em 0 0.4em; font-weight: 600; border-bottom: 1px solid var(--border); padding-bottom: 6px; }
    .reader-body h3 { font-size: 1.2em; margin: 1em 0 0.3em; font-weight: 600; }
    .reader-body h4 { font-size: 1.05em; margin: 0.9em 0 0.25em; font-weight: 600; }
    .reader-body p { margin: 0.8em 0; line-height: inherit; }
    .reader-body ul, .reader-body ol { padding-left: 24px; margin: 0.8em 0; }
    .reader-body li { margin: 0.35em 0; }
    .reader-body blockquote {
      margin: 1em 0;
      padding: 8px 16px;
      border-left: 4px solid var(--accent);
      background: var(--panel);
      color: var(--muted);
      border-radius: 0 8px 8px 0;
    }
    .reader-body code {
      background: rgba(150, 150, 150, 0.15);
      padding: 2px 6px;
      border-radius: 4px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.9em;
    }
    .reader-body pre {
      background: rgba(150, 150, 150, 0.12);
      padding: 14px 16px;
      border-radius: 8px;
      overflow-x: auto;
      font-size: 0.9em;
      border: 1px solid var(--border);
    }
    .reader-body pre code {
      background: transparent;
      padding: 0;
      border-radius: 0;
    }
    .reader-body table { width: 100%; border-collapse: collapse; margin: 1em 0; overflow-x: auto; display: block; }
    .reader-body th, .reader-body td { border: 1px solid var(--border); padding: 8px 12px; text-align: left; }
    .reader-body th { background: var(--panel); font-weight: 600; }
    .reader-body hr { border: none; border-top: 1px solid var(--border); margin: 24px 0; }
    .reader-body a { color: var(--accent); text-decoration: underline; }
    .reader-body img { max-width: 100%; height: auto; border-radius: 6px; }
    .reader-body svg { max-width: 100%; height: auto; }
    .html-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 10px 14px;
      margin-bottom: 16px;
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 10px;
    }
    .html-toggle-group {
      display: inline-flex;
      border: 1px solid var(--border);
      border-radius: 8px;
      overflow: hidden;
    }
    .html-toggle-btn {
      padding: 6px 12px;
      font-size: 12px;
      font-weight: 600;
      border: none;
      background: transparent;
      color: var(--muted);
      cursor: pointer;
    }
    .html-toggle-btn.active {
      background: var(--accent);
      color: var(--accent-fg);
    }
    .loading-spinner {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 70vh;
      color: var(--muted);
      font-size: 14px;
      gap: 12px;
    }
    .btn {
      padding: 8px 16px;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: var(--panel);
      color: var(--fg);
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <div id="root">
    <div class="loading-spinner">
      <div style="font-size: 32px;">📖</div>
      <div>Loading ${doc.name}…</div>
    </div>
  </div>

  <script>
    const docKind = ${JSON.stringify(doc.kind || 'text')};
    const docName = ${JSON.stringify(doc.name || 'Document')};
    const docBase64 = ${JSON.stringify(doc.base64Data || '')};
    const docUri = ${JSON.stringify(doc.uri || '')};
    const docStreamUrl = ${JSON.stringify((doc as any).streamUrl || '')};

    function sendPosition(pos) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          action: 'position',
          position: pos
        }));
      } else if (window.parent) {
        window.parent.postMessage(JSON.stringify({
          action: 'position',
          position: pos
        }), '*');
      }
    }

    function base64ToUint8Array(base64) {
      const binary = atob(base64);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    }

    function decodeUtf8Base64(base64) {
      if (!base64) return '';
      try {
        const binString = atob(base64);
        const bytes = Uint8Array.from(binString, (m) => m.charCodeAt(0));
        return new TextDecoder('utf-8').decode(bytes);
      } catch (e) {
        try {
          return decodeURIComponent(escape(atob(base64)));
        } catch {
          return atob(base64);
        }
      }
    }

    function escapeHtml(str) {
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function rsToast(msg) {
      let t = document.querySelector('.rs-toast');
      if (!t) {
        t = document.createElement('div');
        t.className = 'rs-toast';
        document.body.appendChild(t);
      }
      t.textContent = msg;
      t.classList.add('show');
      clearTimeout(t.__rsTimer);
      t.__rsTimer = setTimeout(() => t.classList.remove('show'), 1900);
    }

    async function renderDoc() {
      const root = document.getElementById('root');

      try {
        if (docKind === 'pdf') {
          root.innerHTML = '<div class="pdf-container" id="pdfRoot"></div>';
          const pdfRoot = document.getElementById('pdfRoot');

          if (!docBase64) {
            pdfRoot.innerHTML = '<div style="padding:20px;">PDF loading requires file data. Please re-open.</div>';
            return;
          }

          if (typeof pdfjsLib === 'undefined') {
            pdfRoot.innerHTML = '<div style="padding:20px;">PDF engine could not load. Re-open once online to cache it.</div>';
            return;
          }

          try {
            if (navigator.onLine) {
              pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            } else {
              pdfjsLib.GlobalWorkerOptions.workerSrc = '';
            }
          } catch {
            pdfjsLib.GlobalWorkerOptions.workerSrc = '';
          }

          const pdf = await pdfjsLib.getDocument({ data: base64ToUint8Array(docBase64), disableWorker: !navigator.onLine }).promise;
          window.__rsPdf = pdf;

          // Cheap per-page placeholders first; real pages render progressively,
          // so even huge PDFs open instantly and stay smooth while scrolling.
          const placeholders = [];
          for (let i = 1; i <= pdf.numPages; i++) {
            const pageDiv = document.createElement('div');
            pageDiv.className = 'pdf-page';
            pageDiv.dataset.pageNumber = String(i);
            pdfRoot.appendChild(pageDiv);
            placeholders.push(pageDiv);
            (async () => {
              try {
                const p = await pdf.getPage(i);
                const v1 = p.getViewport({ scale: 1 });
                pageDiv.style.aspectRatio = v1.width + ' / ' + v1.height;
              } catch (e) { /* best effort */ }
            })();
          }

          const renderingNow = new Set();
          const pendingRender = new Set();
          const pump = () => {
            const iter = pendingRender.values();
            let nextVal = iter.next();
            while (renderingNow.size < 2 && nextVal && nextVal.value) {
              pendingRender.delete(nextVal.value);
              renderOne(nextVal.value);
              nextVal = iter.next();
            }
          };

          const renderOne = async (pageDiv) => {
            const num = Number(pageDiv.dataset.pageNumber);
            renderingNow.add(pageDiv);
            try {
              const page = await pdf.getPage(num);
              if (!pageDiv.isConnected) { renderingNow.delete(pageDiv); return; }
              const vp1 = page.getViewport({ scale: 1 });
              const cssWidth = Math.round(pageDiv.clientWidth || document.documentElement.clientWidth - 20);
              const baseScale = cssWidth / vp1.width;

              // High-DPI crisp rendering: 3.2x+ resolution guarantees razor-sharp text on zoom
              const dpr = Math.min(Math.max(window.devicePixelRatio || 1, 2), 3.5);
              const crispMultiplier = Math.max(dpr * 1.5, 3.2);
              const renderScale = baseScale * crispMultiplier;
              const viewport = page.getViewport({ scale: renderScale });

              const wrap = document.createElement('div');
              wrap.className = 'pdf-page-inner';
              wrap.style.width = cssWidth + 'px';
              wrap.style.height = Math.round(cssWidth * (vp1.height / vp1.width)) + 'px';
              pageDiv.style.width = cssWidth + 'px';
              const canvas = document.createElement('canvas');
              canvas.width = Math.round(viewport.width);
              canvas.height = Math.round(viewport.height);
              canvas.style.width = '100%';
              canvas.style.height = '100%';
              wrap.appendChild(canvas);
              pageDiv.replaceChildren(wrap);
              pageDiv.style.aspectRatio = vp1.width + ' / ' + vp1.height;
              const ctx = canvas.getContext('2d', { alpha: false });
              if (ctx) {
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
              }
              await page.render({ canvasContext: ctx, viewport: viewport }).promise;

              // Text layer aligned to baseScale makes PDF text selectable & copyable via native selection
              try {
                if (typeof pdfjsLib.renderTextLayer === 'function') {
                  const content = await page.getTextContent();
                  const layer = document.createElement('div');
                  layer.className = 'textLayer';
                  layer.style.position = 'absolute';
                  layer.style.inset = '0';
                  layer.style.overflow = 'hidden';
                  layer.style.lineHeight = '1';
                  wrap.appendChild(layer);
                  const textViewport = page.getViewport({ scale: baseScale });
                  pdfjsLib.renderTextLayer({ textContentSource: content, container: layer, viewport: textViewport });
                }
              } catch (e) { /* text layer is best effort */ }
            } catch (e) {
              console.warn('pdf page render failed', e);
            } finally {
              renderingNow.delete(pageDiv);
              pump();
            }
          };

          // Lazy render pages as the user approaches them; free far-away canvases
          // so memory stays flat even with many documents open.
          const leafMargin = Math.round((window.innerHeight || 900) * 1.5) + 'px';
          const io = new IntersectionObserver((entries) => {
            for (const en of entries) {
              const el = en.target;
              if (en.isIntersecting) {
                if (!el.dataset.rendered) { el.dataset.rendered = '1'; pendingRender.add(el); }
              } else if (el.dataset.rendered) {
                const box = el.getBoundingClientRect();
                const margin = (window.innerHeight || 900) * 2.5;
                if (box.bottom < -margin || box.top > (window.innerHeight || 900) + margin) {
                  el.replaceChildren();
                  delete el.dataset.rendered;
                  renderingNow.delete(el);
                  pendingRender.delete(el);
                }
              }
            }
            pump();
          }, { root: null, rootMargin: leafMargin });
          placeholders.forEach((el) => io.observe(el));
          pump();

          // Listen for pinch-zoom to re-render visible pages at extra high scale
          if (window.visualViewport) {
            let zoomDebounce = null;
            let lastScale = 1;
            window.visualViewport.addEventListener('resize', () => {
              clearTimeout(zoomDebounce);
              zoomDebounce = setTimeout(() => {
                const curScale = window.visualViewport.scale || 1;
                if (curScale > 1.25 && Math.abs(curScale - lastScale) > 0.4) {
                  lastScale = curScale;
                  const visiblePages = placeholders.filter((el) => {
                    const r = el.getBoundingClientRect();
                    return r.bottom > 0 && r.top < window.innerHeight;
                  });
                  visiblePages.forEach((p) => {
                    p.dataset.rendered = '1';
                    pendingRender.add(p);
                  });
                  pump();
                }
              }, 400);
            });
          }
        } else if (docKind === 'pptx') {
          if (!docBase64) throw new Error('No PPTX data');
          const zip = await JSZip.loadAsync(base64ToUint8Array(docBase64));
          const slideFiles = [];
          zip.forEach((path) => {
            const m = path.match(/^ppt\\/slides\\/slide(\\d+)\\.xml$/i);
            if (m) slideFiles.push({ path, num: parseInt(m[1], 10) });
          });
          slideFiles.sort((a, b) => a.num - b.num);

          let slidesHtml = '';
          const parser = new DOMParser();

          for (let i = 0; i < slideFiles.length; i++) {
            const xml = await zip.file(slideFiles[i].path).async('string');
            const doc = parser.parseFromString(xml, 'application/xml');
            let title = 'Slide ' + (i + 1);
            const titleEl = doc.querySelector('p\\\\:sp p\\\\:ph[type="title"], p\\\\:sp p\\\\:ph[type="ctrTitle"]');
            if (titleEl) {
              const textEl = titleEl.closest('p\\\\:sp')?.querySelector('a\\\\:t');
              if (textEl && textEl.textContent) title = textEl.textContent.trim();
            }

            const bullets = [];
            const textNodes = doc.querySelectorAll('a\\\\:p');
            textNodes.forEach(p => {
              const t = p.textContent?.trim();
              if (t && t !== title) bullets.push(t);
            });

            slidesHtml += \`
              <div class="pptx-card">
                <h3 class="pptx-slide-title">Slide \${i + 1}: \${title}</h3>
                <div class="pptx-bullets">
                  \${bullets.map(b => '<div class="pptx-bullet">• ' + b + '</div>').join('')}
                </div>
              </div>
            \`;
          }

          root.innerHTML = '<div class="pptx-container">' + slidesHtml + '</div>';
        } else if (docKind === 'audio') {
          const audioUrl = docStreamUrl || docUri || (docBase64 ? 'data:audio/mpeg;base64,' + docBase64 : '');
          root.innerHTML = '<div class="audio-wrap">' +
            '<div class="audio-card">' +
              '<div class="audio-disc">🎵</div>' +
              '<h2 class="audio-title">' + escapeHtml(docName) + '</h2>' +
              '<div class="audio-progress">' +
                '<div class="audio-progress-fill" id="audioFill"></div>' +
              '</div>' +
              '<div class="audio-controls">' +
                '<button class="btn" onclick="skipAudio(-10)">↺ 10s</button>' +
                '<button class="audio-play-btn" id="playBtn" onclick="toggleAudio()">▶</button>' +
                '<button class="btn" onclick="skipAudio(10)">10s ↻</button>' +
              '</div>' +
              '<audio id="audioEl" src="' + audioUrl + '"></audio>' +
            '</div>' +
          '</div>';

          const audio = document.getElementById('audioEl');
          const playBtn = document.getElementById('playBtn');
          const fill = document.getElementById('audioFill');

          window.toggleAudio = function() {
            if (audio.paused) {
              audio.play();
              playBtn.textContent = '⏸';
            } else {
              audio.pause();
              playBtn.textContent = '▶';
            }
          };

          window.skipAudio = function(s) {
            audio.currentTime = Math.max(0, audio.currentTime + s);
          };

          audio.ontimeupdate = () => {
            if (audio.duration) {
              fill.style.width = (audio.currentTime / audio.duration * 100) + '%';
            }
          };
        } else if (docKind === 'video') {
          const videoUrl = docStreamUrl || docUri || (docBase64 ? 'data:video/mp4;base64,' + docBase64 : '');
          root.innerHTML = '<div class="video-wrap">' +
            '<video src="' + videoUrl + '" controls playsinline autoplay style="max-width:100%; max-height:88vh; outline:none; border-radius:10px;"></video>' +
          '</div>';
        } else if (docKind === 'image') {
          let imgSrc = '';
          if (docBase64) {
            if (docBase64.startsWith('data:image/')) {
              imgSrc = docBase64;
            } else {
              let mimeType = 'image/jpeg';
              if (docBase64.indexOf('iVBORw0KGgo') === 0 || docName.match(/\.png$/i)) mimeType = 'image/png';
              else if (docBase64.indexOf('R0lGOD') === 0 || docName.match(/\.gif$/i)) mimeType = 'image/gif';
              else if (docBase64.indexOf('UklGR') === 0 || docName.match(/\.webp$/i)) mimeType = 'image/webp';
              else if (docName.match(/\.svg$/i)) mimeType = 'image/svg+xml';
              else if (docName.match(/\.bmp$/i)) mimeType = 'image/bmp';
              else if (docName.match(/\.ico$/i)) mimeType = 'image/x-icon';
              imgSrc = 'data:' + mimeType + ';base64,' + docBase64;
            }
          } else if (docUri) {
            imgSrc = docUri;
          }

          if (!imgSrc) {
            root.innerHTML = '<div class="loading-spinner"><p>⚠️ No image data found</p></div>';
            return;
          }

          root.innerHTML = '<div class="image-viewer-container">' +
            '<img src="' + imgSrc + '" alt="' + escapeHtml(docName) + '" class="responsive-image" />' +
            '<div class="image-info-bar">' + escapeHtml(docName) + '</div>' +
          '</div>';
        } else if (docKind === 'docx') {
          if (!docBase64) throw new Error('No DOCX data');
          const res = await mammoth.convertToHtml({ arrayBuffer: base64ToUint8Array(docBase64) });
          root.innerHTML = '<div class="reader-body">' + DOMPurify.sanitize(res.value) + '</div>';
        } else if (docKind === 'markdown') {
          let rawText = '';
          if (docBase64) {
            rawText = decodeUtf8Base64(docBase64);
          } else if (docUri) {
            try {
              const res = await fetch(docUri);
              if (res.ok) rawText = await res.text();
            } catch (err) {
              console.warn('Could not fetch markdown from docUri:', err);
            }
          }

          let dirty = '';
          var markedParser = (typeof marked !== 'undefined' ? marked : (typeof window !== 'undefined' ? window.marked : null));
          if (markedParser && typeof markedParser.parse === 'function') {
            dirty = markedParser.parse(rawText || '');
          } else if (typeof markedParser === 'function') {
            dirty = markedParser(rawText || '');
          } else {
            dirty = '<pre>' + escapeHtml(rawText || '') + '</pre>';
          }

          // Rewrite <embed>/<object> SVG references to <img> so they render properly
          const pre = new DOMParser().parseFromString(dirty, 'text/html');
          const embeds = Array.from(pre.querySelectorAll('embed[src], object[data]'));
          if (embeds.length) {
            for (const el of embeds) {
              const src = el.getAttribute('src') || el.getAttribute('data') || '';
              const type = (el.getAttribute('type') || '').toLowerCase();
              const looksSvg = type.includes('svg') || (!type && /\.svg($|[?#])/i.test(src));
              if (!src || !looksSvg) continue;
              const img = pre.createElement('img');
              img.setAttribute('src', src);
              img.setAttribute('alt', el.getAttribute('aria-label') || el.getAttribute('title') || 'svg diagram');
              el.replaceWith(img);
            }
            dirty = pre.body.innerHTML;
          }

          // Sanitizer config that keeps inline SVG renderable (draw.io/Excalidraw, foreignObject, use)
          const MD_SANITIZE = {
            ADD_TAGS: ['use', 'foreignObject'],
            ADD_ATTR: ['target', 'id', 'xlink:href'],
            HTML_INTEGRATION_POINTS: { 'annotation-xml': true, foreignobject: true, desc: true, title: true }
          };
          const sanitizer = (typeof DOMPurify !== 'undefined' ? DOMPurify : (typeof window !== 'undefined' ? window.DOMPurify : null));
          const clean = (sanitizer && typeof sanitizer.sanitize === 'function') ? sanitizer.sanitize(dirty, MD_SANITIZE) : dirty;
          const postDoc = new DOMParser().parseFromString(clean, 'text/html');

          // Restrict <use> tags to only in-document fragments for security
          postDoc.querySelectorAll('use').forEach(u => {
            ['href', 'xlink:href'].forEach(attr => {
              const val = u.getAttribute(attr);
              if (val && !val.startsWith('#')) u.removeAttribute(attr);
            });
          });

          // Scale inline SVG without explicit dimensions but with viewBox
          postDoc.querySelectorAll('svg').forEach(s => {
            if (!s.getAttribute('width') && !s.getAttribute('height') && s.getAttribute('viewBox')) {
              s.setAttribute('width', '100%');
            }
          });

          // Ensure links open in new tab
          postDoc.querySelectorAll('a[href]').forEach(a => {
            a.setAttribute('target', '_blank');
            a.setAttribute('rel', 'noopener noreferrer');
          });

          root.innerHTML = '<div class="reader-body">' + postDoc.body.innerHTML + '</div>';
        } else if (docKind === 'html') {
          let rawHtml = '';
          if (docBase64) {
            rawHtml = decodeUtf8Base64(docBase64);
          } else if (docUri) {
            try {
              const res = await fetch(docUri);
              if (res.ok) rawHtml = await res.text();
            } catch (err) {
              console.warn('Could not fetch HTML from docUri:', err);
            }
          }

          const sanitizer = (typeof DOMPurify !== 'undefined' ? DOMPurify : (typeof window !== 'undefined' ? window.DOMPurify : null));
          const cleanHtml = sanitizer && typeof sanitizer.sanitize === 'function'
            ? sanitizer.sanitize(rawHtml, {
                ADD_TAGS: ['style', 'link', 'use', 'foreignObject', 'iframe', 'svg', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
                ADD_ATTR: ['target', 'id', 'xlink:href', 'src', 'href', 'style', 'class', 'width', 'height', 'align', 'colspan', 'rowspan'],
                WHOLE_DOCUMENT: false,
              })
            : rawHtml;

          window._rawHtmlCode = rawHtml;
          window._cleanHtmlPreview = cleanHtml;

          window.switchHtmlView = function(mode) {
            const previewEl = document.getElementById('htmlPreviewPane');
            const codeEl = document.getElementById('htmlCodePane');
            const btnPrev = document.getElementById('btnHtmlPreview');
            const btnCode = document.getElementById('btnHtmlCode');
            if (mode === 'preview') {
              if (previewEl) previewEl.style.display = 'block';
              if (codeEl) codeEl.style.display = 'none';
              if (btnPrev) btnPrev.classList.add('active');
              if (btnCode) btnCode.classList.remove('active');
            } else {
              if (previewEl) previewEl.style.display = 'none';
              if (codeEl) codeEl.style.display = 'block';
              if (btnPrev) btnPrev.classList.remove('active');
              if (btnCode) btnCode.classList.add('active');
            }
          };

          root.innerHTML = \`
            <div class="reader-body">
              <div class="html-toolbar">
                <span style="font-size:12px; font-weight:600; color:var(--muted);">🌐 HTML Document</span>
                <div class="html-toggle-group">
                  <button type="button" id="btnHtmlPreview" class="html-toggle-btn active" onclick="switchHtmlView('preview')">👁️ Preview</button>
                  <button type="button" id="btnHtmlCode" class="html-toggle-btn" onclick="switchHtmlView('code')">&lt;/&gt; Source</button>
                </div>
              </div>
              <div id="htmlPreviewPane" class="html-preview-content" style="background:var(--card); border:1px solid var(--border); border-radius:10px; padding:18px; min-height:400px; overflow-x:auto;">
                \${cleanHtml || '<div style="padding:40px; text-align:center; color:var(--muted);">Empty HTML document</div>'}
              </div>
              <div id="htmlCodePane" style="display:none;">
                <pre class="reader-code" style="white-space: pre-wrap; font-family: monospace; font-size: 13px; line-height: 1.5; padding:16px; background:var(--panel); border:1px solid var(--border); border-radius:10px;">\${escapeHtml(rawHtml)}</pre>
              </div>
            </div>
          \`;
        } else {
          // Plain Text or Notes
          // Guard: Detect if binary JPEG or image was incorrectly routed to plain text
          var isImageB64 = docBase64 && (
            docBase64.indexOf('/9j/') === 0 ||
            docBase64.indexOf('iVBORw0KGgo') === 0 ||
            docBase64.indexOf('R0lGOD') === 0 ||
            docBase64.indexOf('UklGR') === 0 ||
            docBase64.slice(0, 50).indexOf('JFIF') !== -1 ||
            docBase64.slice(0, 50).indexOf('Exif') !== -1
          );

          if (isImageB64) {
            var mType = 'image/jpeg';
            if (docBase64.indexOf('iVBORw0KGgo') === 0) mType = 'image/png';
            else if (docBase64.indexOf('R0lGOD') === 0) mType = 'image/gif';
            else if (docBase64.indexOf('UklGR') === 0) mType = 'image/webp';
            var imgSrc = 'data:' + mType + ';base64,' + docBase64;
            root.innerHTML = '<div class="image-viewer-container">' +
              '<img src="' + imgSrc + '" alt="' + escapeHtml(docName) + '" class="responsive-image" />' +
              '<div class="image-info-bar">' + escapeHtml(docName) + '</div>' +
            '</div>';
            return;
          }

          let rawText = '';
          if (docBase64) {
            rawText = decodeUtf8Base64(docBase64);
            if (rawText && (rawText.indexOf('JFIF') !== -1 || rawText.indexOf('Exif') !== -1)) {
              var imgSrc2 = 'data:image/jpeg;base64,' + docBase64;
              root.innerHTML = '<div class="image-viewer-container">' +
                '<img src="' + imgSrc2 + '" alt="' + escapeHtml(docName) + '" class="responsive-image" />' +
                '<div class="image-info-bar">' + escapeHtml(docName) + '</div>' +
              '</div>';
              return;
            }
          } else if (docUri) {
            try {
              const res = await fetch(docUri);
              if (res.ok) rawText = await res.text();
            } catch {}
          }
          root.innerHTML = '<div class="reader-body"><pre style="white-space: pre-wrap; font-family: inherit; font-size: inherit; line-height: inherit;">' + escapeHtml(rawText) + '</pre></div>';
        }
      } catch (e) {
        root.innerHTML = '<div class="loading-spinner"><p>⚠️ Unable to render: ' + e.message + '</p></div>';
      }
    }

    renderDoc();

    window.addEventListener('message', (event) => {
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data.action === 'updateSettings') {
          const s = data.settings;
          document.body.style.fontSize = s.fontSize + 'px';
          document.body.style.lineHeight = s.lineHeight;
        }
      } catch {}
    });
  </script>
</body>
</html>`;
}

export const HybridReader: React.FC<HybridReaderProps> = ({ doc, settings, onPositionChange }) => {
  const webViewRef = useRef<any>(null);
  const iframeRef = useRef<any>(null);
  const themeColors = THEMES[settings.theme];

  // Recents/bookmarks persist without huge base64 payloads, so a doc opened
  // again after a restart may lack its data -- re-read it from the device
  // (content:// or file://) once so the reader still shows content.
  const [dataOverride, setDataOverride] = useState<string | undefined>(undefined);

  const effectiveDoc = useMemo(
    () => (dataOverride && dataOverride !== doc.base64Data ? { ...doc, base64Data: dataOverride } : doc),
    [doc, dataOverride]
  );

  useEffect(() => {
    setDataOverride(undefined);
    if (Platform.OS === 'web') return;
    if (doc.base64Data) return;
    const uri = doc.uri || '';
    const readable = uri.startsWith('content://') || (uri.startsWith('file://') && doc.kind !== 'image' && doc.kind !== 'video' && doc.kind !== 'audio');
    if (!readable) return;
    let dead = false;
    void (async () => {
      try {
        const { StorageAccessFramework } = FileSystem;
        const data = uri.startsWith('content://') && StorageAccessFramework
          ? await StorageAccessFramework.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 })
          : await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
        if (!dead && data) setDataOverride(data);
      } catch (e) {
        console.warn('[readspace] could not re-read file data for reader:', e);
      }
    })();
    return () => {
      dead = true;
    };
  }, [doc.id, doc.uri, doc.base64Data]);

  // Reader HTML is memoized (expensive: inlines whole base64 payloads) so
  // unrelated re-renders never re-serialize multi-MB strings.
  const htmlContent = useMemo(
    () => buildReaderHtml(effectiveDoc, settings, themeColors),
    [effectiveDoc, settings.theme, settings.fontSize, settings.lineHeight, settings.fontFamily]
  );

  // 1. High-Performance Native Image Engine with Touch Gestures on Mobile
  if (doc.kind === 'image' && (Platform.OS as string) !== 'web') {
    const imageUri = doc.base64Data
      ? (doc.base64Data.startsWith('data:') ? doc.base64Data : `data:${doc.mime || 'image/jpeg'};base64,${doc.base64Data}`)
      : doc.uri;

    return <NativeImageViewer imageUri={imageUri || ''} name={doc.name} themeColors={themeColors} />;
  }

  // Listen for window message on Web
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

  // Send settings update
  useEffect(() => {
    const payload = JSON.stringify({
      action: 'updateSettings',
      settings: {
        theme: settings.theme,
        fontSize: settings.fontSize,
        lineHeight: settings.lineHeight,
        fontFamily: settings.fontFamily,
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
  }, [settings]);

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.action === 'position' && onPositionChange) {
        onPositionChange(data.position);
      }
    } catch {}
  };

  if (Platform.OS === 'web') {
    return (
      <View style={styles.container}>
        <iframe
          ref={iframeRef}
          srcDoc={htmlContent}
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
          ref={webViewRef}
          originWhitelist={['*']}
          source={{ html: htmlContent }}
          onMessage={handleMessage}
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
          startInLoadingState={true}
        />
      ) : (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={themeColors.accent} />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  webview: {
    flex: 1,
  },
  loading: {
    position: 'absolute',
    inset: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageNativeContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  imageGestureArea: {
    flex: 1,
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nativeImage: {
    width: '94%',
    height: '88%',
  },
  imageToolbar: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 24,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  toolbarBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolbarBtnText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 20,
  },
  scaleBadge: {
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scaleBadgeText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  toolbarDivider: {
    width: 1,
    height: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    marginHorizontal: 8,
  },
  fitBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  fitBtnText: {
    color: '#60a5fa',
    fontSize: 13,
    fontWeight: '600',
  },
});
