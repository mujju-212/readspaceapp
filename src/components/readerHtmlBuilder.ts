import { MobileDoc, ReaderSettings } from '../types';
import {
  OFFLINE_MARKED_B64,
  OFFLINE_DOMPURIFY_B64,
  OFFLINE_JSZIP_B64,
  OFFLINE_MAMMOTH_B64,
  OFFLINE_PDFJS_B64,
  OFFLINE_KATEX_B64,
  OFFLINE_KATEX_CSS,
} from '../vendor/offlineVendors';
import { OFFLINE_PDFJS_WORKER_B64 } from '../vendor/offlinePdfWorker';

function docNeedsKatex(doc: MobileDoc): boolean {
  if (doc.kind === 'pdf' || doc.kind === 'pptx' || doc.kind === 'image' || doc.kind === 'audio' || doc.kind === 'video') {
    return false;
  }
  if (!doc.base64Data) return doc.kind === 'markdown';
  try {
    const bin = atob(doc.base64Data);
    return bin.indexOf('$') !== -1 || bin.indexOf('\\(') !== -1 || bin.indexOf('\\[') !== -1;
  } catch {
    return doc.kind === 'markdown';
  }
}

function getRequiredVendorBundles(doc: MobileDoc, includeKatex: boolean): string[] {
  switch (doc.kind) {
    case 'pdf':
      return [OFFLINE_PDFJS_B64];
    case 'markdown':
      return includeKatex
        ? [OFFLINE_MARKED_B64, OFFLINE_DOMPURIFY_B64, OFFLINE_KATEX_B64]
        : [OFFLINE_MARKED_B64, OFFLINE_DOMPURIFY_B64];
    case 'docx':
      return includeKatex
        ? [OFFLINE_JSZIP_B64, OFFLINE_MAMMOTH_B64, OFFLINE_DOMPURIFY_B64, OFFLINE_KATEX_B64]
        : [OFFLINE_JSZIP_B64, OFFLINE_MAMMOTH_B64, OFFLINE_DOMPURIFY_B64];
    case 'pptx':
      return [OFFLINE_JSZIP_B64];
    case 'html':
      return includeKatex ? [OFFLINE_DOMPURIFY_B64, OFFLINE_KATEX_B64] : [OFFLINE_DOMPURIFY_B64];
    default:
      return includeKatex ? [OFFLINE_KATEX_B64] : [];
  }
}

