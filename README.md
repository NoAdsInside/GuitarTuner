# Guitar Tuner Chromatic

A mobile application built with React Native and Expo that provides a real-time guitar tuner. It detects the frequency of sound input via the microphone and displays the closest musical note, along with a visual indicator to help tune your instrument accurately.

## Features

*   **Real-time Frequency Detection**: Accurately detects and displays the pitch of incoming audio.
*   **Note Display**: Shows the closest musical note (e.g., A4, C#5) to the detected frequency.
*   **Visual Tuning Indicator**: An animated dot and tail visualizer helps users see if they are sharp, flat, or in tune.
*   **Neon Aesthetic**: Styled with a vibrant neon green on a dark background for a modern look.
*   **Volume Sensitivity Control**: Configured to focus on louder sounds, reducing interference from background noise.
*   **Smooth Animations**: Tuned animation parameters for a fluid user experience.

## Tech Stack

*   **React Native**: For cross-platform mobile app development.
*   **Expo**: For building and running React Native applications, including managing native modules and build processes.
*   **TypeScript**: For static typing and improved code quality.
*   **Expo Audio**: For microphone access and recording permissions.
*   **react-native-pitchy**: For real-time pitch detection.
*   **react-native-sound-level**: For monitoring input sound levels.
*   **react-native-svg**: For creating the custom frequency visualizer.
*   **Expo Router**: For file-system based routing (though minimally used in this single-view app).

## Local Development Setup

Follow these instructions to get the project running on your local machine for development and testing.

### Prerequisites

*   **Node.js**: Version 18 LTS or higher. You can download it from [nodejs.org](https://nodejs.org/).
*   **npm** (comes with Node.js) or **Yarn**: For package management.
*   **Expo CLI**: Install it globally after Node.js:
    ```bash
    npm install -g expo-cli
    ```
*   **Git**: For cloning the repository. Download from [git-scm.com](https://git-scm.com/).
*   **Expo Go app**: Install on your iOS or Android physical device (or use an emulator/simulator).

### Installation & Running

1.  **Clone the repository**:
    ```bash
    git clone <your-repository-url>
    cd guitarTuner 
    ```
    (Replace `<your-repository-url>` with the actual URL of your GitHub repository)

2.  **Install dependencies**:
    Navigate to the project directory (`guitarTuner`) and install the necessary packages.
    Using npm:
    ```bash
    npm install
    ```
    Or using Yarn:
    ```bash
    yarn install
    ```

3.  **Start the development server**:
    ```bash
    npx expo start
    ```
    This will start the Metro Bundler and display a QR code in your terminal.

4.  **Run on your device/emulator**:
    *   **On a physical device**: Open the Expo Go app on your Android or iOS device and scan the QR code from the terminal.
    *   **On an emulator/simulator**:
        *   Press `a` in the terminal to attempt to open on an Android Emulator (if configured).
        *   Press `i` in the terminal to attempt to open on an iOS Simulator (macOS only, if Xcode is configured).

The app should now be running in development mode, and any changes you make to the code will automatically reload the app.

## Project Structure

*   `app/`: Contains the main application code, using Expo Router for file-based routing.
    *   `index.tsx`: The main screen of the application.
    *   `FrequencyVisualizer.tsx`: The custom component for displaying the tuning indicator.
    *   `_layout.tsx`: Defines the root layout for Expo Router.
*   `assets/`: Contains static assets like images and fonts.
    *   `images/`: Specifically for icon files, splash screen, etc.
*   `app.json`: Expo configuration file for project metadata, build settings, plugins, etc.
*   `package.json`: Lists project dependencies and scripts.

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change. Feel free to fork, copy, clone and use this in any way you wish. You don't have to credit, I don't mind, this is for you. Most of it was written with the help of AI as an experiment in building simple things, fast and giving them to the community for free. 

---
