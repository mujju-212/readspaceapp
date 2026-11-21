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

function getRequiredVendorBundles(kind?: string): string[] {
  switch (kind) {
    case 'pdf':
      return [OFFLINE_PDFJS_B64];
    case 'markdown':
      return [OFFLINE_MARKED_B64, OFFLINE_DOMPURIFY_B64];
    case 'docx':
      return [OFFLINE_JSZIP_B64, OFFLINE_MAMMOTH_B64, OFFLINE_DOMPURIFY_B64];
    case 'pptx':
      return [OFFLINE_JSZIP_B64];
    case 'html':
      return [OFFLINE_DOMPURIFY_B64];
    default:
      return [];
  }
}

function getFallbackCdns(kind?: string) {
  switch (kind) {
    case 'pdf':
      return ['<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>'];
    case 'markdown':
      return [
        '<script src="https://cdnjs.cloudflare.com/ajax/libs/marked/9.1.6/marked.min.js"></script>',
        '<script src="https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.0.6/purify.min.js"></script>',
      ];
    case 'docx':
      return [
        '<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>',
        '<script src="https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js"></script>',
        '<script src="https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.0.6/purify.min.js"></script>',
      ];
    case 'pptx':
      return ['<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>'];
    case 'html':
      return ['<script src="https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.0.6/purify.min.js"></script>'];
    default:
      return [];
  }
}

