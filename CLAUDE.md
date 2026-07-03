# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

A real-time chromatic guitar tuner built with **bare React Native** (TypeScript), **Android-only**. (It was migrated off Expo — no `expo`, `expo-router`, or EAS. Native audio stays in `react-native-pitchy`, which is itself a Kotlin/C++ native module.) The microphone feeds `react-native-pitchy`, which detects pitch and gates on volume internally (`minVolume`). The detected frequency is mapped to the nearest musical note and rendered with an animated SVG visualizer showing how sharp/flat the input is. Styled with a neon-green-on-black "terminal/Matrix" aesthetic (`#39FF14` on `#0D0D0D`).

> **Mic access:** Pitchy must be the *only* microphone client. `react-native-sound-level` is still in `package.json` but is intentionally unused — running it alongside Pitchy makes two `AudioSource.MIC` recorders contend for the device mic on Android, which fails. Don't reintroduce a second recorder.

## Commands

```bash
npm install              # install dependencies
npm start                # react-native start — Metro bundler (dev)
npm run android          # react-native run-android — build + install on device/emulator
npm run lint             # eslint . (flat config: @eslint/js + typescript-eslint)
npx tsc --noEmit         # TypeScript typecheck
cd android && ./gradlew assembleDebug   # local debug APK
cd android && ./gradlew bundleRelease   # local release .aab (sign with a real keystore)
```

There is no test suite or test runner configured.

**Native code is checked in** (`android/` is a plain React Native Gradle project — Expo autolinking/wrappers were removed; autolinking is via `@react-native-community/cli`). Builds are **fully local Gradle** — no EAS, no cloud queue. Microphone permission is required — pitch detection only works on a physical device or emulator with mic access. New Architecture is enabled (`newArchEnabled=true`).

### Running on a device — debug vs. release (important)

- **Debug** (`npm run android` / `assembleDebug`) does **not** bundle the JS — it loads it from the Metro dev server on `localhost:8081`. On a phone that isn't tethered with Metro running (including one where `adb reverse tcp:8081 tcp:8081` hasn't been set up), it fails with *"Unable to load script / Could not connect to development server."* This is the usual "it crashes on my phone" report — it's not a crash. Diagnose via `adb logcat` and look for `Could not connect to packager`.
- **Release** (`./gradlew assembleRelease` → `android/app/build/outputs/apk/release/app-release.apk`) **bundles the JS** and runs standalone with no computer. Use this to put the app on a phone. Install with `adb install -r <apk>`. `adb` requires **USB debugging** enabled (MTP/file-transfer mode is not enough).
- The `release` build is currently signed with the **debug keystore** (see `android/app/build.gradle` `signingConfig = signingConfigs.debug`) — fine for sideloading, not acceptable for the Play Store. See `README.md` for the standalone-build walkthrough.

### Native build notes / gotchas

- **Version pins come from React Native 0.79**: Gradle 8.13 (wrapper), AGP 8.8.2 and Kotlin 2.0.21 (from `@react-native/gradle-plugin`'s version catalog). Do **not** bump to Gradle 9 — AGP 8.8.2 requires Gradle 8.x. The clean way to move these is a React Native upgrade.
- `android/settings.gradle` must include `@react-native/gradle-plugin` in **both** `pluginManagement { includeBuild(...) }` **and** a top-level `includeBuild(...)`; the top-level one supplies the versionless `classpath(...)` plugin versions transitively. Dropping it → `Could not find ...:.` failures. `android/build.gradle` also declares the `ext { …SdkVersion, ndkVersion, kotlinVersion }` block that Expo's root plugin used to provide.
- Our Gradle files use the modern `propName = value` assignment syntax. Any remaining "Deprecated Gradle features / incompatible with Gradle 9.0" warnings come from third-party libs' `build.gradle` under `node_modules` (pitchy, slider, svg, safe-area-context) — not editable by us, benign, resolved when those libs update.

## Architecture

The app is a single screen. The root entry is **`index.js`** at the project root, which registers the `main` component (wrapped in `SafeAreaProvider`) via `AppRegistry`. The screen and its components live in `app/` (a plain directory now — no Expo Router).

- **`index.js`** (project root) — RN entry point; `AppRegistry.registerComponent('main', …)`, wraps `App` in `SafeAreaProvider`.
- **`app/index.tsx`** — the single screen and the heart of the app. Default-exported as `App`. Owns all audio lifecycle and state. Renders the visualizer and a settings `Modal`.
- **`app/FrequencyVisualizer.tsx`** — pure presentational SVG component. Animated indicator dot + falling "tail" trail. No audio logic.
- **`app/SettingsScreen.tsx`** — controlled component (props only, no own state) with two sliders, shown inside the modal in `index.tsx`.

### Audio pipeline (`index.tsx`) — the part to understand before editing

Ordering and lifecycle matter here. Key points:

1. **Permission before init.** `ensureMicPermission` uses core RN `PermissionsAndroid` (`check`/`request` on `RECORD_AUDIO`; a `NEVER_ASK_AGAIN` result routes the user to Settings). One effect requests mic permission on mount (and re-checks on app foreground) and flips `hasPermission`. Pitchy is only initialized *after* that, because `Pitchy.init()` constructs the native `AudioRecord` immediately — if it runs before permission is granted, the recorder is built dead and `Pitchy.start()` fails.
2. **Init/start effect keyed on `[hasPermission, noiseThreshold]`.** Pitchy's noise gate (`minVolume`) is fixed at init time, so changing `noiseThreshold` tears down and re-inits Pitchy. The effect stops any prior session first (via `pitchyStartedRef`) so a native recorder is never leaked; cleanup stops Pitchy and clears the reading.
3. **Noise threshold is committed on slide-complete, not on drag.** `SettingsScreen` keeps a local display value (`onValueChange`) and only pushes `setNoiseThreshold` on `onSlidingComplete` — otherwise every drag tick would restart the recorder.
4. **Gating is native.** Pitchy only emits pitches above `minVolume`, so the JS listener just filters to the guitar range (`MIN_GUITAR_FREQUENCY`/`MAX_GUITAR_FREQUENCY`, 30–1300 Hz). There is no separate volume reading; the visualizer's `currentVolume` prop is passed a constant `0` (a detected frequency already implies "audible"). `frequencyToNoteRef` mirrors the latest `frequencyToNote` so the once-registered listener always classifies with current settings.

### Frequency ↔ note model

- `noteFrequencyTable` in `index.tsx` is the source of truth: 12 notes × octaves 0–5.
- **Two derived frequency sets, deliberately separate:**
  - `currentDetailedNoteFrequencies` — rounded by `visualizerSensitivity`; used only to **classify** an incoming pitch into a note "bin" (`frequencyToNote`).
  - `standardNoteFrequencies` (`getStandardNoteFrequencies`) — true unrounded values; used as the **target** the visualizer measures deviation against.
  - Keep this split: sensitivity must affect display scaling, not the true target pitch.

### Visualizer specifics (`FrequencyVisualizer.tsx`)

- Dot X position = deviation of (smoothed) current frequency from target, clamped to ±`visualizerSensitivity` Hz, mapped across the width. Center line = in tune.
- Exponential smoothing on frequency (`SMOOTHING_ALPHA`); spring animation for the dot (`useNativeDriver: false` — required because it animates the SVG `cx` prop).
- The tail is a `requestAnimationFrame` loop aging points downward; tunable constants (`MAX_TAIL_POINTS`, `TAIL_FALL_SPEED`, glow factors, `INITIAL_SETTLING_DELAY`) are grouped at the top of the file.
