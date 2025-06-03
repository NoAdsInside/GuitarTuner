import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, StyleSheet, Button, Alert, Text, TouchableOpacity, Platform, LayoutChangeEvent, SafeAreaView, Modal, Pressable } from 'react-native';
import { AudioModule } from 'expo-audio'; // For permissions
import Pitchy, { PitchyConfig, PitchyEventCallback } from 'react-native-pitchy';
import RNSoundLevel from 'react-native-sound-level'; // Import RNSoundLevel
import FrequencyVisualizer from './FrequencyVisualizer'; // Import the new component
import SettingsScreen from './SettingsScreen'; // Import SettingsScreen

const allPossibleNotes = ["C", "C♯/D♭", "D", "D♯/E♭", "E", "F", "F♯/G♭", "G", "G♯/A♭", "A", "A♯/B♭", "B"];
const noteBaseNames = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"]; // For naming convention

const NEON_GREEN = '#39FF14'; // For Matrix/Fallout theme

// Frequencies from the provided table up to Octave 5
const noteFrequencyTable = [
  // Note, Octave 0, Octave 1, Octave 2, Octave 3, Octave 4, Octave 5
  [16.35, 32.70, 65.41, 130.81, 261.63, 523.25], // C
  [17.32, 34.65, 69.30, 138.59, 277.18, 554.37], // C#
  [18.35, 36.71, 73.42, 146.83, 293.66, 587.33], // D
  [19.45, 38.89, 77.78, 155.56, 311.13, 622.25], // D#
  [20.60, 41.20, 82.41, 164.81, 329.63, 659.25], // E
  [21.83, 43.65, 87.31, 174.61, 349.23, 698.46], // F
  [23.12, 46.25, 92.50, 185.00, 369.99, 739.99], // F#
  [24.50, 49.00, 98.00, 196.00, 392.00, 783.99], // G
  [25.96, 51.91, 103.83, 207.65, 415.30, 830.61], // G#
  [27.50, 55.00, 110.00, 220.00, 440.00, 880.00], // A
  [29.14, 58.27, 116.54, 233.08, 466.16, 932.33], // A#
  [30.87, 61.74, 123.47, 246.94, 493.88, 987.77], // B
];

// Interface for detailed note structure
interface DetailedNote {
  noteNameWithOctave: string;
  frequency: number;
}

// Original detailedNoteFrequencies generation logic is removed from here
// It will be handled by a useEffect hook based on visualizerSensitivity

const MIN_GUITAR_FREQUENCY = 30; // Minimum frequency to consider for guitar tuning (approx Low B0)
const MAX_GUITAR_FREQUENCY = 1300; // Maximum frequency to consider for guitar tuning

// Create a memoized list of standard (unrounded) note frequencies
// This ensures the target frequencies for notes are their true musical values,
// unaffected by the visualizerSensitivity setting which only controls display scaling.
const getStandardNoteFrequencies = (): DetailedNote[] => {
  const notes: DetailedNote[] = [];
  noteFrequencyTable.forEach((octaveFrequencies, noteIndex) => {
    const baseName = noteBaseNames[noteIndex];
    octaveFrequencies.forEach((freq, octave) => {
      notes.push({
        noteNameWithOctave: `${baseName}${octave}`,
        frequency: freq, // Use the direct, unrounded frequency
      });
    });
  });
  return notes;
};