function buildReaderHtml(doc: MobileDoc, settings: ReaderSettings, themeColors: any): string {
  const bundlesToRun = getRequiredVendorBundles(doc.kind);
  const bundleScript = bundlesToRun.length > 0
    ? `
  <script>
  (function() {
    function loadBundle(b64) {
      if (!b64) return;
      try {
        var code = decodeURIComponent(escape(atob(b64)));
        var s = document.createElement('script');
        s.textContent = code;
        document.head.appendChild(s);
      } catch(e) {
        try {
          var s2 = document.createElement('script');
          s2.textContent = atob(b64);
          document.head.appendChild(s2);
        } catch(e2) {
          try {
            (0, eval)(atob(b64));
          } catch(e3) {
            console.warn('Bundle load error:', e3);
          }
        }
      }
    }
    ${bundlesToRun.map((b) => `loadBundle(${JSON.stringify(b)});`).join('\n    ')}
  })();
  </script>`
    : '';

  const fallbackCdns = getFallbackCdns(doc.kind).join('\n  ');
  const nightLightOpacity = ((settings.nightLight || 0) / 100) * 0.42;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes">
  <title>${doc.name}</title>
  ${bundleScript}
  ${fallbackCdns}
  <style>
    :root {
      --bg: ${themeColors.bg};
      --panel: ${themeColors.panel};
      --card: ${themeColors.card};
      --border: ${themeColors.border};
      --fg: ${themeColors.fg};
      --muted: ${themeColors.muted};
      --accent: ${themeColors.accent};
      --accent-fg: ${themeColors.accentFg};
      --pdf-bg: ${themeColors.pdfBg};
      --sel: ${themeColors.sel};
      --nightlight-alpha: ${nightLightOpacity};
    }
    * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      background: var(--bg);
      color: var(--fg);
      font-size: ${settings.fontSize}px;
      line-height: ${settings.lineHeight};
      overflow-x: hidden;
    }
    body[data-font="system"] { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body[data-font="serif"] { font-family: "Merriweather", Georgia, Cambria, "Times New Roman", serif; }
    body[data-font="mono"] { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
    body[data-font="dyslexic"] { font-family: "OpenDyslexic", "Comic Sans MS", cursive, sans-serif; }
    body[data-align="justify"] .reader-body p, body[data-align="justify"] .rs-paged-body p { text-align: justify; text-justify: inter-word; }
    body[data-align="left"] .reader-body p, body[data-align="left"] .rs-paged-body p { text-align: left; }

    /* Amber Night Light Filter (Play Books style blue-light reduction) */
    .rs-nightlight-overlay {
      position: fixed;
      inset: 0;
      pointer-events: none;
      background-color: rgba(255, 150, 10, var(--nightlight-alpha, 0));
      mix-blend-mode: multiply;
      z-index: 99999;
      transition: background-color 0.3s ease;
    }

    /* 3D Book Stage (Play Books inspired page-curl cylinder) */
    .rs-book-stage {
      position: fixed;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      perspective: 2000px;
      perspective-origin: 50% 50%;
      overflow: hidden;
      background: var(--pdf-bg);
      user-select: none;
      -webkit-user-select: none;
      padding: 10px 10px 65px;
      box-sizing: border-box;
    }
    .rs-book-container {
      position: relative;
      width: 100%;
      max-width: 820px;
      height: 100%;
      background: var(--panel);
      border-radius: 8px;
      box-shadow: 0 16px 50px rgba(0, 0, 0, 0.28), 0 2px 10px rgba(0, 0, 0, 0.12);
      transform-style: preserve-3d;
      overflow: hidden;
      border: 1px solid var(--border);
    }
    .rs-page-leaf {
      position: absolute;
      inset: 0;
      background: #ffffff;
      transform-origin: left center;
      transform-style: preserve-3d;
      transition: transform 0.48s cubic-bezier(0.25, 1, 0.5, 1), box-shadow 0.4s ease;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
      border-radius: 0 6px 6px 0;
      backface-visibility: hidden;
      -webkit-backface-visibility: hidden;
    }
    body[data-theme="dark"] .rs-page-leaf {
      background: #141b2d;
      color: #e2e8f0;
      box-shadow: 0 0 25px rgba(255, 175, 40, 0.08), 0 8px 30px rgba(0, 0, 0, 0.6);
    }
    body[data-theme="sepia"] .rs-page-leaf {
      background: #fbf0d9;
      color: #43382a;
    }
    .rs-page-leaf.turned {
      transform: rotateY(-180deg) !important;
      pointer-events: none;
      visibility: hidden;
    }
    .rs-page-leaf.active-leaf {
      z-index: 10;
    }
    .rs-page-crease {
      position: absolute;
      top: 0; bottom: 0; left: 0;
      width: 36px;
      pointer-events: none;
      background: linear-gradient(to right, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.06) 40%, rgba(255,255,255,0.08) 75%, transparent 100%);
      z-index: 25;
    }
    body[data-theme="dark"] .rs-page-crease {
      background: linear-gradient(to right, rgba(0,0,0,0.5) 0%, rgba(255,180,50,0.1) 50%, transparent 100%);
    }
    .rs-page-content {
      flex: 1;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      padding: 6px;
      box-sizing: border-box;
    }
    .rs-page-content canvas {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      display: block;
    }
    .rs-page-header, .rs-page-footer {
      padding: 8px 18px;
      font-size: 11.5px;
      font-weight: 600;
      color: var(--muted);
      display: flex;
      justify-content: space-between;
      user-select: none;
      border-bottom: 1px solid var(--border);
      background: rgba(0,0,0,0.02);
      flex-shrink: 0;
    }
    .rs-page-footer {
      border-bottom: none;
      border-top: 1px solid var(--border);
    }

    /* Tap zones for 3D page turning - narrow edge margins so center content remains fully interactive */
    .rs-tap-left {
      position: absolute;
      top: 0; bottom: 0; left: 0;
      width: 14%;
      z-index: 35;
      cursor: pointer;
    }
    .rs-tap-right {
      position: absolute;
      top: 0; bottom: 0; right: 0;
      width: 14%;
      z-index: 35;
      cursor: pointer;
    }

    /* Paginated markdown / text in 3D book mode */
    .rs-paged-body {
      flex: 1;
      width: 100%;
      padding: 24px 28px;
      overflow-y: auto;
      box-sizing: border-box;
      font-size: inherit;
      line-height: inherit;
      color: inherit;
      word-break: break-word;
    }

    /* Floating Scrubber Bar (Google Play Books SearchScrubBar style) */
    .rs-scrub-bar {
      position: fixed;
      bottom: 18px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 16px;
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 999px;
      box-shadow: 0 8px 30px rgba(0,0,0,0.22);
      z-index: 9000;
      transition: opacity 0.3s ease, transform 0.3s ease;
      opacity: 1;
      max-width: 94vw;
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
    }
    .rs-scrub-bar.hidden-bar {
      opacity: 0;
      transform: translateX(-50%) translateY(28px);
      pointer-events: none;
    }
    .rs-scrub-btn {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      border: 1px solid var(--border);
      background: var(--bg);
      color: var(--fg);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 15px;
      font-weight: 700;
      cursor: pointer;
      flex-shrink: 0;
    }
    .rs-scrub-btn:active {
      transform: scale(0.92);
      background: var(--accent);
      color: var(--accent-fg);
    }
    .rs-scrub-slider {
      -webkit-appearance: none;
      appearance: none;
      width: 110px;
      height: 4px;
      border-radius: 2px;
      background: var(--border);
      outline: none;
      cursor: pointer;
    }
    .rs-scrub-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: var(--accent);
      cursor: pointer;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    }
    .rs-page-pill {
      font-size: 11px;
      font-weight: 700;
      color: var(--muted);
      white-space: nowrap;
      padding: 0 4px;
      min-width: 80px;
      text-align: center;
    }
    .rs-mode-badge {
      font-size: 11px;
      font-weight: 700;
      padding: 5px 10px;
      border-radius: 8px;
      background: var(--accent);
      color: var(--accent-fg);
      border: none;
      cursor: pointer;
      white-space: nowrap;
    }

    /* Standard Vertical PDF Viewer */
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

    /* Standard Vertical Document Reader */
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
<body data-font="${settings.fontFamily || 'system'}" data-align="${settings.textAlign || 'left'}" data-theme="${settings.theme}">
  <div id="rsNightLightOverlay" class="rs-nightlight-overlay"></div>

  <div id="root">
    <div class="loading-spinner">
      <div style="font-size: 32px;">📖</div>
      <div>Loading ${doc.name}…</div>
    </div>
  </div>

  <!-- Interactive Floating Bottom Scrubber -->
  <div class="rs-scrub-bar hidden-bar" id="rsScrubBar">
    <button type="button" class="rs-scrub-btn" id="rsBtnPrev" title="Previous Page">‹</button>
    <div style="display:flex; flex-direction:column; align-items:center; gap:2px;">
      <span class="rs-page-pill" id="rsPagePill">Page 1 of 1</span>
      <input type="range" class="rs-scrub-slider" id="rsScrubSlider" min="1" max="1" value="1">
    </div>
    <button type="button" class="rs-scrub-btn" id="rsBtnNext" title="Next Page">›</button>
    <button type="button" class="rs-mode-badge" id="rsBtnMode">${(settings.readingMode || 'scroll') === 'curl' ? '📖 3D' : '📜 Scroll'}</button>
  </div>

  <script>
    const docKind = ${JSON.stringify(doc.kind || 'text')};
    const docName = ${JSON.stringify(doc.name || 'Document')};
    const docBase64 = ${JSON.stringify(doc.base64Data || '')};
    const docUri = ${JSON.stringify(doc.uri || '')};
    const docStreamUrl = ${JSON.stringify((doc as any).streamUrl || '')};

    window.__readerState = {
      mode: ${JSON.stringify(settings.readingMode || 'scroll')},
      page: 1,
      total: 1,
      nightLight: ${Number(settings.nightLight || 0)},
      fontFamily: ${JSON.stringify(settings.fontFamily || 'system')},
      textAlign: ${JSON.stringify(settings.textAlign || 'left')},
      fontSize: ${Number(settings.fontSize || 16)},
      lineHeight: ${Number(settings.lineHeight || 1.6)},
    };

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
      return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    let hideScrubberTimer = null;
    function showScrubberBriefly() {
      const bar = document.getElementById('rsScrubBar');
      if (!bar) return;
      bar.classList.remove('hidden-bar');
      clearTimeout(hideScrubberTimer);
      hideScrubberTimer = setTimeout(() => {
        bar.classList.add('hidden-bar');
      }, 3500);
    }

    function updateScrubber(current, total) {
      window.__readerState.page = current;
      window.__readerState.total = total;
      const pill = document.getElementById('rsPagePill');
      const slider = document.getElementById('rsScrubSlider');
      const btnMode = document.getElementById('rsBtnMode');
      const pct = Math.max(1, Math.min(100, Math.round((current / (total || 1)) * 100)));

      if (pill) pill.textContent = 'Page ' + current + ' of ' + total + ' (' + pct + '%)';
      if (slider) {
        slider.min = 1;
        slider.max = total;
        slider.value = current;
      }
      if (btnMode) {
        btnMode.textContent = window.__readerState.mode === 'curl' ? '📖 3D' : '📜 Scroll';
      }
      sendPosition({ page: current, total: total, percentage: pct });
    }

    async function renderDoc() {
      const root = document.getElementById('root');
      const mode = window.__readerState.mode;

      try {
        if (docKind === 'pdf') {
          if (!docBase64) {
            root.innerHTML = '<div class="loading-spinner">' +
              '<div style="font-size:36px; margin-bottom:8px;">⚠️</div>' +
              '<div style="font-weight:700; font-size:15px;">Could not load ' + escapeHtml(docName) + '</div>' +
              '<div style="color:var(--muted); font-size:12px; margin-top:6px; max-width:280px; text-align:center;">Document data is empty or inaccessible from storage. Please re-open this file from your folder or file picker.</div>' +
            '</div>';
            return;
          }
          let pdfLib = window.pdfjsLib || (typeof pdfjsLib !== 'undefined' ? pdfjsLib : null);
          if (!pdfLib) {
            await new Promise((r) => setTimeout(r, 150));
            pdfLib = window.pdfjsLib || (typeof pdfjsLib !== 'undefined' ? pdfjsLib : null);
          }
          if (!pdfLib) {
            root.innerHTML = '<div class="loading-spinner"><p>⚠️ PDF engine is initializing, retrying…</p></div>';
            setTimeout(renderDoc, 500);
            return;
          }

          try {
            if (navigator.onLine) {
              pdfLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            } else {
              pdfLib.GlobalWorkerOptions.workerSrc = '';
            }
          } catch(e) {
            pdfLib.GlobalWorkerOptions.workerSrc = '';
          }

          const pdf = await pdfLib.getDocument({
            data: base64ToUint8Array(docBase64),
            disableWorker: !navigator.onLine,
            isEvalSupported: false,
          }).promise;
          window.__rsPdf = pdf;
          const totalPages = pdf.numPages;

          if (mode === 'curl') {
            // 3D Realistic Page-Turn Mode
            root.innerHTML =
              '<div class="rs-book-stage">' +
                '<div class="rs-book-container" id="rsBookContainer">' +
                  '<div class="rs-tap-left" id="rsTapLeft" title="Previous Page"></div>' +
                  '<div class="rs-tap-right" id="rsTapRight" title="Next Page"></div>' +
                '</div>' +
              '</div>';
            const container = document.getElementById('rsBookContainer');
            const leaves = [];

            for (let i = 1; i <= totalPages; i++) {
              const leaf = document.createElement('div');
              leaf.className = 'rs-page-leaf' + (i === 1 ? ' active-leaf' : '');
              leaf.dataset.page = String(i);
              leaf.style.zIndex = String(totalPages - i + 1);

              leaf.innerHTML =
                '<div class="rs-page-header">' +
                  '<span>' + escapeHtml(docName) + '</span>' +
                  '<span>Page ' + i + ' of ' + totalPages + '</span>' +
                '</div>' +
                '<div class="rs-page-crease"></div>' +
                '<div class="rs-page-content" id="rsPdfContent_' + i + '">' +
                  '<div style="color:var(--muted); font-size:12px;">Rendering page ' + i + '…</div>' +
                '</div>' +
                '<div class="rs-page-footer">' +
                  '<span>ReadSpace 3D</span>' +
                  '<span>' + Math.round((i / totalPages) * 100) + '%</span>' +
                '</div>';
              container.appendChild(leaf);
              leaves.push(leaf);
            }

            const renderedCanvases = new Set();
            const renderPdfPage = async (pageIndex) => {
              if (pageIndex < 1 || pageIndex > totalPages || renderedCanvases.has(pageIndex)) return;
              renderedCanvases.add(pageIndex);
              try {
                const page = await pdf.getPage(pageIndex);
                const contentDiv = document.getElementById('rsPdfContent_' + pageIndex);
                if (!contentDiv) return;

                const vp1 = page.getViewport({ scale: 1 });
                const dpr = Math.min(Math.max(window.devicePixelRatio || 1, 2), 3);
                const containerWidth = Math.max(300, (container.clientWidth || document.documentElement.clientWidth) - 20);
                const scale = (containerWidth / vp1.width) * dpr;
                const viewport = page.getViewport({ scale: scale });

                const canvas = document.createElement('canvas');
                canvas.width = Math.round(viewport.width);
                canvas.height = Math.round(viewport.height);
                canvas.style.maxWidth = '100%';
                canvas.style.maxHeight = '100%';
                canvas.style.objectFit = 'contain';
                canvas.style.display = 'block';

                contentDiv.innerHTML = '';
                contentDiv.appendChild(canvas);

                const ctx = canvas.getContext('2d', { alpha: false });
                if (ctx) {
                  ctx.imageSmoothingEnabled = true;
                  ctx.imageSmoothingQuality = 'high';
                }
                await page.render({ canvasContext: ctx, viewport: viewport }).promise;
              } catch (e) {
                console.warn('3d page render err', e);
              }
            };

            let curPage = 1;
            const updateLeaves = (targetPage) => {
              targetPage = Math.max(1, Math.min(totalPages, targetPage));
              curPage = targetPage;
              leaves.forEach((l, idx) => {
                const pNum = idx + 1;
                if (pNum < curPage) {
                  l.classList.add('turned');
                  l.classList.remove('active-leaf');
                } else if (pNum === curPage) {
                  l.classList.remove('turned');
                  l.classList.add('active-leaf');
                } else {
                  l.classList.remove('turned');
                  l.classList.remove('active-leaf');
                }
              });
              renderPdfPage(curPage);
              renderPdfPage(curPage + 1);
              renderPdfPage(curPage - 1);
              updateScrubber(curPage, totalPages);
            };

            window.rsNextPage = () => {
              if (curPage < totalPages) updateLeaves(curPage + 1);
            };
            window.rsPrevPage = () => {
              if (curPage > 1) updateLeaves(curPage - 1);
            };
            window.rsGoToPage = (p) => updateLeaves(p);

            // Tap & Touch Bindings
            const tapL = document.getElementById('rsTapLeft');
            const tapR = document.getElementById('rsTapRight');
            if (tapL) tapL.onclick = () => { window.rsPrevPage(); showScrubberBriefly(); };
            if (tapR) tapR.onclick = () => { window.rsNextPage(); showScrubberBriefly(); };

            let touchStartX = 0;
            let touchStartY = 0;
            container.addEventListener('touchstart', (e) => {
              if (e.touches.length === 1) {
                touchStartX = e.touches[0].clientX;
                touchStartY = e.touches[0].clientY;
              }
            }, { passive: true });

            container.addEventListener('touchend', (e) => {
              if (e.changedTouches.length === 1) {
                const dx = e.changedTouches[0].clientX - touchStartX;
                const dy = e.changedTouches[0].clientY - touchStartY;
                if (Math.abs(dx) > 42 && Math.abs(dx) > Math.abs(dy)) {
                  if (dx < 0) window.rsNextPage();
                  else window.rsPrevPage();
                  showScrubberBriefly();
                }
              }
            }, { passive: true });

            updateLeaves(1);
          } else {
            // Continuous Vertical Scroll Mode (Original Proven PDF Engine)
            root.innerHTML = '<div class="pdf-container" id="pdfRoot"></div>';
            const pdfRoot = document.getElementById('pdfRoot');
            const placeholders = [];

            for (let i = 1; i <= totalPages; i++) {
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
                } catch (e) {}
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
                const vp1 = page.getViewport({ scale: 1 });
                const cssWidth = Math.round(pageDiv.clientWidth || document.documentElement.clientWidth - 20);
                const dpr = Math.min(Math.max(window.devicePixelRatio || 1, 2), 3);
                const renderScale = (cssWidth / vp1.width) * dpr;
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
                pageDiv.innerHTML = '';
                pageDiv.appendChild(wrap);

                const ctx = canvas.getContext('2d', { alpha: false });
                if (ctx) {
                  ctx.imageSmoothingEnabled = true;
                  ctx.imageSmoothingQuality = 'high';
                }
                await page.render({ canvasContext: ctx, viewport: viewport }).promise;

                try {
                  const content = await page.getTextContent();
                  if (content && content.items.length > 0) {
                    const layer = document.createElement('div');
                    layer.className = 'textLayer';
                    layer.style.position = 'absolute';
                    layer.style.inset = '0';
                    layer.style.overflow = 'hidden';
                    layer.style.lineHeight = '1';
                    wrap.appendChild(layer);
                    const textViewport = page.getViewport({ scale: (cssWidth / vp1.width) });
                    (pdfLib || window.pdfjsLib).renderTextLayer({ textContentSource: content, container: layer, viewport: textViewport });
                  }
                } catch (e) {}
              } catch (e) {
                console.warn('pdf page render failed', e);
              } finally {
                renderingNow.delete(pageDiv);
                pump();
              }
            };

            const leafMargin = Math.round((window.innerHeight || 900) * 1.5) + 'px';
            const io = new IntersectionObserver((entries) => {
              for (const en of entries) {
                const el = en.target;
                if (en.isIntersecting) {
                  if (!el.dataset.rendered) { el.dataset.rendered = '1'; pendingRender.add(el); }
                  const pNum = Number(el.dataset.pageNumber);
                  updateScrubber(pNum, totalPages);
                } else if (el.dataset.rendered) {
                  const box = el.getBoundingClientRect();
                  const margin = (window.innerHeight || 900) * 2.5;
                  if (box.bottom < -margin || box.top > (window.innerHeight || 900) + margin) {
                    el.innerHTML = '';
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

            window.rsGoToPage = (p) => {
              const el = placeholders[p - 1];
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            };
            window.rsNextPage = () => {
              const nextP = Math.min(totalPages, window.__readerState.page + 1);
              window.rsGoToPage(nextP);
            };
            window.rsPrevPage = () => {
              const prevP = Math.max(1, window.__readerState.page - 1);
              window.rsGoToPage(prevP);
            };
            updateScrubber(1, totalPages);
          }
        } else if (docKind === 'pptx') {
          if (!docBase64) throw new Error('No PPTX data');
          const zip = await JSZip.loadAsync(base64ToUint8Array(docBase64));
          const slideFiles = [];
          zip.forEach((path) => {
            const m = path.match(/^ppt\/slides\/slide(\d+)\.xml$/i);
            if (m) slideFiles.push({ path, num: parseInt(m[1], 10) });
          });
          slideFiles.sort((a, b) => a.num - b.num);

          let slidesHtml = '';
          const parser = new DOMParser();

          for (let i = 0; i < slideFiles.length; i++) {
            const xml = await zip.file(slideFiles[i].path).async('string');
            const sDoc = parser.parseFromString(xml, 'application/xml');
            let title = 'Slide ' + (i + 1);
            const titleEl = sDoc.querySelector('p\\:sp p\\:ph[type="title"], p\\:sp p\\:ph[type="ctrTitle"]');
            if (titleEl) {
              const textEl = titleEl.closest('p\\:sp')?.querySelector('a\\:t');
              if (textEl && textEl.textContent) title = textEl.textContent.trim();
            }

            const bullets = [];
            const textNodes = sDoc.querySelectorAll('a\\:p');
            textNodes.forEach(p => {
              const t = p.textContent?.trim();
              if (t && t !== title) bullets.push(t);
            });

            slidesHtml += 
              '<div class="pptx-card">' +
                '<h3 class="pptx-slide-title">Slide ' + (i + 1) + ': ' + escapeHtml(title) + '</h3>' +
                '<div class="pptx-bullets">' +
                  bullets.map(b => '<div class="pptx-bullet">• ' + escapeHtml(b) + '</div>').join('') +
                '</div>' +
              '</div>';
          }

          root.innerHTML = '<div class="pptx-container">' + slidesHtml + '</div>';
          updateScrubber(1, Math.max(1, slideFiles.length));
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
        } else if (docKind === 'docx') {
          if (!docBase64) throw new Error('No DOCX data provided. Please re-open.');
          if (typeof mammoth === 'undefined') {
            await new Promise((r) => setTimeout(r, 150));
          }
          const res = await mammoth.convertToHtml({ arrayBuffer: base64ToUint8Array(docBase64) });
          const clean = (typeof DOMPurify !== 'undefined' && DOMPurify.sanitize)
            ? DOMPurify.sanitize(res.value)
            : res.value;
          renderHtmlContent(clean);
        } else if (docKind === 'markdown') {
          let rawMd = '';
          if (docBase64) {
            rawMd = decodeUtf8Base64(docBase64);
          } else if (docUri) {
            try {
              const res = await fetch(docUri);
              if (res.ok) rawMd = await res.text();
            } catch (err) {}
          }
          if (typeof marked === 'undefined') {
            await new Promise((r) => setTimeout(r, 150));
          }
          const parser = (typeof marked !== 'undefined' ? marked : (typeof window !== 'undefined' ? window.marked : null));
          const sanitizer = (typeof DOMPurify !== 'undefined' ? DOMPurify : (typeof window !== 'undefined' ? window.DOMPurify : null));

          let dirtyHtml = '';
          if (parser && typeof parser.parse === 'function') {
            dirtyHtml = parser.parse(rawMd || '');
          } else if (typeof parser === 'function') {
            dirtyHtml = parser(rawMd || '');
          } else {
            dirtyHtml = '<pre style="white-space:pre-wrap; font-family:inherit;">' + escapeHtml(rawMd || '') + '</pre>';
          }

          const clean = sanitizer && typeof sanitizer.sanitize === 'function'
            ? sanitizer.sanitize(dirtyHtml)
            : dirtyHtml;

          renderHtmlContent(clean);
        } else if (docKind === 'html') {
          let rawHtml = '';
          if (docBase64) rawHtml = decodeUtf8Base64(docBase64);
          else if (docUri) {
            try {
              const res = await fetch(docUri);
              if (res.ok) rawHtml = await res.text();
            } catch (err) {}
          }
          const sanitizer = (typeof DOMPurify !== 'undefined' ? DOMPurify : (typeof window !== 'undefined' ? window.DOMPurify : null));
          const cleanHtml = sanitizer && typeof sanitizer.sanitize === 'function'
            ? sanitizer.sanitize(rawHtml)
            : rawHtml;

          window._rawHtmlCode = rawHtml;
          window._cleanHtmlPreview = cleanHtml;
          window.switchHtmlView = function(m) {
            const previewEl = document.getElementById('htmlPreviewPane');
            const codeEl = document.getElementById('htmlCodePane');
            const btnPrev = document.getElementById('btnHtmlPreview');
            const btnCode = document.getElementById('btnHtmlCode');
            if (m === 'preview') {
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

          const htmlWrapper =
            '<div class="html-toolbar">' +
              '<span style="font-size:12px; font-weight:600; color:var(--muted);">🌐 HTML Document</span>' +
              '<div class="html-toggle-group">' +
                '<button type="button" id="btnHtmlPreview" class="html-toggle-btn active" onclick="switchHtmlView(\'preview\')">Preview</button>' +
                '<button type="button" id="btnHtmlCode" class="html-toggle-btn" onclick="switchHtmlView(\'code\')">Code</button>' +
              '</div>' +
            '</div>' +
            '<div id="htmlPreviewPane">' + cleanHtml + '</div>' +
            '<div id="htmlCodePane" style="display:none;"><pre style="white-space:pre-wrap; font-family:inherit;">' + escapeHtml(rawHtml) + '</pre></div>';

          renderHtmlContent(htmlWrapper);
        } else {
          // Plain Text
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
            } catch (e) {}
          }
          const textHtml = '<pre style="white-space:pre-wrap; font-family:inherit; font-size:inherit; line-height:inherit; margin:0;">' + escapeHtml(rawText || '') + '</pre>';
          renderHtmlContent(textHtml);
        }
      } catch (e) {
        root.innerHTML = '<div class="loading-spinner"><p>⚠️ Unable to render: ' + e.message + '</p></div>';
      }
    }

    // Scrubber Bar Event Bindings
    const btnPrev = document.getElementById('rsBtnPrev');
    const btnNext = document.getElementById('rsBtnNext');
    const scrubSlider = document.getElementById('rsScrubSlider');
    const btnMode = document.getElementById('rsBtnMode');

    if (btnPrev) {
      btnPrev.onclick = () => {
        if (window.rsPrevPage) window.rsPrevPage();
        showScrubberBriefly();
      };
    }
    if (btnNext) {
      btnNext.onclick = () => {
        if (window.rsNextPage) window.rsNextPage();
        showScrubberBriefly();
      };
    }
    if (scrubSlider) {
      scrubSlider.oninput = (e) => {
        const p = Number(e.target.value);
        if (window.rsGoToPage) window.rsGoToPage(p);
        showScrubberBriefly();
      };
    }
    if (btnMode) {
      btnMode.onclick = () => {
        window.__readerState.mode = window.__readerState.mode === 'curl' ? 'scroll' : 'curl';
        renderDoc();
        showScrubberBriefly();
      };
    }

    // Keyboard support
    window.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        if (window.rsNextPage) window.rsNextPage();
        showScrubberBriefly();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        if (window.rsPrevPage) window.rsPrevPage();
        showScrubberBriefly();
      }
    });

    renderDoc();
    setTimeout(() => showScrubberBriefly(), 800);

    // Dynamic settings listener
    window.addEventListener('message', (event) => {
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data.action === 'updateSettings') {
          const s = data.settings;
          if (s.fontSize) document.body.style.fontSize = s.fontSize + 'px';
          if (s.lineHeight) document.body.style.lineHeight = s.lineHeight;
          if (s.fontFamily) document.body.dataset.font = s.fontFamily;
          if (s.textAlign) document.body.dataset.align = s.textAlign;
          if (s.theme) document.body.dataset.theme = s.theme;

          if (s.nightLight !== undefined) {
            window.__readerState.nightLight = s.nightLight;
            const overlay = document.getElementById('rsNightLightOverlay');
            if (overlay) {
              overlay.style.backgroundColor = 'rgba(255, 150, 10, ' + ((s.nightLight / 100) * 0.42) + ')';
            }
          }

          if (s.readingMode && s.readingMode !== window.__readerState.mode) {
            window.__readerState.mode = s.readingMode;
            renderDoc();
          }
        } else if (data.action === 'nextPage') {
          if (window.rsNextPage) window.rsNextPage();
        } else if (data.action === 'prevPage') {
          if (window.rsPrevPage) window.rsPrevPage();
        } else if (data.action === 'goToPage') {
          if (window.rsGoToPage) window.rsGoToPage(data.page);
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
  }, [
    doc.kind,
    effectiveDoc,
    settings.theme,
    settings.fontSize,
    settings.lineHeight,
    settings.fontFamily,
    settings.readingMode,
    settings.nightLight,
    settings.textAlign,
  ]);

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

  useEffect(() => {
    const payload = JSON.stringify({
      action: 'updateSettings',
      settings: {
        theme: settings.theme,
        fontSize: settings.fontSize,
        lineHeight: settings.lineHeight,
        fontFamily: settings.fontFamily,
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
          key={`${doc.id || doc.name}_${effectiveDoc.base64Data ? 'ready' : 'empty'}`}
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