function escapeHtmlAttr(str: string): string {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildReaderHtml(doc: MobileDoc, settings: ReaderSettings, themeColors: any): string {
  const safeDocTitle = escapeHtmlAttr(doc.name || 'Document');
  const includeKatex = docNeedsKatex(doc);
  const bundlesToRun = getRequiredVendorBundles(doc, includeKatex);
  const bundleScript = bundlesToRun.length > 0
    ? `
  <script>
  (function() {
    function loadBundle(b64) {
      if (!b64) return;
      try {
        var bin = atob(b64);
        var code = bin;
        if (/[^\\x00-\\x7f]/.test(bin) && typeof TextDecoder !== 'undefined') {
          var bytes = new Uint8Array(bin.length);
          for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          code = new TextDecoder('utf-8').decode(bytes);
        }
        var s = document.createElement('script');
        s.textContent = code;
        document.head.appendChild(s);
      } catch(e) {
        try {
          (0, eval)(atob(b64));
        } catch(e2) {
          console.warn('Bundle load error:', e2);
        }
      }
    }
    ${bundlesToRun.map((b) => `loadBundle(${JSON.stringify(b)});`).join('\n    ')}
    ${includeKatex ? `try {
      var katexCss = atob(${JSON.stringify(OFFLINE_KATEX_CSS)});
      var sStyle = document.createElement('style');
      sStyle.textContent = katexCss;
      document.head.appendChild(sStyle);
    } catch(e) {}` : ''}
  })();
  </script>`
    : '';

  const nightLightOpacity = ((settings.nightLight || 0) / 100) * 0.42;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes">
  <title>${safeDocTitle}</title>
  ${bundleScript}
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
      min-height: 100%;
      height: auto;
      background: var(--bg);
      color: var(--fg);
      font-size: ${settings.fontSize}px;
      line-height: ${settings.lineHeight};
      overflow-x: clip;
    }
    body[data-font="system"] { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body[data-font="serif"] { font-family: "Merriweather", Georgia, Cambria, "Times New Roman", serif; }
    body[data-font="mono"] { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
    body[data-font="dyslexic"] { font-family: "OpenDyslexic", "Comic Sans MS", cursive, sans-serif; }
    body[data-align="justify"] .reader-body p,
    body[data-align="justify"] .reader-body li,
    body[data-align="justify"] .rs-paged-body p,
    body[data-align="justify"] .md-page-content p,
    body[data-align="justify"] .md-page-content li { text-align: justify; text-justify: inter-word; }
    body[data-align="left"] .reader-body p,
    body[data-align="left"] .reader-body li,
    body[data-align="left"] .rs-paged-body p,
    body[data-align="left"] .md-page-content p,
    body[data-align="left"] .md-page-content li { text-align: left; }

    /* Amber Night Light Filter (only active when nightLight > 0 to avoid idle GPU blend pass) */
    .rs-nightlight-overlay {
      position: fixed;
      inset: 0;
      pointer-events: none;
      display: ${nightLightOpacity > 0 ? 'block' : 'none'};
      background-color: rgba(255, 150, 10, var(--nightlight-alpha, 0));
      mix-blend-mode: multiply;
      z-index: 99999;
    }

    #root {
      width: 100%;
      min-height: 100vh;
      position: relative;
    }

    /* 3D Book Stage (Google Play Books immersive fullscreen layout) */
    .rs-book-stage {
      position: fixed;
      inset: 0;
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bg);
      overflow: hidden;
      user-select: none;
      -webkit-user-select: none;
      touch-action: none;
      -webkit-touch-action: none;
      z-index: 20;
    }
    #rsZoomContainer {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      transform-origin: center center;
      touch-action: none;
      -webkit-touch-action: none;
    }
    #rsBook, #rsHtmlBook {
      position: relative;
      border: none;
      box-shadow: none;
      perspective: 2400px;
      transform-style: preserve-3d;
      overflow: visible;
    }
    .rs-book-spine {
      position: absolute;
      top: 0;
      bottom: 0;
      left: 0;
      width: 24px;
      pointer-events: none;
      background: linear-gradient(to right, rgba(0,0,0,0.16) 0%, rgba(0,0,0,0.05) 45%, transparent 100%);
      z-index: 25;
    }
    .rs-under-shadow {
      position: absolute;
      inset: 0;
      pointer-events: none;
      background: linear-gradient(to right, rgba(0,0,0,0.32) 0%, rgba(0,0,0,0.08) 35%, transparent 75%);
      z-index: 22;
      opacity: 0.45;
      transition: opacity 0.32s ease;
    }
    .rs-curl-leaf {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      transform-origin: left center;
      transform-style: preserve-3d;
      z-index: 30;
      pointer-events: none;
      will-change: transform;
    }
    .rs-leaf-front, .rs-leaf-back {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: var(--bg);
      backface-visibility: hidden;
      -webkit-backface-visibility: hidden;
    }
    .rs-leaf-front { z-index: 2; }
    .rs-leaf-back {
      z-index: 1;
      transform: rotateY(180deg);
      background: var(--panel);
    }
    .rs-leaf-back-inner {
      width: 100%;
      height: 100%;
      transform: scaleX(-1);
      opacity: 0.22;
      pointer-events: none;
    }
    .rs-curl-lighting {
      position: absolute;
      inset: 0;
      pointer-events: none;
      background: linear-gradient(to right, rgba(0,0,0,0.18) 0%, rgba(255,255,255,0.22) 45%, rgba(0,0,0,0.22) 100%);
      opacity: 0.35;
      z-index: 5;
    }
    .page-canvas-wrap {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      background: var(--bg);
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    .page-canvas-wrap canvas {
      width: 100%;
      height: 100%;
      object-fit: contain;
      display: block;
    }
    .md-page-leaf {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      background: var(--bg);
      color: var(--fg);
      padding: 22px 18px 20px;
      box-sizing: border-box;
      overflow: hidden;
      border: none;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .md-page-content {
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
      overflow-x: hidden;
      -webkit-overflow-scrolling: touch;
      touch-action: pan-y;
      font-size: inherit;
      line-height: inherit;
      color: inherit;
      word-break: break-word;
      overflow-wrap: break-word;
    }
    .md-page-content > :first-child { margin-top: 0; }
    .md-page-content h1 { font-size: 1.45em; margin-top: 0.4em; margin-bottom: 0.45em; line-height: 1.25; font-weight: 700; }
    .md-page-content h2 { font-size: 1.25em; margin-top: 0.6em; margin-bottom: 0.35em; line-height: 1.3; font-weight: 650; border-bottom: 1px solid var(--border); padding-bottom: 4px; }
    .md-page-content h3 { font-size: 1.1em; margin-top: 0.5em; margin-bottom: 0.3em; line-height: 1.35; font-weight: 600; }
    .md-page-content h4 { font-size: 1.02em; margin-top: 0.45em; margin-bottom: 0.25em; font-weight: 600; }
    .md-page-content p { margin: 0.35em 0 0.55em; line-height: inherit; }
    .md-page-content ul, .md-page-content ol { padding-left: 26px; margin: 0.35em 0 0.55em; }
    .md-page-content li { margin-bottom: 0.25em; line-height: inherit; }
    .md-page-content blockquote {
      margin: 0.5em 0;
      padding: 6px 12px;
      border-left: 3px solid var(--accent);
      background: var(--panel);
      color: var(--muted);
      border-radius: 0 6px 6px 0;
    }
    .md-page-content code {
      background: rgba(150, 150, 150, 0.15);
      padding: 1px 5px;
      border-radius: 4px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.88em;
    }
    .md-page-content pre {
      background: rgba(150, 150, 150, 0.12);
      padding: 10px 12px;
      border-radius: 8px;
      border: 1px solid var(--border);
      font-size: 0.86em;
      line-height: 1.48;
      white-space: pre-wrap;
      word-break: break-word;
      margin: 0.5em 0;
    }
    .md-page-content pre code { background: transparent; padding: 0; border-radius: 0; font-size: inherit; }
    .md-page-content hr { border: none; border-top: 1px solid var(--border); margin: 0.9em 0; }
    .md-page-content a { color: var(--accent); text-decoration: underline; }
    .md-page-content img, .md-page-content svg { max-width: 100%; height: auto; border-radius: 6px; }
    .md-page-content table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.88em;
      margin: 0.5em 0;
    }
    .md-page-content th, .md-page-content td {
      border: 1px solid var(--border);
      padding: 5px 7px;
      text-align: left;
      word-break: break-word;
    }
    .md-page-content th { background: var(--panel); font-weight: 600; }
    .md-page-content [data-rs-reopened="true"] {
      margin-top: 0 !important;
      padding-top: 0 !important;
      border-top-width: 0 !important;
      border-top-left-radius: 0 !important;
      border-top-right-radius: 0 !important;
      text-indent: 0 !important;
    }
    .md-page-content li[data-rs-reopened="true"] {
      list-style-type: none !important;
    }
    .md-page-content [data-rs-sliced="true"] {
      margin-bottom: 0 !important;
      padding-bottom: 0 !important;
      border-bottom-width: 0 !important;
      border-bottom-left-radius: 0 !important;
      border-bottom-right-radius: 0 !important;
    }
    .md-page-footer {
      flex: 0 0 auto;
      font-size: 11px;
      font-weight: 600;
      color: var(--muted);
      text-align: right;
      padding-top: 6px;
      margin-top: 6px;
      border-top: 1px solid var(--border);
      user-select: none;
    }
    .katex-display { margin: 12px 0; overflow-x: auto; overflow-y: hidden; }
    .katex { font-size: 1.08em; }

    .rs-zoom-pill {
      position: fixed;
      top: 16px;
      right: 16px;
      background: rgba(15, 23, 42, 0.92);
      color: #ffffff;
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      z-index: 10000;
      cursor: pointer;
      display: none;
      box-shadow: 0 4px 12px rgba(0,0,0,0.25);
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
      box-shadow: 0 8px 24px rgba(0,0,0,0.2);
      z-index: 9000;
      transition: opacity 0.22s ease, transform 0.22s ease;
      opacity: 1;
      max-width: 94vw;
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
      width: 100%;
      max-width: 820px;
      aspect-ratio: 1 / 1.414;
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
      max-width: ${Number(settings.contentWidth || 760)}px;
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
      <div>Loading ${safeDocTitle}…</div>
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
    const pdfWorkerB64 = ${doc.kind === 'pdf' ? JSON.stringify(OFFLINE_PDFJS_WORKER_B64) : '""'};

    window.__readerState = {
      mode: ${JSON.stringify(settings.readingMode || 'scroll')},
      page: ${Math.max(1, Number(doc.position?.page || 1))},
      initialPage: ${Math.max(1, Number(doc.position?.page || 1))},
      initialScroll: ${Math.max(0, Number(doc.position?.scroll || 0))},
      initialPageApplied: false,
      total: 1,
      nightLight: ${Number(settings.nightLight || 0)},
      fontFamily: ${JSON.stringify(settings.fontFamily || 'system')},
      textAlign: ${JSON.stringify(settings.textAlign || 'left')},
      fontSize: ${Number(settings.fontSize || 16)},
      lineHeight: ${Number(settings.lineHeight || 1.6)},
      contentWidth: ${Number(settings.contentWidth || 760)},
      lastFlipTime: 0,
      lastContentHtml: '',
      currentPages: [],
      currentZoom: 1,
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

    function playPaperTurnSound() {
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const duration = 0.08;
        const bufferSize = Math.floor(ctx.sampleRate * duration);
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.35));
        }
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(800, ctx.currentTime);
        filter.frequency.exponentialRampToValueAtTime(250, ctx.currentTime + duration);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        noise.start();
      } catch (e) {}
    }

    let hideScrubberTimer = null;
    function showScrubberBriefly(duration) {
      const dur = duration || 5000;
      const bar = document.getElementById('rsScrubBar');
      if (!bar) return;
      bar.classList.remove('hidden-bar');
      clearTimeout(hideScrubberTimer);
      hideScrubberTimer = setTimeout(() => {
        bar.classList.add('hidden-bar');
      }, dur);
    }

    function hideScrubber() {
      const bar = document.getElementById('rsScrubBar');
      if (!bar) return;
      bar.classList.add('hidden-bar');
      clearTimeout(hideScrubberTimer);
    }

    function toggleScrubber() {
      const bar = document.getElementById('rsScrubBar');
      if (!bar) return;
      if (bar.classList.contains('hidden-bar')) {
        showScrubberBriefly(6000);
      } else {
        hideScrubber();
      }
    }
    window.showScrubber = showScrubberBriefly;
    window.hideScrubber = hideScrubber;
    window.toggleScrubber = toggleScrubber;

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

    function renderMathInMarkdown(text, sanitizer) {
      if (!text) return '';
      var mathBlocks = [];
      var codeBlocks = [];

      // Protect fenced code blocks, inline code spans, and escaped \\$ from $ math parsing
      var bt = String.fromCharCode(96);
      var fenceRe = new RegExp(bt + bt + bt + '[\\\\s\\\\S]*?' + bt + bt + bt, 'g');
      var inlineRe = new RegExp(bt + '[^' + bt + '\\\\n]+' + bt, 'g');
      var protectedText = text.replace(fenceRe, function(m) {
        var id = 'RSCODEBLK' + codeBlocks.length + 'Z';
        codeBlocks.push({ id: id, raw: m });
        return id;
      }).replace(inlineRe, function(m) {
        var id = 'RSCODEINL' + codeBlocks.length + 'Z';
        codeBlocks.push({ id: id, raw: m });
        return id;
      }).replace(/\\\\\\$/g, 'RSESCAPEDDOLLARZ');

      var parts = protectedText.split('$$');
      var s = '';
      for (var i = 0; i < parts.length; i++) {
        if (i % 2 === 1) {
          var id = 'KATEXDISP' + mathBlocks.length + 'Z';
          mathBlocks.push({ id: id, math: parts[i].trim(), display: true });
          s += id;
        } else {
          s += parts[i];
        }
      }

      var out = '';
      var nlChar = String.fromCharCode(10);
      var crChar = String.fromCharCode(13);
      var idx = 0;
      while (idx < s.length) {
        if (s[idx] === '$') {
          var nextCh = idx + 1 < s.length ? s[idx + 1] : '';
          if (nextCh && !/\\s/.test(nextCh) && nextCh !== '$') {
            var closeIdx = s.indexOf('$', idx + 1);
            if (closeIdx > idx + 1) {
              var inner = s.slice(idx + 1, closeIdx);
              var afterClose = closeIdx + 1 < s.length ? s[closeIdx + 1] : '';
              var hasNewline = inner.indexOf(nlChar) !== -1 || inner.indexOf(crChar) !== -1;
              if (!hasNewline && !/\\s$/.test(inner) && !/^\\d/.test(afterClose)) {
                var idIn = 'KATEXINLN' + mathBlocks.length + 'Z';
                mathBlocks.push({ id: idIn, math: inner.trim(), display: false });
                out += idIn;
                idx = closeIdx + 1;
                continue;
              }
            }
          }
        }
        out += s[idx];
        idx++;
      }

      out = out.replace(/RSESCAPEDDOLLARZ/g, '\\\\$');
      for (var c = 0; c < codeBlocks.length; c++) {
        out = out.replace(codeBlocks[c].id, codeBlocks[c].raw);
      }

      var html = '';
      var markedParser = (typeof marked !== 'undefined' ? marked : (typeof window !== 'undefined' ? window.marked : null));
      if (markedParser && typeof markedParser.parse === 'function') {
        html = markedParser.parse(out);
      } else if (typeof markedParser === 'function') {
        html = markedParser(out);
      } else {
        html = out;
      }

      // Sanitize Markdown HTML BEFORE injecting KaTeX output so KaTeX inline styles/SVG stay intact
      if (sanitizer && typeof sanitizer.sanitize === 'function') {
        html = sanitizer.sanitize(html);
      }

      for (var k = 0; k < mathBlocks.length; k++) {
        var item = mathBlocks[k];
        var rendered = escapeHtml(item.math);
        try {
          if (window.katex && typeof window.katex.renderToString === 'function') {
            rendered = window.katex.renderToString(item.math, {
              displayMode: item.display,
              throwOnError: false
            });
          }
        } catch (e) {}
        html = html.replace(item.id, rendered);
      }

      return html;
    }

    function attachZoomAndPanHandlers(stage, pageFlip) {
      if (!stage) return;
      let currentZoom = 1;
      let panX = 0;
      let panY = 0;
      window.__readerState.currentZoom = 1;

      function updateZoomTransform(smooth) {
        const zCont = document.getElementById('rsZoomContainer');
        const pill = document.getElementById('rsZoomPill');
        if (!zCont) return;
        zCont.style.transition = smooth ? 'transform 0.22s cubic-bezier(0.2, 0.9, 0.3, 1)' : 'none';

        if (currentZoom > 1.05) {
          const maxPanX = (window.innerWidth * (currentZoom - 1)) / 2;
          const maxPanY = (window.innerHeight * (currentZoom - 1)) / 2;
          panX = Math.max(-maxPanX, Math.min(maxPanX, panX));
          panY = Math.max(-maxPanY, Math.min(maxPanY, panY));
          zCont.style.transform = 'translate(' + panX + 'px, ' + panY + 'px) scale(' + currentZoom + ')';
          if (pill) {
            pill.style.display = 'block';
            pill.textContent = 'Zoom ' + Math.round(currentZoom * 100) + '% ✕';
          }
        } else {
          currentZoom = 1;
          panX = 0;
          panY = 0;
          zCont.style.transform = 'none';
          if (pill) pill.style.display = 'none';
        }
        window.__readerState.currentZoom = currentZoom;
      }

      function resetZoom() {
        currentZoom = 1;
        panX = 0;
        panY = 0;
        updateZoomTransform(true);
      }
      window.resetZoom = resetZoom;

      let lastTapTime = 0;
      let tapStartX = 0;
      let tapStartY = 0;
      let initialDist = 0;
      let initialZoom = 1;
      let isPanning = false;
      let panStart = { x: 0, y: 0 };

      stage.addEventListener('touchstart', (e) => {
        if (e.touches && e.touches.length >= 2) {
          e.preventDefault();
          if (pageFlip) {
            try { pageFlip.getFlipController().stopMove(); } catch (err) {}
          }
          initialDist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
          );
          initialZoom = currentZoom;
        } else if (e.touches && e.touches.length === 1) {
          tapStartX = e.touches[0].clientX;
          tapStartY = e.touches[0].clientY;
          if (currentZoom > 1.05) {
            e.preventDefault();
            e.stopPropagation();
            isPanning = true;
            panStart = { x: e.touches[0].clientX - panX, y: e.touches[0].clientY - panY };
          }
        }
      }, { passive: false });

      stage.addEventListener('touchmove', (e) => {
        if (e.touches && e.touches.length >= 2 && initialDist > 0) {
          e.preventDefault();
          const dist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
          );
          currentZoom = Math.min(3.8, Math.max(1, initialZoom * (dist / initialDist)));
          updateZoomTransform(false);
        } else if (e.touches && e.touches.length === 1 && isPanning && currentZoom > 1.05) {
          e.preventDefault();
          e.stopPropagation();
          panX = e.touches[0].clientX - panStart.x;
          panY = e.touches[0].clientY - panStart.y;
          updateZoomTransform(false);
        }
      }, { passive: false });

      stage.addEventListener('touchend', (e) => {
        if (!e.touches || e.touches.length < 2) initialDist = 0;
        if (!e.touches || e.touches.length === 0) isPanning = false;

        if (e.changedTouches && e.changedTouches.length === 1) {
          const tx = e.changedTouches[0].clientX;
          const ty = e.changedTouches[0].clientY;
          const moved = Math.hypot(tx - tapStartX, ty - tapStartY);
          const inCenterZone = tx > window.innerWidth * 0.22 && tx < window.innerWidth * 0.78;
          const now = Date.now();
          if (moved < 14 && inCenterZone && (!pageFlip || pageFlip.getState() === 'read')) {
            if (now - lastTapTime < 300) {
              lastTapTime = 0;
              window.__readerState.lastFlipTime = Date.now();
              if (currentZoom > 1.05) {
                resetZoom();
              } else {
                currentZoom = 2.1;
                updateZoomTransform(true);
              }
              return;
            }
            lastTapTime = now;
          }
        }
      });
    }

    function extractPlainTextMobile(html) {
      if (!html) return '';
      const d = document.createElement('div');
      d.innerHTML = html;
      return (d.textContent || '').replace(/\\s+/g, ' ').trim();
    }

    async function prepareImagesForPagination(rawHtml, maxW) {
      if (!rawHtml || rawHtml.indexOf('<img') === -1) return rawHtml;
      const doc = new DOMParser().parseFromString('<body>' + rawHtml + '</body>', 'text/html');
      const imgs = Array.from(doc.querySelectorAll('img'));
      if (imgs.length === 0) return rawHtml;

      await Promise.all(imgs.map((img) => new Promise((resolve) => {
        const src = img.getAttribute('src') || '';
        if (!src) return resolve();
        const loader = new Image();
        const done = () => {
          if (loader.naturalWidth > 0 && loader.naturalHeight > 0 && !img.getAttribute('width') && !img.getAttribute('height')) {
            img.style.aspectRatio = loader.naturalWidth + ' / ' + loader.naturalHeight;
            if (!img.style.width) img.style.width = Math.min(loader.naturalWidth, maxW) + 'px';
          }
          resolve();
        };
        loader.onload = done;
        loader.onerror = () => resolve();
        loader.src = src;
        setTimeout(resolve, 400);
      })));
      return doc.body.innerHTML;
    }

    function paginateHtmlMobile(rawHtml, contentWidth, maxContentHeight) {
      if (!rawHtml || typeof rawHtml !== 'string') return [''];
      const parsedDoc = new DOMParser().parseFromString('<body>' + rawHtml + '</body>', 'text/html');
      const topNodes = Array.from(parsedDoc.body.childNodes);
      if (topNodes.length === 0) return [rawHtml];

      const effectiveMaxHeight = Math.max(140, maxContentHeight - 10);
      const VOID_OR_MEDIA = new Set(['IMG', 'SVG', 'HR', 'BR', 'VIDEO', 'AUDIO', 'CANVAS', 'IFRAME', 'INPUT', 'MATH', 'OBJECT', 'EMBED']);
      const HEADINGS = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6']);

      function isAtomicElement(el) {
        const tag = el.tagName.toUpperCase();
        if (VOID_OR_MEDIA.has(tag) || el.childNodes.length === 0) return true;
        if (el.classList && (el.classList.contains('katex') || el.classList.contains('katex-display'))) return true;
        return false;
      }

      function hasMeaningfulContent(root) {
        if (root.nodeType === Node.TEXT_NODE) return /\\S/.test(root.textContent || '');
        if (root.nodeType !== Node.ELEMENT_NODE) return false;
        const tag = root.tagName.toUpperCase();
        if (tag === 'IMG' || tag === 'SVG' || tag === 'HR' || tag === 'VIDEO' || tag === 'CANVAS' || tag === 'IFRAME' || tag === 'INPUT' || tag === 'MATH') return true;
        for (let i = 0; i < root.childNodes.length; i++) {
          if (hasMeaningfulContent(root.childNodes[i])) return true;
        }
        return false;
      }

      function snapSplitIndex(text, maxLen, inPre, allowMidWord) {
        if (maxLen <= 0) return 0;
        if (maxLen >= text.length) return text.length;
        let idx = maxLen;
        if (idx > 0 && idx < text.length) {
          const code = text.charCodeAt(idx - 1);
          if (code >= 0xd800 && code <= 0xdbff) idx--;
        }
        if (inPre) {
          const nl = text.lastIndexOf('\\n', idx - 1);
          if (nl >= 0) return nl + 1;
        }
        if (idx > 0 && idx < text.length && !/\\s/.test(text[idx]) && !/\\s/.test(text[idx - 1])) {
          const prefix = text.slice(0, idx);
          const match = prefix.match(/\\s(?=[^\\s]*$)/);
          if (match && match.index !== undefined && match.index > 0) return match.index + 1;
          if (!allowMidWord) return 0;
        }
        return idx;
      }

      function splitContainerIntoLines(container) {
        const lines = [[]];
        function appendToCurrentLine(node, wrapperStack) {
          const curLine = lines[lines.length - 1];
          if (wrapperStack.length === 0) {
            curLine.push(node);
            return;
          }
          let targetArr = curLine;
          let parentEl = null;
          for (let i = 0; i < wrapperStack.length; i++) {
            const srcWrap = wrapperStack[i];
            const last = targetArr[targetArr.length - 1];
            if (last && last.nodeType === Node.ELEMENT_NODE && last.__rsSrc === srcWrap) {
              parentEl = last;
              targetArr = Array.from(last.childNodes);
            } else {
              const clone = srcWrap.cloneNode(false);
              clone.__rsSrc = srcWrap;
              if (parentEl) parentEl.appendChild(clone);
              else curLine.push(clone);
              parentEl = clone;
              targetArr = [];
            }
          }
          if (parentEl) parentEl.appendChild(node);
          else curLine.push(node);
        }
        function walk(node, wrapperStack) {
          if (node.nodeType === Node.TEXT_NODE) {
            const parts = (node.textContent || '').split('\\n');
            for (let i = 0; i < parts.length; i++) {
              if (parts[i].length > 0) appendToCurrentLine(document.createTextNode(parts[i]), wrapperStack);
              if (i < parts.length - 1) lines.push([]);
            }
            return;
          }
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.tagName.toUpperCase() === 'BR') {
              lines.push([]);
              return;
            }
            if (node.childNodes.length === 0) {
              appendToCurrentLine(node.cloneNode(true), wrapperStack);
              return;
            }
            const nextStack = wrapperStack.concat([node]);
            for (let i = 0; i < node.childNodes.length; i++) walk(node.childNodes[i], nextStack);
          }
        }
        for (let i = 0; i < container.childNodes.length; i++) walk(container.childNodes[i], []);
        return lines;
      }

      const measureEl = document.createElement('div');
      measureEl.className = 'md-page-content';
      measureEl.style.position = 'fixed';
      measureEl.style.left = '-99999px';
      measureEl.style.top = '0';
      measureEl.style.width = contentWidth + 'px';
      measureEl.style.maxWidth = contentWidth + 'px';
      measureEl.style.height = 'auto';
      measureEl.style.maxHeight = 'none';
      measureEl.style.overflow = 'visible';
      measureEl.style.display = 'flow-root';
      measureEl.style.visibility = 'hidden';
      measureEl.style.pointerEvents = 'none';
      measureEl.style.boxSizing = 'border-box';
      measureEl.style.padding = '0';
      measureEl.style.margin = '0';
      measureEl.style.fontSize = (window.__readerState.fontSize || 16) + 'px';
      measureEl.style.lineHeight = String(window.__readerState.lineHeight || 1.6);
      document.body.appendChild(measureEl);

      const pages = [];
      const liNumberMap = new WeakMap();

      function currentHeight() {
        const rectH = Math.ceil(measureEl.getBoundingClientRect().height);
        return Math.max(rectH, measureEl.scrollHeight);
      }
      function fits() {
        return currentHeight() <= effectiveMaxHeight;
      }
      function commitPage() {
        if (!hasMeaningfulContent(measureEl)) {
          measureEl.replaceChildren();
          return;
        }
        const html = measureEl.innerHTML.trim();
        if (html.length > 0) pages.push(html);
        measureEl.replaceChildren();
      }

      function startNewPageWithReopenedAncestors(targetContainer) {
        const chain = [];
        let cur = targetContainer;
        while (cur && cur !== measureEl) {
          chain.unshift(cur);
          cur = cur.parentElement;
        }
        const specs = chain.map((anc) => {
          const hadContent = hasMeaningfulContent(anc);
          const tag = anc.tagName.toUpperCase();
          let olNextStart;
          let liValue;
          if (tag === 'OL') {
            const lis = Array.from(anc.children).filter((c) => c.tagName.toUpperCase() === 'LI');
            const startAttr = anc.getAttribute('start');
            let nextNum = startAttr !== null && !isNaN(Number(startAttr)) ? Number(startAttr) : 1;
            for (let i = 0; i < lis.length; i++) {
              const v = lis[i].getAttribute('value');
              if (v !== null && !isNaN(Number(v))) nextNum = Number(v);
              if (hasMeaningfulContent(lis[i])) nextNum++;
            }
            olNextStart = nextNum;
          } else if (tag === 'LI') {
            const v = anc.getAttribute('value');
            if (v !== null && !isNaN(Number(v))) liValue = Number(v);
          }
          return { anc, hadContent, olNextStart, liValue };
        });

        for (let i = specs.length - 1; i >= 0; i--) {
          if (!specs[i].hadContent) {
            if (specs[i].anc.parentNode) specs[i].anc.parentNode.removeChild(specs[i].anc);
          } else {
            specs[i].anc.setAttribute('data-rs-sliced', 'true');
          }
        }
        commitPage();

        let parent = measureEl;
        for (let i = 0; i < specs.length; i++) {
          const spec = specs[i];
          const clone = spec.anc.cloneNode(false);
          clone.removeAttribute('data-rs-sliced');
          if (spec.hadContent) {
            clone.removeAttribute('id');
            clone.setAttribute('data-rs-reopened', 'true');
          } else {
            clone.removeAttribute('data-rs-reopened');
          }
          if (clone.tagName.toUpperCase() === 'OL' && spec.olNextStart !== undefined) {
            clone.setAttribute('start', String(spec.olNextStart));
          }
          if (clone.tagName.toUpperCase() === 'LI' && !spec.hadContent && spec.liValue !== undefined) {
            clone.setAttribute('value', String(spec.liValue));
          }
          parent.appendChild(clone);
          parent = clone;
        }
        return parent;
      }

      function appendTextNode(textNode, initialTarget) {
        let target = initialTarget;
        let remaining = textNode.textContent || '';
        if (!remaining) return target;
        if (target === measureEl && !/\\S/.test(remaining)) return target;
        const inPre = target.closest('pre') !== null;

        while (remaining.length > 0) {
          if (!hasMeaningfulContent(measureEl) && !inPre) {
            remaining = remaining.replace(/^\\s+/, '');
            if (!remaining) break;
          }
          const prevH = currentHeight();
          const fullNode = document.createTextNode(remaining);
          target.appendChild(fullNode);
          if (fits()) break;
          const fullH = currentHeight();
          target.removeChild(fullNode);

          const pageHasContent = hasMeaningfulContent(measureEl);
          const probe = document.createTextNode('');
          target.appendChild(probe);
          let lo = 0;
          let hi = remaining.length;
          let best = 0;
          // Smart proportional bracket to cut binary search reflows by ~3x
          if (fullH > prevH && effectiveMaxHeight > prevH) {
            const est = Math.max(1, Math.min(remaining.length - 1, Math.floor(remaining.length * ((effectiveMaxHeight - prevH) / (fullH - prevH)))));
            const lowGuess = Math.max(0, Math.floor(est * 0.72));
            const highGuess = Math.min(remaining.length, Math.ceil(est * 1.32));
            probe.textContent = remaining.slice(0, lowGuess);
            if (fits()) {
              best = lowGuess;
              lo = lowGuess + 1;
            }
            probe.textContent = remaining.slice(0, highGuess);
            if (!fits()) {
              hi = highGuess - 1;
            } else {
              best = highGuess;
              lo = highGuess + 1;
            }
          }
          while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            probe.textContent = remaining.slice(0, mid);
            if (fits()) {
              best = mid;
              lo = mid + 1;
            } else {
              hi = mid - 1;
            }
          }
          target.removeChild(probe);

          let splitAt = snapSplitIndex(remaining, best, inPre, !pageHasContent);
          if (splitAt <= 0) {
            if (pageHasContent) {
              target = startNewPageWithReopenedAncestors(target);
              continue;
            }
            const firstBreak = inPre ? remaining.indexOf('\\n') : remaining.search(/\\s/);
            splitAt = firstBreak > 0 ? firstBreak + 1 : Math.min(remaining.length, Math.max(1, best || 1));
          }

          const headRaw = remaining.slice(0, splitAt);
          const head = inPre && headRaw.endsWith('\\n') && remaining.length > splitAt ? headRaw.slice(0, -1) : headRaw;
          if (head.length > 0) target.appendChild(document.createTextNode(head));
          remaining = remaining.slice(splitAt);
          if (!inPre) remaining = remaining.replace(/^\\s+/, '');
          if (remaining.length > 0) target = startNewPageWithReopenedAncestors(target);
        }
        return target;
      }

      function appendTable(tableEl, initialTarget) {
        let target = initialTarget;
        const thead = tableEl.querySelector(':scope > thead');
        const allTrs = Array.from(tableEl.querySelectorAll(':scope > tbody > tr, :scope > tr'));
        let headerTr = null;
        let dataTrs = allTrs;
        if (!thead && allTrs.length > 1) {
          const first = allTrs[0];
          if (first.querySelector('th') && !first.querySelector('td')) {
            headerTr = first;
            dataTrs = allTrs.slice(1);
          }
        }
        function makeTableShell(reopened) {
          const t = tableEl.cloneNode(false);
          if (reopened) {
            t.removeAttribute('id');
            t.setAttribute('data-rs-reopened', 'true');
          }
          if (thead) {
            const thClone = thead.cloneNode(true);
            if (reopened) thClone.setAttribute('data-rs-repeated-header', 'true');
            t.appendChild(thClone);
          }
          const tb = document.createElement('tbody');
          if (headerTr) {
            const hrClone = headerTr.cloneNode(true);
            if (reopened) hrClone.setAttribute('data-rs-repeated-header', 'true');
            tb.appendChild(hrClone);
          }
          t.appendChild(tb);
          return { table: t, tbody: tb };
        }

        let shell = makeTableShell(false);
        target.appendChild(shell.table);

        if (dataTrs.length > 0) {
          const firstRowClone = dataTrs[0].cloneNode(true);
          shell.tbody.appendChild(firstRowClone);
          if (!fits() && hasMeaningfulContent(measureEl)) {
            shell.tbody.removeChild(firstRowClone);
            target.removeChild(shell.table);
            if (hasMeaningfulContent(measureEl)) {
              target = startNewPageWithReopenedAncestors(target);
              shell = makeTableShell(false);
              target.appendChild(shell.table);
            } else {
              target.appendChild(shell.table);
            }
          } else {
            shell.tbody.removeChild(firstRowClone);
          }
        }

        let dataRowsInCurrent = 0;
        for (let i = 0; i < dataTrs.length; i++) {
          const trClone = dataTrs[i].cloneNode(true);
          shell.tbody.appendChild(trClone);
          if (fits()) {
            dataRowsInCurrent++;
            continue;
          }
          shell.tbody.removeChild(trClone);
          if (dataRowsInCurrent > 0 || hasMeaningfulContent(measureEl)) {
            if (dataRowsInCurrent === 0) target.removeChild(shell.table);
            else shell.table.setAttribute('data-rs-sliced', 'true');
            target = startNewPageWithReopenedAncestors(target);
            shell = makeTableShell(dataRowsInCurrent > 0);
            target.appendChild(shell.table);
            shell.tbody.appendChild(trClone);
            dataRowsInCurrent = 1;
          } else {
            shell.tbody.appendChild(trClone);
            dataRowsInCurrent++;
          }
        }
        return target;
      }

      function appendElement(el, initialTarget, nextSibling) {
        let target = initialTarget;
        const tag = el.tagName.toUpperCase();

        if (tag === 'BR' && !hasMeaningfulContent(target)) return target;
        if (tag === 'HR') {
          const hrClone = el.cloneNode(true);
          target.appendChild(hrClone);
          if (!fits()) {
            target.removeChild(hrClone);
            if (hasMeaningfulContent(measureEl)) target = startNewPageWithReopenedAncestors(target);
          }
          return target;
        }

        if (tag === 'OL') {
          const startAttr = el.getAttribute('start');
          let cur = startAttr !== null && !isNaN(Number(startAttr)) ? Number(startAttr) : 1;
          for (let i = 0; i < el.children.length; i++) {
            const li = el.children[i];
            if (li.tagName.toUpperCase() !== 'LI') continue;
            const v = li.getAttribute('value');
            if (v !== null && !isNaN(Number(v))) cur = Number(v);
            liNumberMap.set(li, cur);
            cur++;
          }
        }

        const deepClone = el.cloneNode(true);
        if (tag === 'LI') {
          const n = liNumberMap.get(el);
          if (n !== undefined && !deepClone.hasAttribute('value')) deepClone.setAttribute('value', String(n));
        }
        target.appendChild(deepClone);

        if (fits()) {
          if (target === measureEl && HEADINGS.has(tag) && nextSibling) {
            const remainingH = effectiveMaxHeight - currentHeight();
            const hadPrior = Array.from(measureEl.childNodes).some((n) => n !== deepClone && hasMeaningfulContent(n));
            if (hadPrior && remainingH < 42) {
              measureEl.removeChild(deepClone);
              commitPage();
              measureEl.appendChild(deepClone);
            }
          }
          return target;
        }

        target.removeChild(deepClone);

        if (isAtomicElement(el)) {
          if (hasMeaningfulContent(measureEl)) target = startNewPageWithReopenedAncestors(target);
          const mediaClone = el.cloneNode(true);
          target.appendChild(mediaClone);
          if (!fits() && (tag === 'IMG' || tag === 'SVG' || tag === 'VIDEO' || tag === 'CANVAS')) {
            mediaClone.style.maxHeight = Math.max(100, effectiveMaxHeight - 8) + 'px';
            mediaClone.style.maxWidth = '100%';
            mediaClone.style.width = 'auto';
            mediaClone.style.height = 'auto';
            mediaClone.style.objectFit = 'contain';
          }
          return target;
        }

        if (HEADINGS.has(tag) && hasMeaningfulContent(measureEl)) {
          target = startNewPageWithReopenedAncestors(target);
          target.appendChild(deepClone);
          if (fits()) return target;
          target.removeChild(deepClone);
        }

        if (tag === 'TABLE') return appendTable(el, target);

        if (tag === 'PRE') {
          if (hasMeaningfulContent(measureEl) && currentHeight() > effectiveMaxHeight * 0.75) {
            const nextTarget = startNewPageWithReopenedAncestors(target);
            nextTarget.appendChild(deepClone);
            if (fits()) return nextTarget;
            nextTarget.removeChild(deepClone);
            target = nextTarget;
          }
          const codeChild = el.children.length === 1 && el.children[0].tagName.toUpperCase() === 'CODE' ? el.children[0] : null;
          const lines = splitContainerIntoLines(codeChild || el);
          if (lines.length > 1) {
            function makePreShell(reopened) {
              const p = el.cloneNode(false);
              if (reopened) {
                p.removeAttribute('id');
                p.setAttribute('data-rs-reopened', 'true');
              }
              if (codeChild) {
                const c = codeChild.cloneNode(false);
                if (reopened) c.removeAttribute('id');
                p.appendChild(c);
                return { pre: p, host: c };
              }
              return { pre: p, host: p };
            }
            function appendLineNodes(host, lineNodes, addNl) {
              for (let k = 0; k < lineNodes.length; k++) host.appendChild(lineNodes[k].cloneNode(true));
              if (addNl) host.appendChild(document.createTextNode('\\n'));
            }
            let shell = makePreShell(false);
            target.appendChild(shell.pre);
            let linesInCur = 0;
            for (let li = 0; li < lines.length; li++) {
              const lineNodes = lines[li];
              const beforeCount = shell.host.childNodes.length;
              appendLineNodes(shell.host, lineNodes, li < lines.length - 1);
              if (fits()) {
                linesInCur++;
                continue;
              }
              while (shell.host.childNodes.length > beforeCount) shell.host.removeChild(shell.host.lastChild);
              if (linesInCur > 0 || hasMeaningfulContent(measureEl)) {
                if (linesInCur === 0) target.removeChild(shell.pre);
                else {
                  if (shell.host.lastChild && shell.host.lastChild.nodeType === Node.TEXT_NODE && shell.host.lastChild.textContent === '\\n') {
                    shell.host.removeChild(shell.host.lastChild);
                  }
                  shell.pre.setAttribute('data-rs-sliced', 'true');
                }
                target = startNewPageWithReopenedAncestors(target);
                shell = makePreShell(linesInCur > 0);
                target.appendChild(shell.pre);
                linesInCur = 0;
                const retryBefore = shell.host.childNodes.length;
                appendLineNodes(shell.host, lineNodes, li < lines.length - 1);
                if (fits()) {
                  linesInCur++;
                  continue;
                }
                while (shell.host.childNodes.length > retryBefore) shell.host.removeChild(shell.host.lastChild);
              }
              for (let k = 0; k < lineNodes.length; k++) {
                const n = lineNodes[k];
                if (n.nodeType === Node.TEXT_NODE) shell.host = appendTextNode(n, shell.host);
                else if (n.nodeType === Node.ELEMENT_NODE) shell.host = appendElement(n, shell.host, null);
              }
              if (li < lines.length - 1) shell.host.appendChild(document.createTextNode('\\n'));
              shell.pre = shell.host.closest('pre') || shell.pre;
              linesInCur = 1;
            }
            return target;
          }
        }

        const shallow = el.cloneNode(false);
        if (tag === 'LI') {
          const n = liNumberMap.get(el);
          if (n !== undefined && !shallow.hasAttribute('value')) shallow.setAttribute('value', String(n));
        }
        target.appendChild(shallow);

        let curTarget = shallow;
        const children = Array.from(el.childNodes);
        for (let i = 0; i < children.length; i++) {
          const child = children[i];
          const childNext = i + 1 < children.length ? children[i + 1] : null;
          if (child.nodeType === Node.COMMENT_NODE) continue;
          if (child.nodeType === Node.TEXT_NODE) curTarget = appendTextNode(child, curTarget);
          else if (child.nodeType === Node.ELEMENT_NODE) curTarget = appendElement(child, curTarget, childNext);
        }

        if (!hasMeaningfulContent(curTarget) && curTarget.parentElement) {
          const p = curTarget.parentElement;
          p.removeChild(curTarget);
          return p;
        }
        return curTarget.parentElement || measureEl;
      }

      try {
        let curTarget = measureEl;
        for (let i = 0; i < topNodes.length; i++) {
          const node = topNodes[i];
          const next = i + 1 < topNodes.length ? topNodes[i + 1] : null;
          if (node.nodeType === Node.COMMENT_NODE) continue;
          if (node.nodeType === Node.TEXT_NODE) curTarget = appendTextNode(node, curTarget);
          else if (node.nodeType === Node.ELEMENT_NODE) curTarget = appendElement(node, curTarget, next);
        }
        commitPage();
      } finally {
        if (measureEl.parentNode) measureEl.parentNode.removeChild(measureEl);
      }

      return pages.length > 0 ? pages : [rawHtml];
    }

    function createRsBookCurl(bookEl, items, opts) {
      opts = opts || {};
      const total = items.length;
      let curIdx = Math.max(0, Math.min(total - 1, opts.startPage || 0));
      let state = 'read'; // 'read' | 'user_fold' | 'flipping'
      const listeners = new Map();
      let activeLeaf = null;
      let activeShadow = null;
      let animTimer = null;
      let destroyed = false;

      const width = Math.max(200, opts.width || bookEl.clientWidth || window.innerWidth);
      const height = Math.max(240, opts.height || bookEl.clientHeight || window.innerHeight);
      const flipMs = opts.flippingTime || 320;

      bookEl.style.width = width + 'px';
      bookEl.style.height = height + 'px';

      const spine = document.createElement('div');
      spine.className = 'rs-book-spine';
      bookEl.appendChild(spine);

      function emit(ev, data) {
        const arr = listeners.get(ev);
        if (!arr) return;
        for (let i = 0; i < arr.length; i++) {
          try { arr[i]({ data: data, object: api }); } catch (e) {}
        }
      }

      function setState(next) {
        if (state !== next) {
          state = next;
          emit('changeState', next);
        }
      }

      function showOnly(idx) {
        for (let i = 0; i < total; i++) {
          items[i].style.display = i === idx ? 'flex' : 'none';
          items[i].style.zIndex = i === idx ? '10' : '1';
        }
      }

      function cloneLeafNode(srcEl, isVerso) {
        const clone = srcEl.cloneNode(true);
        clone.style.display = 'flex';
        clone.style.position = 'relative';
        clone.style.inset = '0';
        clone.style.width = '100%';
        clone.style.height = '100%';
        const srcCanvases = srcEl.querySelectorAll('canvas');
        const dstCanvases = clone.querySelectorAll('canvas');
        for (let i = 0; i < srcCanvases.length && i < dstCanvases.length; i++) {
          const sc = srcCanvases[i];
          const dc = dstCanvases[i];
          dc.width = sc.width;
          dc.height = sc.height;
          const ctx = dc.getContext('2d');
          if (ctx && sc.width > 0 && sc.height > 0) {
            ctx.drawImage(sc, 0, 0);
          }
        }
        if (isVerso) {
          const wrap = document.createElement('div');
          wrap.className = 'rs-leaf-back-inner';
          wrap.appendChild(clone);
          return wrap;
        }
        return clone;
      }

      function cleanupCurl() {
        if (animTimer) {
          clearTimeout(animTimer);
          animTimer = null;
        }
        if (activeLeaf && activeLeaf.parentNode) activeLeaf.parentNode.removeChild(activeLeaf);
        if (activeShadow && activeShadow.parentNode) activeShadow.parentNode.removeChild(activeShadow);
        activeLeaf = null;
        activeShadow = null;
      }

      function mountCurlPair(fromIdx, toIdx, dir) {
        cleanupCurl();
        const frontIdx = dir === 'next' ? fromIdx : toIdx;
        const baseIdx = dir === 'next' ? toIdx : fromIdx;

        for (let i = 0; i < total; i++) {
          if (i === baseIdx) {
            items[i].style.display = 'flex';
            items[i].style.zIndex = '10';
          } else {
            items[i].style.display = 'none';
            items[i].style.zIndex = '1';
          }
        }

        const shadow = document.createElement('div');
        shadow.className = 'rs-under-shadow';
        bookEl.appendChild(shadow);
        activeShadow = shadow;

        const leaf = document.createElement('div');
        leaf.className = 'rs-curl-leaf';

        const front = document.createElement('div');
        front.className = 'rs-leaf-front';
        front.appendChild(cloneLeafNode(items[frontIdx], false));
        const light = document.createElement('div');
        light.className = 'rs-curl-lighting';
        front.appendChild(light);

        const back = document.createElement('div');
        back.className = 'rs-leaf-back';
        back.appendChild(cloneLeafNode(items[frontIdx], true));

        leaf.appendChild(front);
        leaf.appendChild(back);
        bookEl.appendChild(leaf);
        activeLeaf = leaf;
        return { leaf, shadow, light };
      }

      function finishFlip(targetIdx) {
        cleanupCurl();
        curIdx = targetIdx;
        showOnly(curIdx);
        setState('read');
        emit('flip', curIdx);
      }

      function animateFlip(dir, fromIdx, toIdx, startProgress) {
        if (destroyed) return;
        setState('flipping');
        const pair = activeLeaf ? { leaf: activeLeaf, shadow: activeShadow } : mountCurlPair(fromIdx, toIdx, dir);
        const leaf = pair.leaf;
        const shadow = pair.shadow;

        if (startProgress === undefined) {
          const initAngle = dir === 'next' ? 0 : -180;
          leaf.style.transition = 'none';
          leaf.style.transform = 'rotateY(' + initAngle + 'deg) translateZ(0px)';
          if (shadow) shadow.style.opacity = dir === 'next' ? '0.45' : '0.05';
          void leaf.offsetWidth;
        }

        const endAngle = dir === 'next' ? -180 : 0;
        leaf.style.transition = 'transform ' + flipMs + 'ms cubic-bezier(0.22, 1, 0.36, 1)';
        leaf.style.transform = 'rotateY(' + endAngle + 'deg) translateZ(0px)';
        if (shadow) {
          shadow.style.transition = 'opacity ' + flipMs + 'ms ease';
          shadow.style.opacity = dir === 'next' ? '0' : '0.45';
        }

        animTimer = setTimeout(() => {
          finishFlip(toIdx);
        }, flipMs + 20);
      }

      function snapBack(dir, fromIdx) {
        if (!activeLeaf) {
          showOnly(fromIdx);
          setState('read');
          return;
        }
        setState('flipping');
        const backAngle = dir === 'next' ? 0 : -180;
        activeLeaf.style.transition = 'transform 200ms cubic-bezier(0.22, 1, 0.36, 1)';
        activeLeaf.style.transform = 'rotateY(' + backAngle + 'deg) translateZ(0px)';
        animTimer = setTimeout(() => {
          finishFlip(fromIdx);
        }, 215);
      }

      // Interactive touch drag + edge tap
      let drag = null;
      function onTouchStart(e) {
        if (destroyed || state === 'flipping') return;
        if (!e.touches || e.touches.length !== 1 || window.__readerState.currentZoom > 1.05) {
          if (state === 'user_fold' && drag) {
            snapBack(drag.dir, curIdx);
          }
          drag = null;
          return;
        }
        drag = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
          time: Date.now(),
          folding: false,
          dir: null,
          toIdx: curIdx,
          progress: 0,
        };
      }

      function onTouchMove(e) {
        if (!drag || destroyed || state === 'flipping') return;
        if (!e.touches || e.touches.length !== 1 || window.__readerState.currentZoom > 1.05) {
          if (drag.folding) snapBack(drag.dir, curIdx);
          drag = null;
          return;
        }
        const dx = e.touches[0].clientX - drag.x;
        const dy = e.touches[0].clientY - drag.y;

        if (!drag.folding) {
          if (Math.abs(dx) < 10 || Math.abs(dy) > Math.abs(dx) * 0.9) return;
          const dir = dx < 0 ? 'next' : 'prev';
          const toIdx = dir === 'next' ? curIdx + 1 : curIdx - 1;
          if (toIdx < 0 || toIdx >= total) {
            drag = null;
            return;
          }
          drag.folding = true;
          drag.dir = dir;
          drag.toIdx = toIdx;
          setState('user_fold');
          if (opts.onBeforeFlip) opts.onBeforeFlip(toIdx);
          mountCurlPair(curIdx, toIdx, dir);
        }

        if (drag.folding && activeLeaf) {
          e.preventDefault();
          const rawProg = drag.dir === 'next' ? -dx / width : dx / width;
          const prog = Math.max(0, Math.min(1, rawProg));
          drag.progress = prog;
          const angle = drag.dir === 'next' ? -prog * 180 : -(1 - prog) * 180;
          const liftZ = Math.sin(prog * Math.PI) * 16;
          activeLeaf.style.transition = 'none';
          activeLeaf.style.transform = 'rotateY(' + angle.toFixed(2) + 'deg) translateZ(' + liftZ.toFixed(1) + 'px)';
          if (activeShadow) {
            activeShadow.style.transition = 'none';
            activeShadow.style.opacity = String(drag.dir === 'next' ? (1 - prog) * 0.45 : prog * 0.45);
          }
        }
      }

      function onTouchEnd(e) {
        if (!drag || destroyed) return;
        const d = drag;
        drag = null;
        if (d.folding) {
          const dt = Math.max(1, Date.now() - d.time);
          const tx = e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientX : d.x;
          const vel = Math.abs(tx - d.x) / dt;
          if (d.progress > 0.22 || vel > 0.35) {
            animateFlip(d.dir, curIdx, d.toIdx, d.progress);
          } else {
            snapBack(d.dir, curIdx);
          }
          return;
        }
        if (e.changedTouches && e.changedTouches.length === 1 && window.__readerState.currentZoom <= 1.05) {
          const tx = e.changedTouches[0].clientX;
          const ty = e.changedTouches[0].clientY;
          const moved = Math.hypot(tx - d.x, ty - d.y);
          const dt = Date.now() - d.time;
          if (moved < 12 && dt < 350) {
            const rect = bookEl.getBoundingClientRect();
            const relX = (tx - rect.left) / Math.max(1, rect.width);
            if (relX > 0.80) api.flipNext();
            else if (relX < 0.20) api.flipPrev();
          }
        }
      }

      bookEl.addEventListener('touchstart', onTouchStart, { passive: true });
      bookEl.addEventListener('touchmove', onTouchMove, { passive: false });
      bookEl.addEventListener('touchend', onTouchEnd, { passive: true });

      // Mouse drag / edge-click support for desktop & web preview
      let mouseDrag = null;
      function onMouseDown(e) {
        if (destroyed || state === 'flipping' || e.button !== 0 || window.__readerState.currentZoom > 1.05) return;
        mouseDrag = { x: e.clientX, y: e.clientY, time: Date.now(), folding: false, dir: null, toIdx: curIdx, progress: 0 };
      }
      function onMouseMove(e) {
        if (!mouseDrag || destroyed || state === 'flipping') return;
        const dx = e.clientX - mouseDrag.x;
        const dy = e.clientY - mouseDrag.y;
        if (!mouseDrag.folding) {
          if (Math.abs(dx) < 12 || Math.abs(dy) > Math.abs(dx) * 0.9) return;
          const dir = dx < 0 ? 'next' : 'prev';
          const toIdx = dir === 'next' ? curIdx + 1 : curIdx - 1;
          if (toIdx < 0 || toIdx >= total) { mouseDrag = null; return; }
          mouseDrag.folding = true;
          mouseDrag.dir = dir;
          mouseDrag.toIdx = toIdx;
          setState('user_fold');
          if (opts.onBeforeFlip) opts.onBeforeFlip(toIdx);
          mountCurlPair(curIdx, toIdx, dir);
        }
        if (mouseDrag.folding && activeLeaf) {
          const rawProg = mouseDrag.dir === 'next' ? -dx / width : dx / width;
          const prog = Math.max(0, Math.min(1, rawProg));
          mouseDrag.progress = prog;
          const angle = mouseDrag.dir === 'next' ? -prog * 180 : -(1 - prog) * 180;
          const liftZ = Math.sin(prog * Math.PI) * 16;
          activeLeaf.style.transition = 'none';
          activeLeaf.style.transform = 'rotateY(' + angle.toFixed(2) + 'deg) translateZ(' + liftZ.toFixed(1) + 'px)';
        }
      }
      function onMouseUp(e) {
        if (!mouseDrag || destroyed) return;
        const d = mouseDrag;
        mouseDrag = null;
        if (d.folding) {
          const dt = Math.max(1, Date.now() - d.time);
          const vel = Math.abs(e.clientX - d.x) / dt;
          if (d.progress > 0.22 || vel > 0.35) animateFlip(d.dir, curIdx, d.toIdx, d.progress);
          else snapBack(d.dir, curIdx);
          return;
        }
        const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y);
        if (moved < 8 && window.__readerState.currentZoom <= 1.05) {
          const rect = bookEl.getBoundingClientRect();
          const relX = (e.clientX - rect.left) / Math.max(1, rect.width);
          if (relX > 0.80) api.flipNext();
          else if (relX < 0.20) api.flipPrev();
        }
      }
      bookEl.addEventListener('mousedown', onMouseDown);
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);

      showOnly(curIdx);

      const api = {
        getCurrentPageIndex: () => curIdx,
        getPageCount: () => total,
        getState: () => state,
        on: (ev, cb) => {
          if (!listeners.has(ev)) listeners.set(ev, []);
          listeners.get(ev).push(cb);
          return api;
        },
        off: (ev) => listeners.delete(ev),
        getFlipController: () => ({
          stopMove: () => {
            if (state === 'user_fold' && drag) {
              snapBack(drag.dir, curIdx);
              drag = null;
            }
            if (state === 'user_fold' && mouseDrag) {
              snapBack(mouseDrag.dir, curIdx);
              mouseDrag = null;
            }
          },
        }),
        flipNext: () => {
          if (destroyed || state !== 'read' || curIdx >= total - 1) return;
          animateFlip('next', curIdx, curIdx + 1);
        },
        flipPrev: () => {
          if (destroyed || state !== 'read' || curIdx <= 0) return;
          animateFlip('prev', curIdx, curIdx - 1);
        },
        turnToPage: (idx) => {
          if (destroyed) return;
          const target = Math.max(0, Math.min(total - 1, idx));
          cleanupCurl();
          curIdx = target;
          showOnly(curIdx);
          setState('read');
          emit('flip', curIdx);
        },
        destroy: () => {
          destroyed = true;
          cleanupCurl();
          bookEl.removeEventListener('touchstart', onTouchStart);
          bookEl.removeEventListener('touchmove', onTouchMove);
          bookEl.removeEventListener('touchend', onTouchEnd);
          bookEl.removeEventListener('mousedown', onMouseDown);
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
          listeners.clear();
        },
      };
      return api;
    }

    async function renderHtmlContent(contentHtml, opts) {
      opts = opts || {};
      window.__lastContentHtml = contentHtml;
      const root = document.getElementById('root');
      const mode = window.__readerState.mode;

      let prevScrollRatio = 0;
      let prevPageRatio = 0;
      if (opts.fromMode === 'scroll') {
        const maxS = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
        prevScrollRatio = Math.max(0, Math.min(1, window.scrollY / maxS));
      } else if (opts.fromMode === 'curl') {
        const curP = Math.max(1, window.__readerState.page || 1);
        const totP = Math.max(1, window.__readerState.total || 1);
        prevPageRatio = totP > 1 ? (curP - 1) / (totP - 1) : 0;
      }

      if (window.__pageFlip && typeof window.__pageFlip.destroy === 'function') {
        try { window.__pageFlip.destroy(); } catch (e) {}
        window.__pageFlip = null;
      }

      if (mode === 'curl') {
        let anchorSnippet = '';
        let anchorRatio = 0;
        if (opts.preserveAnchor && window.__readerState.currentPages && window.__readerState.currentPages.length > 0) {
          const curIdx = Math.max(0, Math.min(window.__readerState.currentPages.length - 1, (window.__readerState.page || 1) - 1));
          anchorSnippet = extractPlainTextMobile(window.__readerState.currentPages[curIdx]).slice(0, 48);
          anchorRatio = window.__readerState.currentPages.length > 1 ? curIdx / (window.__readerState.currentPages.length - 1) : 0;
        }

        const targetW = window.innerWidth;
        const targetH = window.innerHeight;

        // Measure exact .md-page-content dimensions from a real .md-page-leaf template
        const probeLeaf = document.createElement('div');
        probeLeaf.className = 'md-page-leaf';
        probeLeaf.style.position = 'fixed';
        probeLeaf.style.left = '-99999px';
        probeLeaf.style.top = '0';
        probeLeaf.style.width = targetW + 'px';
        probeLeaf.style.height = targetH + 'px';
        probeLeaf.style.visibility = 'hidden';
        const probeContent = document.createElement('div');
        probeContent.className = 'md-page-content';
        const probeFooter = document.createElement('div');
        probeFooter.className = 'md-page-footer';
        probeFooter.textContent = '1 / 1';
        probeLeaf.appendChild(probeContent);
        probeLeaf.appendChild(probeFooter);
        document.body.appendChild(probeLeaf);
        const contentWidth = Math.max(220, probeContent.clientWidth || (targetW - 36));
        const availHeight = Math.max(220, probeContent.clientHeight || (targetH - 76));
        document.body.removeChild(probeLeaf);

        const preparedHtml = await prepareImagesForPagination(contentHtml, contentWidth);
        const pages = paginateHtmlMobile(preparedHtml, contentWidth, availHeight);
        window.__readerState.currentPages = pages;
        const totalP = Math.max(1, pages.length);

        let startPage = 1;
        if (opts.preserveAnchor) {
          if (anchorSnippet && anchorSnippet.length >= 8) {
            const needle = anchorSnippet.slice(0, 28);
            const expectedIdx = Math.round(anchorRatio * Math.max(0, totalP - 1));
            let bestIdx = -1;
            let bestDist = Infinity;
            for (let pi = 0; pi < pages.length; pi++) {
              if (extractPlainTextMobile(pages[pi]).indexOf(needle) !== -1) {
                const dist = Math.abs(pi - expectedIdx);
                if (dist < bestDist) {
                  bestDist = dist;
                  bestIdx = pi;
                }
              }
            }
            if (bestIdx >= 0) startPage = bestIdx + 1;
            else startPage = Math.max(1, Math.min(totalP, Math.round(anchorRatio * Math.max(0, totalP - 1)) + 1));
          } else {
            startPage = Math.max(1, Math.min(totalP, Math.round(anchorRatio * Math.max(0, totalP - 1)) + 1));
          }
        } else if (opts.fromMode === 'scroll') {
          startPage = Math.max(1, Math.min(totalP, Math.round(prevScrollRatio * Math.max(0, totalP - 1)) + 1));
        } else if (!window.__readerState.initialPageApplied) {
          startPage = Math.max(1, Math.min(totalP, window.__readerState.initialPage || 1));
          window.__readerState.initialPageApplied = true;
        } else {
          startPage = Math.max(1, Math.min(totalP, window.__readerState.page || 1));
        }

        root.innerHTML =
          '<div class="rs-book-stage" id="rsStage">' +
            '<div id="rsZoomContainer">' +
              '<div id="rsHtmlBook"></div>' +
            '</div>' +
            '<div class="rs-zoom-pill" id="rsZoomPill" onclick="resetZoom()">Fit (100%) ✕</div>' +
          '</div>';

        const book = document.getElementById('rsHtmlBook');
        const leafEls = [];
        const frag = document.createDocumentFragment();
        pages.forEach((pageHtml, idx) => {
          const leaf = document.createElement('div');
          leaf.className = 'md-page-leaf';
          leaf.style.display = idx === startPage - 1 ? 'flex' : 'none';

          const content = document.createElement('div');
          content.className = 'md-page-content';
          content.innerHTML = pageHtml;

          const footer = document.createElement('div');
          footer.className = 'md-page-footer';
          footer.textContent = (idx + 1) + ' / ' + totalP;

          leaf.appendChild(content);
          leaf.appendChild(footer);
          frag.appendChild(leaf);
          leafEls.push(leaf);
        });
        book.appendChild(frag);

        const pageFlip = createRsBookCurl(book, leafEls, {
          width: targetW,
          height: targetH,
          startPage: startPage - 1,
          flippingTime: 320,
        });
        window.__pageFlip = pageFlip;

        pageFlip.on('flip', (e) => {
          window.__readerState.lastFlipTime = Date.now();
          const p = e.data + 1;
          playPaperTurnSound();
          updateScrubber(p, totalP);
          showScrubberBriefly();
        });

        attachZoomAndPanHandlers(document.getElementById('rsStage'), pageFlip);

        window.rsNextPage = () => {
          if (window.__readerState.currentZoom > 1.05 && window.resetZoom) window.resetZoom();
          pageFlip.flipNext();
          showScrubberBriefly();
        };
        window.rsPrevPage = () => {
          if (window.__readerState.currentZoom > 1.05 && window.resetZoom) window.resetZoom();
          pageFlip.flipPrev();
          showScrubberBriefly();
        };
        window.rsGoToPage = (p) => {
          pageFlip.turnToPage(Math.max(0, Math.min(totalP - 1, p - 1)));
          showScrubberBriefly();
        };

        updateScrubber(startPage, totalP);
        return;
      }

      // Continuous Scroll Mode
      root.innerHTML = '<div class="reader-body" id="rsScrollBody">' + contentHtml + '</div>';
      const scrollBody = document.getElementById('rsScrollBody');
      if (scrollBody && window.__readerState.contentWidth) {
        scrollBody.style.maxWidth = window.__readerState.contentWidth + 'px';
      }
      if (opts.fromMode === 'curl' && prevPageRatio > 0) {
        setTimeout(() => {
          const maxS = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
          window.scrollTo(0, Math.round(prevPageRatio * maxS));
        }, 50);
      } else if (!window.__readerState.initialPageApplied && window.__readerState.initialScroll > 0) {
        window.__readerState.initialPageApplied = true;
        setTimeout(() => window.scrollTo(0, window.__readerState.initialScroll), 50);
      } else {
        window.__readerState.initialPageApplied = true;
      }
      window.rsNextPage = () => {
        window.scrollBy({ top: Math.round(window.innerHeight * 0.85), behavior: 'smooth' });
      };
      window.rsPrevPage = () => {
        window.scrollBy({ top: -Math.round(window.innerHeight * 0.85), behavior: 'smooth' });
      };
      window.rsGoToPage = () => {};
      updateScrubber(1, 1);
    }

    async function renderDoc() {
      const root = document.getElementById('root');
      const mode = window.__readerState.mode;

      if (window.__pageFlip && typeof window.__pageFlip.destroy === 'function') {
        try { window.__pageFlip.destroy(); } catch (e) {}
        window.__pageFlip = null;
      }

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

          let pdf = window.__rsPdf;
          if (!pdf) {
            const pdfBytes = base64ToUint8Array(docBase64);
            let workerCode = '';
            if (pdfWorkerB64) {
              try { workerCode = atob(pdfWorkerB64); } catch (e) {}
            }
            try {
              if (workerCode && typeof Blob !== 'undefined' && typeof URL !== 'undefined' && URL.createObjectURL) {
                const blobUrl = URL.createObjectURL(new Blob([workerCode], { type: 'text/javascript' }));
                pdfLib.GlobalWorkerOptions.workerSrc = blobUrl;
                pdf = await pdfLib.getDocument({
                  data: pdfBytes,
                  isEvalSupported: false,
                }).promise;
              } else {
                throw new Error('No Blob URL');
              }
            } catch (workerErr) {
              if (workerCode && !window.pdfjsWorker) {
                try { (0, eval)(workerCode); } catch (e) {}
              }
              pdfLib.GlobalWorkerOptions.workerSrc = 'data:text/javascript,';
              pdf = await pdfLib.getDocument({
                data: base64ToUint8Array(docBase64),
                disableWorker: true,
                isEvalSupported: false,
              }).promise;
            }
            window.__rsPdf = pdf;
          }
          const totalPages = pdf.numPages;

          if (mode === 'curl') {
            root.innerHTML =
              '<div class="rs-book-stage" id="rsStage">' +
                '<div id="rsZoomContainer">' +
                  '<div id="rsBook"></div>' +
                '</div>' +
                '<div class="rs-zoom-pill" id="rsZoomPill" onclick="resetZoom()">Fit (100%) ✕</div>' +
              '</div>';

            const book = document.getElementById('rsBook');
            const p1 = await pdf.getPage(1);
            const vp1 = p1.getViewport({ scale: 1 });
            const aspect = vp1.height / vp1.width;

            const winW = window.innerWidth;
            const winH = window.innerHeight;
            let targetW = winW;
            let targetH = Math.round(targetW * aspect);
            if (targetH > winH) {
              targetH = winH;
              targetW = Math.round(targetH / aspect);
            }
            targetW = Math.max(200, targetW);
            targetH = Math.max(240, targetH);

            const wrapEls = [];
            const frag = document.createDocumentFragment();
            for (let i = 1; i <= totalPages; i++) {
              const wrap = document.createElement('div');
              wrap.className = 'page-canvas-wrap';
              wrap.style.display = 'none';

              const canvasHost = document.createElement('div');
              canvasHost.className = 'rs-canvas-host';
              canvasHost.id = 'rsPdfCanvasHost_' + i;
              canvasHost.style.width = '100%';
              canvasHost.style.height = '100%';
              canvasHost.innerHTML = '<div style="color:var(--muted); font-size:12px;">Rendering…</div>';

              wrap.appendChild(canvasHost);
              frag.appendChild(wrap);
              wrapEls.push(wrap);
            }
            book.appendChild(frag);

            const dpr = Math.min(Math.max(window.devicePixelRatio || 1.5, 1.5), 2);

            function evictDistantCanvases(centerPage) {
              for (let i = 1; i <= totalPages; i++) {
                if (Math.abs(i - centerPage) <= 4) continue;
                const host = document.getElementById('rsPdfCanvasHost_' + i);
                if (host && host.dataset.rendered === 'true') {
                  delete host.dataset.rendered;
                  host.innerHTML = '<div style="color:var(--muted); font-size:12px;">Rendering…</div>';
                }
              }
            }

            async function renderPageCanvas(pNum) {
              if (pNum < 1 || pNum > totalPages) return;
              const host = document.getElementById('rsPdfCanvasHost_' + pNum);
              if (!host || host.dataset.rendered === 'true' || host.dataset.rendered === 'loading') return;
              host.dataset.rendered = 'loading';
              try {
                const page = await pdf.getPage(pNum);
                const vpPage1 = page.getViewport({ scale: 1 });
                const pageScale = Math.min(targetW / vpPage1.width, targetH / vpPage1.height) * dpr;
                const vp = page.getViewport({ scale: pageScale });
                const canvas = document.createElement('canvas');
                canvas.width = Math.round(vp.width);
                canvas.height = Math.round(vp.height);
                canvas.style.width = '100%';
                canvas.style.height = '100%';
                canvas.style.objectFit = 'contain';
                canvas.style.display = 'block';
                const ctx = canvas.getContext('2d', { alpha: false });
                if (ctx) {
                  ctx.imageSmoothingEnabled = true;
                  ctx.imageSmoothingQuality = 'high';
                }
                await page.render({ canvasContext: ctx, viewport: vp }).promise;
                try { page.cleanup(); } catch (e) {}
                host.innerHTML = '';
                host.appendChild(canvas);
                host.dataset.rendered = 'true';
              } catch (err) {
                delete host.dataset.rendered;
                console.warn('pdf render err', err);
              }
            }

            const startPage = !window.__readerState.initialPageApplied
              ? Math.max(1, Math.min(totalPages, window.__readerState.initialPage || 1))
              : Math.max(1, Math.min(totalPages, window.__readerState.page || 1));
            window.__readerState.initialPageApplied = true;

            await renderPageCanvas(startPage);

            const pageFlip = createRsBookCurl(book, wrapEls, {
              width: targetW,
              height: targetH,
              startPage: startPage - 1,
              flippingTime: 340,
              onBeforeFlip: (toIdx) => {
                void renderPageCanvas(toIdx + 1);
              },
            });
            window.__pageFlip = pageFlip;

            // Pre-render neighbors after initial paint so Page 1 appears immediately
            let prefetchTimer = setTimeout(() => {
              if (startPage + 1 <= totalPages) void renderPageCanvas(startPage + 1);
              if (startPage - 1 >= 1) void renderPageCanvas(startPage - 1);
            }, 60);

            pageFlip.on('flip', (e) => {
              window.__readerState.lastFlipTime = Date.now();
              const p = e.data + 1;
              playPaperTurnSound();
              updateScrubber(p, totalPages);
              showScrubberBriefly();
              evictDistantCanvases(p);
              clearTimeout(prefetchTimer);
              void renderPageCanvas(p);
              prefetchTimer = setTimeout(() => {
                if (pageFlip.getState() !== 'read') return;
                if (p + 1 <= totalPages) void renderPageCanvas(p + 1);
                if (p - 1 >= 1) void renderPageCanvas(p - 1);
              }, 45);
            });

            attachZoomAndPanHandlers(document.getElementById('rsStage'), pageFlip);

            window.rsNextPage = async () => {
              if (window.__readerState.currentZoom > 1.05 && window.resetZoom) window.resetZoom();
              const nextP = Math.min(totalPages, pageFlip.getCurrentPageIndex() + 2);
              await renderPageCanvas(nextP);
              pageFlip.flipNext();
              showScrubberBriefly();
            };
            window.rsPrevPage = async () => {
              if (window.__readerState.currentZoom > 1.05 && window.resetZoom) window.resetZoom();
              const prevP = Math.max(1, pageFlip.getCurrentPageIndex());
              await renderPageCanvas(prevP);
              pageFlip.flipPrev();
              showScrubberBriefly();
            };
            let goToSeq = 0;
            window.rsGoToPage = async (p) => {
              const seq = ++goToSeq;
              const target = Math.max(1, Math.min(totalPages, p));
              evictDistantCanvases(target);
              await renderPageCanvas(target);
              if (seq !== goToSeq) return;
              pageFlip.turnToPage(target - 1);
              showScrubberBriefly();
              clearTimeout(prefetchTimer);
              prefetchTimer = setTimeout(() => {
                if (target + 1 <= totalPages) void renderPageCanvas(target + 1);
                if (target - 1 >= 1) void renderPageCanvas(target - 1);
              }, 60);
            };

            updateScrubber(startPage, totalPages);
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

            const scrollStartPage = !window.__readerState.initialPageApplied
              ? Math.max(1, Math.min(totalPages, window.__readerState.initialPage || 1))
              : Math.max(1, Math.min(totalPages, window.__readerState.page || 1));
            window.__readerState.initialPageApplied = true;
            let suppressScrollIoUntil = scrollStartPage > 1 ? Date.now() + 450 : 0;

            const leafMargin = Math.round((window.innerHeight || 900) * 1.5) + 'px';
            const io = new IntersectionObserver((entries) => {
              for (const en of entries) {
                const el = en.target;
                if (en.isIntersecting) {
                  if (!el.dataset.rendered) { el.dataset.rendered = '1'; pendingRender.add(el); }
                  if (Date.now() >= suppressScrollIoUntil) {
                    const pNum = Number(el.dataset.pageNumber);
                    updateScrubber(pNum, totalPages);
                  }
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
            updateScrubber(scrollStartPage, totalPages);
            if (scrollStartPage > 1 && placeholders[scrollStartPage - 1]) {
              setTimeout(() => placeholders[scrollStartPage - 1].scrollIntoView({ behavior: 'auto' }), 80);
            }
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
          await renderHtmlContent(clean);
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
          const sanitizer = (typeof DOMPurify !== 'undefined' ? DOMPurify : (typeof window !== 'undefined' ? window.DOMPurify : null));
          const clean = renderMathInMarkdown(rawMd || '', sanitizer);
          await renderHtmlContent(clean);
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
                '<button type="button" id="btnHtmlPreview" class="html-toggle-btn active" onclick="switchHtmlView(&quot;preview&quot;)">Preview</button>' +
                '<button type="button" id="btnHtmlCode" class="html-toggle-btn" onclick="switchHtmlView(&quot;code&quot;)">Code</button>' +
              '</div>' +
            '</div>' +
            '<div id="htmlPreviewPane">' + cleanHtml + '</div>' +
            '<div id="htmlCodePane" style="display:none;"><pre style="white-space:pre-wrap; font-family:inherit;">' + escapeHtml(rawHtml) + '</pre></div>';

          await renderHtmlContent(htmlWrapper);
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
          await renderHtmlContent(textHtml);
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
      btnPrev.onclick = (e) => {
        e.stopPropagation();
        if (window.rsPrevPage) window.rsPrevPage();
        showScrubberBriefly();
      };
    }
    if (btnNext) {
      btnNext.onclick = (e) => {
        e.stopPropagation();
        if (window.rsNextPage) window.rsNextPage();
        showScrubberBriefly();
      };
    }
    if (btnMode) {
      btnMode.onclick = (e) => {
        e.stopPropagation();
        const prevMode = window.__readerState.mode;
        window.__readerState.mode = prevMode === 'curl' ? 'scroll' : 'curl';
        if (docKind !== 'pdf' && window.__lastContentHtml) {
          void renderHtmlContent(window.__lastContentHtml, { fromMode: prevMode });
        } else {
          void renderDoc();
        }
        showScrubberBriefly();
      };
    }
    if (scrubSlider) {
      // Don't auto-hide while the user is actively touching or sliding
      scrubSlider.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        clearTimeout(hideScrubberTimer);
      });
      scrubSlider.addEventListener('touchstart', (e) => {
        e.stopPropagation();
        clearTimeout(hideScrubberTimer);
      }, { passive: true });

      scrubSlider.oninput = (e) => {
        clearTimeout(hideScrubberTimer);
        const p = Number(e.target.value);
        const total = window.__readerState.total || 1;
        const pill = document.getElementById('rsPagePill');
        const pct = Math.max(1, Math.min(100, Math.round((p / total) * 100)));
        if (pill) pill.textContent = 'Page ' + p + ' of ' + total + ' (' + pct + '%)';
        if (window.rsGoToPage) window.rsGoToPage(p);
      };

      scrubSlider.addEventListener('mouseup', (e) => {
        e.stopPropagation();
        showScrubberBriefly(5000);
      });
      scrubSlider.addEventListener('touchend', (e) => {
        e.stopPropagation();
        showScrubberBriefly(5000);
      }, { passive: true });
    }

    // Global Tap to Toggle Scrubber Bar (Google Play Books style)
    let winTouchStartX = 0;
    let winTouchStartY = 0;
    let winTouchStartTime = 0;
    let lastTouchToggleTime = 0;
    window.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        winTouchStartX = e.touches[0].clientX;
        winTouchStartY = e.touches[0].clientY;
        winTouchStartTime = Date.now();
      }
    }, { passive: true });

    window.addEventListener('touchend', (e) => {
      if (e.changedTouches.length === 1) {
        const tx = e.changedTouches[0].clientX;
        const dx = Math.abs(tx - winTouchStartX);
        const dy = Math.abs(e.changedTouches[0].clientY - winTouchStartY);
        const dt = Date.now() - winTouchStartTime;
        const inCenterZone = tx > window.innerWidth * 0.18 && tx < window.innerWidth * 0.82;
        const recentlyFlipped = Date.now() - (window.__readerState.lastFlipTime || 0) < 350;
        if (dx < 14 && dy < 14 && dt < 450 && inCenterZone && !recentlyFlipped) {
          if (!e.target.closest('#rsScrubBar, .rs-hotzone-left, .rs-hotzone-right, .rs-zoom-pill, a, button, input')) {
            lastTouchToggleTime = Date.now();
            toggleScrubber();
          }
        }
      }
    }, { passive: true });

    window.addEventListener('click', (e) => {
      if (Date.now() - lastTouchToggleTime < 500) return;
      if (Date.now() - (window.__readerState.lastFlipTime || 0) < 350) return;
      if (e.clientX <= window.innerWidth * 0.18 || e.clientX >= window.innerWidth * 0.82) return;
      if (e.target.closest('#rsScrubBar, .rs-hotzone-left, .rs-hotzone-right, .rs-zoom-pill, a, button, input')) return;
      toggleScrubber();
    });

    // Scroll progress tracking in continuous scroll mode
    let scrollSaveTimer = null;
    window.addEventListener('scroll', () => {
      if (window.__readerState.mode !== 'scroll') return;
      if (scrollSaveTimer) return;
      scrollSaveTimer = setTimeout(() => {
        scrollSaveTimer = null;
        const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
        const pct = Math.max(0, Math.min(100, Math.round((window.scrollY / maxScroll) * 100)));
        sendPosition({ scroll: Math.round(window.scrollY), percentage: pct });
      }, 350);
    }, { passive: true });

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

    // Dynamic settings listener (handles both window and document messages for Android WebView)
    function handleIncomingMessage(event) {
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (!data || !data.action) return;
        if (data.action === 'updateSettings') {
          const s = data.settings || {};
          const tc = data.themeColors;
          let needsRepaginate = false;

          if (tc) {
            const rootStyle = document.documentElement.style;
            if (tc.bg) rootStyle.setProperty('--bg', tc.bg);
            if (tc.panel) rootStyle.setProperty('--panel', tc.panel);
            if (tc.card) rootStyle.setProperty('--card', tc.card);
            if (tc.border) rootStyle.setProperty('--border', tc.border);
            if (tc.fg) rootStyle.setProperty('--fg', tc.fg);
            if (tc.muted) rootStyle.setProperty('--muted', tc.muted);
            if (tc.accent) rootStyle.setProperty('--accent', tc.accent);
            if (tc.accentFg) rootStyle.setProperty('--accent-fg', tc.accentFg);
            if (tc.pdfBg) rootStyle.setProperty('--pdf-bg', tc.pdfBg);
            if (tc.sel) rootStyle.setProperty('--sel', tc.sel);
          }

          if (s.fontSize && Number(s.fontSize) !== Number(window.__readerState.fontSize)) {
            window.__readerState.fontSize = Number(s.fontSize);
            document.body.style.fontSize = s.fontSize + 'px';
            needsRepaginate = true;
          }
          if (s.lineHeight && Number(s.lineHeight) !== Number(window.__readerState.lineHeight)) {
            window.__readerState.lineHeight = Number(s.lineHeight);
            document.body.style.lineHeight = s.lineHeight;
            needsRepaginate = true;
          }
          if (s.fontFamily && s.fontFamily !== window.__readerState.fontFamily) {
            window.__readerState.fontFamily = s.fontFamily;
            document.body.dataset.font = s.fontFamily;
            needsRepaginate = true;
          }
          if (s.textAlign && s.textAlign !== window.__readerState.textAlign) {
            window.__readerState.textAlign = s.textAlign;
            document.body.dataset.align = s.textAlign;
            needsRepaginate = true;
          }
          if (s.theme) document.body.dataset.theme = s.theme;

          if (s.nightLight !== undefined) {
            window.__readerState.nightLight = s.nightLight;
            const overlay = document.getElementById('rsNightLightOverlay');
            if (overlay) {
              overlay.style.display = s.nightLight > 0 ? 'block' : 'none';
              overlay.style.backgroundColor = 'rgba(255, 150, 10, ' + ((s.nightLight / 100) * 0.42) + ')';
            }
          }

          if (s.contentWidth && Number(s.contentWidth) !== Number(window.__readerState.contentWidth)) {
            window.__readerState.contentWidth = Number(s.contentWidth);
            const scrollBody = document.getElementById('rsScrollBody');
            if (scrollBody) scrollBody.style.maxWidth = s.contentWidth + 'px';
          }

          if (s.readingMode && s.readingMode !== window.__readerState.mode) {
            const prevMode = window.__readerState.mode;
            window.__readerState.mode = s.readingMode;
            if (docKind !== 'pdf' && window.__lastContentHtml) {
              void renderHtmlContent(window.__lastContentHtml, { fromMode: prevMode });
            } else {
              void renderDoc();
            }
          } else if (needsRepaginate && window.__readerState.mode === 'curl' && window.__lastContentHtml) {
            void renderHtmlContent(window.__lastContentHtml, { preserveAnchor: true });
          }
        } else if (data.action === 'nextPage') {
          if (window.rsNextPage) window.rsNextPage();
        } else if (data.action === 'prevPage') {
          if (window.rsPrevPage) window.rsPrevPage();
        } else if (data.action === 'goToPage') {
          if (window.rsGoToPage) window.rsGoToPage(data.page);
        }
      } catch {}
    }
    window.addEventListener('message', handleIncomingMessage);
    document.addEventListener('message', handleIncomingMessage);

    // Re-fit 3D book cleanly on orientation change / viewport resize
    let lastWinW = window.innerWidth;
    let lastWinH = window.innerHeight;
    let resizeTimer = null;
    window.addEventListener('resize', () => {
      const nw = window.innerWidth;
      const nh = window.innerHeight;
      if (Math.abs(nw - lastWinW) < 4 && Math.abs(nh - lastWinH) < 4) return;
      lastWinW = nw;
      lastWinH = nh;
      if (window.__readerState.mode !== 'curl') return;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (docKind === 'pdf' && window.__rsPdf) {
          void renderDoc();
        } else if (window.__lastContentHtml) {
          void renderHtmlContent(window.__lastContentHtml, { preserveAnchor: true });
        }
      }, 180);
    });
  </script>
</body>
</html>`;
}