export default function App() {
  const [currentFrequency, setCurrentFrequency] = useState<number | null>(null);
  const [detectedNote, setDetectedNote] = useState<string | null>(null);
  const [targetFrequency, setTargetFrequency] = useState<number | null>(null); // For the visualizer
  const [visualizerLayout, setVisualizerLayout] = useState<{width: number, height: number} | null>(null);
  const [volume, setVolume] = useState<number | null>(null);
  const volumeRef = useRef<number | null>(null); // Ref to hold the latest volume for callbacks
  const pitchyStartedRef = useRef(false); // To track if Pitchy started
  const soundLevelStartedRef = useRef(false); // To track if RNSoundLevel started

  // Settings State
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);
  const [noiseThreshold, setNoiseThreshold] = useState(-45); // Default noise threshold
  const [visualizerSensitivity, setVisualizerSensitivity] = useState(5); // Default visualizer sensitivity

  // Ref for noiseThreshold to be used in callbacks within useEffect
  const noiseThresholdRef = useRef(noiseThreshold);
  useEffect(() => {
      noiseThresholdRef.current = noiseThreshold;
  }, [noiseThreshold]);

  // State for sensitivity-adjusted note frequencies
  const [currentDetailedNoteFrequencies, setCurrentDetailedNoteFrequencies] = useState<DetailedNote[]>([]);

  // Effect to recalculate detailedNoteFrequencies when visualizerSensitivity changes
  useEffect(() => {
    const newDetailedNotes: DetailedNote[] = [];
    const sensitivity = Math.max(0.01, visualizerSensitivity);
    noteFrequencyTable.forEach((octaveFrequencies, noteIndex) => {
      const baseName = noteBaseNames[noteIndex];
      octaveFrequencies.forEach((freq, octave) => {
        const roundedFreq = Math.round(freq / sensitivity) * sensitivity;
        newDetailedNotes.push({
          noteNameWithOctave: `${baseName}${octave}`,
          frequency: roundedFreq,
        });
      });
    });
    setCurrentDetailedNoteFrequencies(newDetailedNotes);
  }, [visualizerSensitivity]);

  // Callback to convert frequency to note using currentDetailedNoteFrequencies
  // currentDetailedNoteFrequencies uses sensitivity-rounded frequencies to determine note "bins".
  const frequencyToNote = useCallback((frequency: number): string | null => {
    if (frequency <= 0 || currentDetailedNoteFrequencies.length === 0) return null;

    let closestNote: string | null = null;
    let minDifference = Infinity;

    for (const noteInfo of currentDetailedNoteFrequencies) {
      const difference = Math.abs(noteInfo.frequency - frequency);
      if (difference < minDifference) {
        minDifference = difference;
        closestNote = noteInfo.noteNameWithOctave;
      }
    }
    return closestNote;
  }, [currentDetailedNoteFrequencies]);

  // Ref to hold the latest frequencyToNote callback
  const frequencyToNoteRef = useRef(frequencyToNote);
  useEffect(() => {
    frequencyToNoteRef.current = frequencyToNote;
  }, [frequencyToNote]);

  // Effect to update targetFrequency when detectedNote changes
  // It uses standardNoteFrequencies to get the true target for the visualizer.
  const standardNoteFrequencies = useMemo(() => getStandardNoteFrequencies(), []);

  useEffect(() => {
    if (detectedNote) {
      const noteInfo = standardNoteFrequencies.find(nf => nf.noteNameWithOctave === detectedNote);
      if (noteInfo) {
        setTargetFrequency(noteInfo.frequency); // This frequency is now the STANDARD, UNROUNDED one
      } else {
        console.warn(`Detected note ${detectedNote} not found in standardNoteFrequencies.`);
        setTargetFrequency(null); 
      }
    } else {
      setTargetFrequency(null);
    }
  }, [detectedNote, standardNoteFrequencies]);

  // Effect for one-time Pitchy initialization
  const [isPitchyInitialized, setIsPitchyInitialized] = useState(false); // New state for init tracking
  useEffect(() => {
    console.log('Attempting Pitchy.init()...');
    const pitchyConfig: PitchyConfig = { minVolume: -50 }; 
    try {
      const initPromise = Pitchy.init(pitchyConfig);
      if (initPromise && typeof initPromise.then === 'function') {
        initPromise
          .then(() => {
            console.log('Pitchy.init() successful.');
            setIsPitchyInitialized(true);
          })
          .catch((e: any) => {
            console.error('Pitchy.init() failed (promise catch):', e);
            setIsPitchyInitialized(false); // Explicitly set to false on error
          });
      } else {
        setIsPitchyInitialized(true); // Optimistic if no promise, but check lib behavior
      }
    } catch (e: any) {
      console.error('Error calling Pitchy.init() (try-catch block):', e);
      setIsPitchyInitialized(false);
    }
    // No cleanup needed for init itself, but if it had a specific deinit, it would go here.
  }, []);

  // Main audio processing effect
  useEffect(() => {
    let isMounted = true;
    let pitchSubscription: { remove: () => void } | null = null;

    // Guard: Do not proceed if Pitchy is not yet initialized.
    if (!isPitchyInitialized) {
      console.log('Main audio effect: Pitchy not initialized, skipping setup.');
      return; // Wait for Pitchy to be initialized
    }

    const setupAudioProcessing = async () => {
      // Artificial delay to allow native modules to settle after potential stop from cleanup
      await new Promise(resolve => setTimeout(resolve, 250)); 
      if (!isMounted) {
          // console.log("setupAudioProcessing: Unmounted during initial delay. Aborting setup.");
          return;
      }
      // console.log('setupAudioProcessing: Starting audio services after delay.');

      // pitchyStartedRef.current = false; // These are set after conditional stops
      // soundLevelStartedRef.current = false;

      try {
        // console.log('setupAudioProcessing: Pre-emptive stop of audio services...');
        if (pitchyStartedRef.current) {
          try {
            const stopPitchyPromise = Pitchy.stop();
            if (stopPitchyPromise && typeof stopPitchyPromise.then === 'function') {
              await stopPitchyPromise;

            } else {
              // console.warn('setupAudioProcessing: Pitchy.stop() did not return a promise (pre-emptive).');
            }
          } catch (e:any) {
            // console.warn('setupAudioProcessing: Error during pre-emptive Pitchy.stop() (when ref was true):', e);
          }
        } else {
          // console.log('setupAudioProcessing: Pre-emptive Pitchy.stop() skipped as pitchyStartedRef was false.');
        }
        pitchyStartedRef.current = false; // Reset ref before new start attempt

        if (soundLevelStartedRef.current) {
          RNSoundLevel.stop();
          // console.log('setupAudioProcessing: Pre-emptive RNSoundLevel.stop() called.');
        } else {
          // console.log('setupAudioProcessing: Pre-emptive RNSoundLevel.stop() skipped as soundLevelStartedRef was false.');
        }
        soundLevelStartedRef.current = false; // Reset ref before new start attempt
        // console.log('setupAudioProcessing: Pre-emptive stop completed.');

        if (!isMounted) return;

        const permissionStatus = await AudioModule.requestRecordingPermissionsAsync();
        if (!permissionStatus.granted) {
          if (isMounted) Alert.alert('Permission Denied', 'Microphone permission is required.');
          return;
        }
        // console.log('setupAudioProcessing: Microphone permissions granted.');

        if (!isMounted) return;

        RNSoundLevel.onNewFrame = (data) => {
          if (isMounted) {
            const newVolume = data.value;
            // console.log(`RNSoundLevel Frame: Volume=${newVolume.toFixed(2)}, NoiseThreshold=${noiseThresholdRef.current.toFixed(2)}`); // DEBUG LOG
            setVolume(newVolume);
            volumeRef.current = newVolume;
            if (newVolume < noiseThresholdRef.current) {
              // console.log('RNSoundLevel: Volume below threshold, clearing frequency/note.'); // DEBUG LOG
              setCurrentFrequency(null);
              setDetectedNote(null);
            }
          }
        };
        RNSoundLevel.start();
        soundLevelStartedRef.current = true;
        // console.log('setupAudioProcessing: RNSoundLevel started.');

        if (!isMounted) return;

        try {
          // console.log('setupAudioProcessing: Attempting Pitchy.start()...');
          const startPromise = Pitchy.start();
          if (startPromise && typeof startPromise.then === 'function') {
            await startPromise;
            // console.log('setupAudioProcessing: Pitchy.start() resolved.');
          } else {
            // console.warn('setupAudioProcessing: Pitchy.start() did not return a promise (assuming sync success).');
            // If sync and fails, it should throw, to be caught by the catch block.
          }
          pitchyStartedRef.current = true; // Mark as started

          if (!isMounted) { // Check again after await/potential sync operation
            if (pitchyStartedRef.current) { // If we thought it started
                try { Pitchy.stop(); } catch (e) { /* console.warn("Error stopping Pitchy due to unmount after start", e); */ }
            }
            pitchyStartedRef.current = false;
            return; // Important: exit if unmounted
          }

          // Add listener only after successful start and if still mounted
          pitchSubscription = Pitchy.addListener((data) => {
            // console.log(`Pitchy Data: Pitch=${data?.pitch?.toFixed(2)}, VolumeRef=${volumeRef.current?.toFixed(2)}, NoiseThreshold=${noiseThresholdRef.current.toFixed(2)}`); // DEBUG LOG
            if (isMounted && volumeRef.current !== null && volumeRef.current >= noiseThresholdRef.current) {
              if (data && data.pitch != null) {
                if (data.pitch >= MIN_GUITAR_FREQUENCY && data.pitch <= MAX_GUITAR_FREQUENCY) {
                  // console.log('Pitchy: Valid pitch detected and above threshold.'); // DEBUG LOG
                  setCurrentFrequency(data.pitch);
                  setDetectedNote(frequencyToNoteRef.current(data.pitch)); // Use ref here
                } else {
                  // console.log('Pitchy: Pitch out of guitar range.'); // DEBUG LOG
                  setCurrentFrequency(null);
                  setDetectedNote(null);
                }
              } 
            } 
          });
          // console.log('setupAudioProcessing: Pitchy listener added AFTER Pitchy.start().');
        
          // if (isMounted) console.log('setupAudioProcessing: Pitch detection started successfully.');

        } catch (error: any) {
          // console.error('setupAudioProcessing: Error during Pitchy.start() or addListener():', error);
          if (isMounted) Alert.alert('Audio Processing Error', 'Could not start Pitchy: ' + error.message);
          
          // Cleanup if error occurred
          if (pitchSubscription) { // If listener was somehow assigned before error
            pitchSubscription.remove();
            pitchSubscription = null;
          }
          if (pitchyStartedRef.current) { // If start was marked true but something after failed
            try { Pitchy.stop(); } catch (e) { /* console.warn("Error stopping Pitchy in start/addListener error handler", e); */ }
          }
          pitchyStartedRef.current = false;
          
          // Also stop RNSoundLevel if Pitchy setup fails
          if (soundLevelStartedRef.current) {
              RNSoundLevel.stop();
              soundLevelStartedRef.current = false;
          }
          return; // Exit setupAudioProcessing
        }
        
      } catch (error: any) {
        // console.error('setupAudioProcessing: Outer error - Error setting up or starting audio processing:', error);
        if (isMounted) Alert.alert('Audio Processing Error', 'Could not start audio processing: ' + error.message);
      }
    };

    if (isMounted) {
      setupAudioProcessing();
    }

    return () => {
      isMounted = false;
      // console.log('Cleaning up audio processing (main effect)...');
      if (pitchSubscription) {
        pitchSubscription.remove();
        pitchSubscription = null;
        // console.log('Pitch listener removed.');
      }
      
      if (pitchyStartedRef.current) {
        // console.log('Attempting to stop Pitchy in cleanup (ref was true)...');
        try {
          const stopPromise = Pitchy.stop();
          if (stopPromise && typeof stopPromise.then === 'function') {
            stopPromise
              // .then(() => console.log('Pitchy stopped (main effect cleanup promise).'))
              .catch((e: any) => { /* console.error('Error stopping Pitchy (main effect cleanup promise):', e) */ });
            // Not setting pitchyStartedRef.current = false here immediately if async,
            // as the operation is pending. It will be set below.
          } else {
            // console.warn('Pitchy.stop did not return a promise during main effect cleanup.');
          }
        } catch (e: any) {
          // console.error('Error calling Pitchy.stop (main effect cleanup catch):', e);
        }
        pitchyStartedRef.current = false; // Mark as stopped or attempt to stop was made
      } else {
        // console.log('Pitchy.stop() skipped in cleanup (ref was false).');
      }
      
      if (soundLevelStartedRef.current) {
        // console.log('Attempting to stop RNSoundLevel in cleanup (ref was true)...');
        RNSoundLevel.stop();
        soundLevelStartedRef.current = false; // Mark as stopped
        // console.log('RNSoundLevel stopped (main effect cleanup).');
      } else {
        // console.log('RNSoundLevel.stop() skipped in cleanup (ref was false).');
      }
    };
  }, [isPitchyInitialized]); // Removed frequencyToNote from dependencies

  const onVisualizerLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setVisualizerLayout({ width, height });
  };

  // const leftNotes = [tuningNotes[2], tuningNotes[1], tuningNotes[0]]; // No longer needed
  // const rightNotes = [tuningNotes[3], tuningNotes[4], tuningNotes[5]]; // No longer needed

  return (
    <SafeAreaView style={styles.container}>

      {/* Settings Button - Placed at top right or a dedicated settings area */}
      <View style={styles.headerControls}>
        <Pressable onPress={() => setSettingsModalVisible(true)} style={styles.settingsButton}>
          <Text style={styles.settingsButtonText}>Settings</Text>
        </Pressable>
      </View>

      <View style={styles.mainContent}>
        {/* Frequency Display Area (Visualizer + Frequency Value + Detected Note) */}
        <View style={styles.frequencyDisplayContainer}>
          {/* Detected Note - Top Center of this container */}
          <View style={styles.detectedNoteContainer}>
            <Text style={styles.detectedNoteText}>{detectedNote !== null ? detectedNote : '--'}</Text>
          </View>

          {/* This View is a placeholder for the actual frequency visualization */}
          <View style={styles.visualizerAreaContainer} onLayout={onVisualizerLayout}>
            {visualizerLayout && (
              <FrequencyVisualizer
                width={visualizerLayout.width}
                height={visualizerLayout.height}
                currentFrequency={currentFrequency}
                targetFrequency={targetFrequency}
                currentVolume={volume}
                visualizerSensitivity={visualizerSensitivity} // Pass sensitivity here
              />
            )}
            {!visualizerLayout && (
              <Text style={styles.visualizerPlaceholderText}>Visualizer Area Loading...</Text>
            )}
          </View>
          
          {/* Frequency Value - Bottom Center of this container */}
          <View style={styles.frequencyValueDisplay}>
            <Text style={styles.frequencyInfoText}>Frequency:</Text>
            <Text style={styles.frequencyValueText}>
              {currentFrequency !== null ? `${currentFrequency.toFixed(2)} Hz` : '--'}
            </Text>
          </View>
        </View>
      </View>

      <Modal
        animationType="slide"
        transparent={false}
        visible={settingsModalVisible}
        onRequestClose={() => {
          setSettingsModalVisible(!settingsModalVisible);
        }}
      >
        <SettingsScreen
          noiseThreshold={noiseThreshold}
          setNoiseThreshold={setNoiseThreshold}
          visualizerSensitivity={visualizerSensitivity}
          setVisualizerSensitivity={setVisualizerSensitivity}
          onClose={() => setSettingsModalVisible(false)}
        />
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D', // Darker, terminal-like background
  },
  headerControls: {
    position: 'absolute', 
    top: Platform.OS === 'android' ? 25 : 40, 
    right: 15, // Position the container from the right edge
    zIndex: 10, 
  },
  settingsButton: {
    padding: 45, // Increased padding for a larger, more reliable touch target
  },
  settingsButtonText: {
    fontSize: 24, 
    color: NEON_GREEN,
  },
  mainContent: {
    flex: 1,
    position: 'relative',
    paddingHorizontal: 20, 
    paddingTop: Platform.OS === 'ios' ? 90 : 80,
    paddingBottom:  Platform.OS === 'android' ? 20 : 40,
  },
  detectedNoteContainer: {
    paddingVertical: 5, 
    alignSelf: 'center',
  },
  detectedNoteText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: NEON_GREEN, // Neon green text
  },
  
  frequencyDisplayContainer: {
    width: '100%',
    flex: 1,
    borderWidth: 1,
    borderColor: '#003300', // Dark green border
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 40,
    marginBottom:50,
    paddingTop: 40, // Adjusted from 60
    paddingBottom: 40, // Adjusted from 100
    paddingHorizontal: 10,
  },
  visualizerAreaContainer: { 
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
 
  },
  visualizerPlaceholderText: {
    fontSize: 16,
    color: '#2AAA8A', // Dimmer neon green for placeholder
  },
  frequencyValueDisplay: {
    alignItems: 'center',
    paddingVertical: 5,
  },
  frequencyInfoText: {
    fontSize: 16,
    color: '#2AAA8A', // Dimmer neon green text
  },
  frequencyValueText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: NEON_GREEN, // Neon green text
    marginBottom: 10,
  },
});

