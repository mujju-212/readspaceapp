import React, { useRef, useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { MobileDoc, ReaderSettings } from '../types';
import { THEMES } from '../theme/colors';

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

export const HybridReader: React.FC<HybridReaderProps> = ({ doc, settings, onPositionChange }) => {
  const webViewRef = useRef<any>(null);
  const iframeRef = useRef<any>(null);
  const themeColors = THEMES[settings.theme];

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

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=3.0, user-scalable=yes">
  <title>${doc.name}</title>
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
      height: auto;
    }

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

    /* Document Reader (Markdown / Text / DOCX / HTML) */
    .reader-body {
      padding: 20px 18px 80px;
      max-width: 760px;
      margin: 0 auto;
    }
    .reader-body h1 { font-size: 1.6em; margin: 1em 0 0.5em; }
    .reader-body h2 { font-size: 1.35em; margin: 1em 0 0.4em; border-bottom: 1px solid var(--border); padding-bottom: 4px; }
    .reader-body p { margin: 0.8em 0; }
    .reader-body pre {
      background: rgba(150, 150, 150, 0.1);
      padding: 14px;
      border-radius: 8px;
      overflow-x: auto;
      font-size: 0.95em;
    }
    .reader-body table { width: 100%; border-collapse: collapse; margin: 1em 0; }
    .reader-body th, .reader-body td { border: 1px solid var(--border); padding: 6px 10px; }
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

    function decodeText(base64) {
      if (!base64) return '';
      try {
        return atob(base64);
      } catch (e) {
        return base64; // already plaintext
      }
    }

    function escapeHtml(str) {
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    async function renderDoc() {
      const root = document.getElementById('root');

      try {
        if (docKind === 'pdf') {
          root.innerHTML = '<div class="pdf-container" id="pdfRoot"></div>';
          const container = document.getElementById('pdfRoot');
          
          if (!docBase64) {
            container.innerHTML = '<div style="padding:20px;">PDF loading requires file data. Please re-open.</div>';
            return;
          }

          if (typeof pdfjsLib !== 'undefined') {
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            const pdfData = base64ToUint8Array(docBase64);
            const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;

            for (let i = 1; i <= pdf.numPages; i++) {
              const page = await pdf.getPage(i);
              const scale = 1.5;
              const viewport = page.getViewport({ scale });

              const pageDiv = document.createElement('div');
              pageDiv.className = 'pdf-page';
              const canvas = document.createElement('canvas');
              const context = canvas.getContext('2d');
              canvas.height = viewport.height;
              canvas.width = viewport.width;

              await page.render({ canvasContext: context, viewport: viewport }).promise;
              pageDiv.appendChild(canvas);
              container.appendChild(pageDiv);
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
          const audioUrl = docBase64 ? 'data:audio/mpeg;base64,' + docBase64 : docUri;
          root.innerHTML = \`
            <div class="audio-wrap">
              <div class="audio-card">
                <div class="audio-disc">🎵</div>
                <h2 class="audio-title">\${docName}</h2>
                <div class="audio-progress">
                  <div class="audio-progress-fill" id="audioFill"></div>
                </div>
                <div class="audio-controls">
                  <button class="btn" onclick="skipAudio(-10)">↺ 10s</button>
                  <button class="audio-play-btn" id="playBtn" onclick="toggleAudio()">▶</button>
                  <button class="btn" onclick="skipAudio(10)">10s ↻</button>
                </div>
                <audio id="audioEl" src="\${audioUrl}"></audio>
              </div>
            </div>
          \`;

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
          const videoUrl = docBase64 ? 'data:video/mp4;base64,' + docBase64 : docUri;
          root.innerHTML = \`
            <div class="video-wrap">
              <video src="\${videoUrl}" controls playsinline autoplay></video>
            </div>
          \`;
        } else if (docKind === 'docx') {
          if (!docBase64) throw new Error('No DOCX data');
          const res = await mammoth.convertToHtml({ arrayBuffer: base64ToUint8Array(docBase64) });
          root.innerHTML = '<div class="reader-body">' + DOMPurify.sanitize(res.value) + '</div>';
        } else if (docKind === 'markdown') {
          const rawText = decodeText(docBase64);
          const html = marked.parse(rawText);
          root.innerHTML = '<div class="reader-body">' + DOMPurify.sanitize(html) + '</div>';
        } else {
          // Plain Text or Notes
          const rawText = decodeText(docBase64);
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
</html>
  `;

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
});
