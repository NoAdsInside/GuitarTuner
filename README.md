# Guitar Tuner Chromatic

A mobile application built with **bare React Native** (Android) that provides a real-time guitar tuner. It detects the frequency of sound input via the microphone and displays the closest musical note, along with a visual indicator to help tune your instrument accurately.

## Features

*   **Real-time Frequency Detection**: Accurately detects and displays the pitch of incoming audio.
*   **Note Display**: Shows the closest musical note (e.g., A4, C#5) to the detected frequency.
*   **Visual Tuning Indicator**: An animated dot and tail visualizer helps users see if they are sharp, flat, or in tune.
*   **Neon Aesthetic**: Styled with a vibrant neon green on a dark background for a modern look.
*   **Volume Sensitivity Control**: Configured to focus on louder sounds, reducing interference from background noise.
*   **Smooth Animations**: Tuned animation parameters for a fluid user experience.

## Tech Stack

*   **React Native** (0.86, New Architecture): Bare workflow, Android-only, targeting **Android 16 / API 36** (mandatory edge-to-edge display). Builds are fully local via Gradle — no Expo and no cloud build service.
*   **TypeScript**: For static typing and improved code quality.
*   **PermissionsAndroid** (core React Native): For microphone recording permission.
*   **react-native-pitchy**: Native (Kotlin/C++) real-time pitch detection — the sole microphone client.
*   **react-native-svg**: For the custom frequency visualizer.
*   **@react-native-community/slider**: For the settings sliders.
*   **react-native-safe-area-context**: Safe-area insets.

## Local Development Setup

Follow these instructions to get the project running on your local machine for development and testing.

### Prerequisites

*   **Node.js**: Version 18 LTS or higher. Download from [nodejs.org](https://nodejs.org/).
*   **npm** (comes with Node.js): For package management.
*   **JDK 17**: Required by the Android Gradle plugin.
*   **Android Studio + Android SDK**: Install the Android SDK, platform tools, and an emulator (or use a physical device). Set the `ANDROID_HOME` environment variable (e.g. `~/Library/Android/sdk` on macOS) or add a `android/local.properties` with `sdk.dir=...`.
*   **A physical Android device or emulator with a microphone**: Pitch detection needs real mic input.
*   **Git**: For cloning the repository.

> This is a bare React Native app — there is **no Expo Go**. You run it as a locally built native app.

### Installation & Running

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/NoAdsInside/GuitarTuner.git
    cd guitarTuner
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```

3.  **Start the Metro bundler** (in one terminal):
    ```bash
    npm start
    ```

4.  **Build and run on a device/emulator** (in another terminal, with a device connected or an emulator running):
    ```bash
    npm run android
    ```
    This builds the app with Gradle, installs it, and launches it. Grant the microphone permission when prompted. Subsequent JS changes hot-reload via Metro.

### Other useful commands

```bash
npm run lint                             # eslint .
npx tsc --noEmit                         # TypeScript typecheck
cd android && ./gradlew assembleDebug    # build a debug APK locally
cd android && ./gradlew assembleRelease  # build a standalone release APK (runs without Metro)
```

There is no test suite configured.

## Standalone build (run on a phone without a computer)

`npm run android` installs a **debug** build, which does **not** contain the JavaScript — it loads it at runtime from the Metro dev server on `localhost:8081`. On a phone that isn't tethered to your machine with Metro running, that fails with *"Unable to load script / Could not connect to development server."*

For an app that runs on its own, build a **release** APK — it bundles the JS inside the APK, so no computer or Metro is needed.

### 1. Build the release APK

```bash
cd android && ./gradlew assembleRelease
```

The APK is written to:

```
android/app/build/outputs/apk/release/app-release.apk
```

### 2. Get it onto your phone

**Option A — install directly over USB (recommended):**

1. On the phone, enable **Developer options** (Settings → About phone → tap *Build number* 7 times), then turn on **USB debugging** (Settings → System → Developer options).
2. Connect the phone via USB and tap **Allow** on the "Allow USB debugging?" prompt.
3. Confirm the device is visible and install:
   ```bash
   adb devices                       # should list your device as "device" (not "unauthorized")
   adb install -r android/app/build/outputs/apk/release/app-release.apk
   ```
   (`-r` reinstalls over an existing copy. If both a phone and an emulator are connected, add `-d` to target the USB device, or `-s <serial>` to pick one.)

> `adb` lives in `$ANDROID_HOME/platform-tools/adb` if it isn't on your `PATH`. Note: the phone's macOS **file-transfer (MTP)** mode is *not* what enables `adb` — **USB debugging** is. Finder does not show Android devices.

**Option B — copy the file:** send `app-release.apk` to the phone by any means (Google Drive, email, AirDroid, etc.) and open it on the device to install. You'll need to allow *"install from unknown sources"* for the app you opened it from.

### 3. Launch it

Open **guitarTuner** from the app drawer and grant the microphone permission on first launch. To launch from the CLI instead:

```bash
adb shell monkey -p com.cptvitruvian.guitarTuner 1
```

### Signing note

The `release` build is signed with the **debug keystore** by default (see `android/app/build.gradle`), which is all you need for local testing and sideloading onto your own device. If you want to distribute the app more widely, sign it with your own release keystore in whatever way suits you — that's outside the scope of this README.

## Project Structure

*   `index.js`: App entry point — registers the root component (`main`) with `AppRegistry`, wrapped in `SafeAreaProvider`.
*   `app/`: Application code (a single screen).
    *   `index.tsx`: The main screen — owns the audio lifecycle, permission handling, and frequency↔note logic.
    *   `FrequencyVisualizer.tsx`: The custom SVG component for the tuning indicator.
    *   `SettingsScreen.tsx`: The settings modal body (noise threshold + visualizer sensitivity sliders).
*   `android/`: Native Android Gradle project (plain React Native, checked in).
*   `assets/`: Static assets (images, fonts).
*   `metro.config.js` / `babel.config.js`: Metro bundler and Babel configuration.
*   `package.json`: Dependencies and scripts.

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change. Feel free to fork, copy, clone and use this in any way you wish. You don't have to credit, I don't mind, this is for you. Most of it was written with the help of AI as an experiment in building simple things, fast and giving them to the community for free.

---
