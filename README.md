# ReadSpace Mobile (Android Expo App) 📱

A native Android mobile application built with **React Native & Expo SDK 52** for **ReadSpace**, supporting high-fidelity offline document reading, rich media playback, and backend Google Drive synchronization.

---

## 🚀 Features

- **Multi-Format Document Support**:
  - **PDF**: Smooth continuous scrolling, zoom centering, page jump, and reading position restoration.
  - **PPTX**: Interactive slide deck presentation viewer with slide navigation and presenter notes.
  - **DOCX**: Rich typographic document rendering.
  - **Markdown & Plain Text**: Full GitHub-Flavored Markdown preview and code styling.
  - **Audio**: Interactive vinyl disc turntable player, audio waveform equalizer, seeking, and background audio support.
  - **Video**: Native-style inline video player with scrubber, controls, and volume.
- **Offline First**:
  - Native document picker (`expo-document-picker`) to open files directly from your phone's storage / Downloads.
  - Auto-caching and persistence with `@react-native-async-storage/async-storage`.
  - Bookmarks and reading position saved per document.
- **Cloud & Google Drive Sync**:
  - Connects to the ReadSpace backend (`/api/*`).
  - Browse Google Drive folders and download files directly into local phone storage.
- **Ice Blue Design System**:
  - 4 built-in curated color themes: **Ice Blue** (Signature), Light, Dark, and Sepia.
  - Native bottom tab navigation: **Home**, **Library**, **Activity**, and **Settings**.

---

## 📱 How to Run & Test on Android

### 1. Start the Development Server
From the `readspace_app` folder, run:

```bash
cd readspace_app
npm start
# or
npx expo start
```

### 2. Open on your Android Phone
1. Download **Expo Go** from Google Play Store on your Android phone.
2. Ensure your phone and your computer are on the same Wi-Fi network.
3. Open the **Expo Go** app and scan the **QR code** displayed in your terminal.
4. The ReadSpace app will bundle and open natively on your phone!

---

## ⚙️ Connecting to the ReadSpace Backend

By default, the app can read any local file offline without a server. To test Google Drive and cloud sync:
1. Start the ReadSpace backend from the root directory:
   ```bash
   node server/index.mjs
   ```
2. In the mobile app, go to **Settings** → **Backend Server URL**.
3. Enter your computer's local Wi-Fi IP address (e.g. `http://192.168.1.100:5173` or your deployed URL).
4. Tap **Test Connection** to verify connectivity.

---

## 📦 Building a Standalone Android APK

To build a standalone installable APK (`.apk`) file that anyone can install directly on Android without Expo Go:

```bash
# Install EAS CLI
npm install -g eas-cli

# Login to your Expo account
eas login

# Build Android APK
eas build -p android --profile preview
```
