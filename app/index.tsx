import { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Button, Alert, Text, TouchableOpacity, Platform, LayoutChangeEvent, SafeAreaView } from 'react-native';
import { AudioModule } from 'expo-audio'; // For permissions
import Pitchy, { PitchyConfig, PitchyEventCallback } from 'react-native-pitchy';
import RNSoundLevel from 'react-native-sound-level'; // Import RNSoundLevel
import FrequencyVisualizer from './FrequencyVisualizer'; // Import the new component

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

// Create a flat list of { noteNameWithOctave: string, frequency: number }
const detailedNoteFrequencies: { noteNameWithOctave: string; frequency: number }[] = [];
noteFrequencyTable.forEach((octaveFrequencies, noteIndex) => {
  const baseName = noteBaseNames[noteIndex];
  octaveFrequencies.forEach((freq, octave) => {
    detailedNoteFrequencies.push({
      noteNameWithOctave: `${baseName}${octave}`,
      frequency: freq,
    });
  });
});

// const originalLeftIndices = [2, 1, 0]; // No longer needed
// const originalRightIndices = [3, 4, 5]; // No longer needed

const MIN_GUITAR_FREQUENCY = 30; // Minimum frequency to consider for guitar tuning (approx Low B0)
const MAX_GUITAR_FREQUENCY = 1300; // Maximum frequency to consider for guitar tuning
const MIN_VISUALIZATION_VOLUME = -45; // dBFS: Minimum volume for a sound to be processed and visualized.

function frequencyToNote(frequency: number): string | null {
  if (frequency <= 0) return null;

  let closestNote: string | null = null;
  let minDifference = Infinity;

  for (const noteInfo of detailedNoteFrequencies) {
    const difference = Math.abs(noteInfo.frequency - frequency);
    if (difference < minDifference) {
      minDifference = difference;
      closestNote = noteInfo.noteNameWithOctave;
    }
    // Optimization: if the table frequencies are sorted, we can stop early
    // once differences start increasing, but a full scan is safer for unsorted/small tables.
    // Also, consider a tolerance: if diff is very small, it's a good match.
    // For now, just find the absolute closest.
  }
  return closestNote;
}

export default function App() {
  const [isChromaticMode, setIsChromaticMode] = useState(true);
  // const [tuningNotes, setTuningNotes] = useState(['E', 'A', 'D', 'G', 'B', 'E']); // No longer needed
  const [currentFrequency, setCurrentFrequency] = useState<number | null>(null);
  const [detectedNote, setDetectedNote] = useState<string | null>(null);
  const [targetFrequency, setTargetFrequency] = useState<number | null>(null); // For the visualizer
  const [visualizerLayout, setVisualizerLayout] = useState<{width: number, height: number} | null>(null);
  const [volume, setVolume] = useState<number | null>(null);
  const volumeRef = useRef<number | null>(null); // Ref to hold the latest volume for callbacks
  const pitchyStartedRef = useRef(false); // To track if Pitchy started
  const soundLevelStartedRef = useRef(false); // To track if RNSoundLevel started

  // Effect to update targetFrequency when detectedNote changes
  useEffect(() => {
    if (detectedNote) {
      const noteInfo = detailedNoteFrequencies.find(nf => nf.noteNameWithOctave === detectedNote);
      if (noteInfo) {
        setTargetFrequency(noteInfo.frequency);
      } else {
        setTargetFrequency(null); // Or handle if note not in table, though it should be
      }
    } else {
      setTargetFrequency(null);
    }
  }, [detectedNote]);

  useEffect(() => {
    let isMounted = true;
    let pitchSubscription: { remove: () => void } | null = null;

    const setupAudioProcessing = async () => {
      try {
        // 1. Request Permissions
        const permissionStatus = await AudioModule.requestRecordingPermissionsAsync();
        if (!permissionStatus.granted) {
          if (isMounted) Alert.alert('Permission Denied', 'Microphone permission is required.');
          return;
        }

        // 2. Initialize Pitchy with a new minVolume
        const pitchyConfig: PitchyConfig = {
          minVolume: -50, // Adjusted from -60. Should be slightly more sensitive than MIN_VISUALIZATION_VOLUME.
        };
        await Pitchy.init(pitchyConfig);
        console.log('Pitchy initialized with config:', pitchyConfig);

        // 3. Setup RNSoundLevel
        RNSoundLevel.onNewFrame = (data) => {
          if (isMounted) {
            const newVolume = data.value;
            setVolume(newVolume);
            volumeRef.current = newVolume; // Update ref here
            // console.log('Sound Level (dBFS):', newVolume);
            if (newVolume < MIN_VISUALIZATION_VOLUME) {
              // If volume is too low, clear frequency and note regardless of Pitchy's output
              setCurrentFrequency(null);
              setDetectedNote(null);
            }
            // If volume is sufficient, Pitchy's listener will set frequency/note
          }
        };
        RNSoundLevel.start(); // Default monitor interval is 250ms
        soundLevelStartedRef.current = true; // Mark as started
        console.log('RNSoundLevel started.');

        // 4. Add Listener
        const handlePitchDetected: PitchyEventCallback = (data) => {
          // console.log('Pitchy event data:', data); // Keep this for debugging if needed
          
          // Only process pitch if volume is currently sufficient (use ref here)
          if (isMounted && volumeRef.current !== null && volumeRef.current >= MIN_VISUALIZATION_VOLUME) {
            if (data && data.pitch != null) {
              if (data.pitch >= MIN_GUITAR_FREQUENCY && data.pitch <= MAX_GUITAR_FREQUENCY) {
                setCurrentFrequency(data.pitch);
                setDetectedNote(frequencyToNote(data.pitch));
              } else {
                // Frequency out of guitar range, treat as no valid note for display
                setCurrentFrequency(null);
                setDetectedNote(null);
              }
            } else {
              // Pitchy reported no pitch, clear display (if not already cleared by volume)
              // setCurrentFrequency(null); 
              // setDetectedNote(null);
            }
          } else if (isMounted) {
            // Volume is too low (or null initially), ensure display is clear
            // This case might be redundant if RNSoundLevel.onNewFrame already cleared them,
            // but it's a good safeguard if Pitchy fires before RNSoundLevel on a quiet signal.
            // setCurrentFrequency(null); // RNSoundLevel.onNewFrame handles this primarily.
            // setDetectedNote(null);
          }
        };
        pitchSubscription = Pitchy.addListener(handlePitchDetected);

        // 5. Start Pitch Detection
        await Pitchy.start();
        pitchyStartedRef.current = true; // Mark as started
        if (isMounted) {
          console.log('Pitch detection started successfully.');
        }

      } catch (error) {
        console.error('Error setting up or starting audio processing:', error);
        if (isMounted) Alert.alert('Audio Processing Error', 'Could not start audio processing.');
      }
    };

    setupAudioProcessing();

    return () => {
      isMounted = false;
      console.log('Cleaning up audio processing...');
      if (pitchSubscription) {
        pitchSubscription.remove();
        console.log('Pitch listener removed.');
      }
      
      if (pitchyStartedRef.current) {
        Pitchy.stop().then(() => {
          console.log('Pitch detection stopped successfully.');
        }).catch(error => {
          console.error('Error stopping pitch detection:', error);
        }).finally(() => {
          pitchyStartedRef.current = false; // Ensure it's marked as stopped
        });
      } else {
        console.log('Pitchy was not started or already stopped, skipping stop call.');
      }
      
      if (soundLevelStartedRef.current) {
        RNSoundLevel.stop();
        // RNSoundLevel.onNewFrame = () => {}; // DO NOT clear onNewFrame here
        soundLevelStartedRef.current = false; // Mark as stopped
        console.log('RNSoundLevel stopped.');
      } else {
        console.log('RNSoundLevel was not started or already stopped, skipping stop call.');
      }
    };
  }, []); // REMOVED [volume] from dependency array, this effect runs once on mount/unmount



  const onVisualizerLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setVisualizerLayout({ width, height });
  };

  // const leftNotes = [tuningNotes[2], tuningNotes[1], tuningNotes[0]]; // No longer needed
  // const rightNotes = [tuningNotes[3], tuningNotes[4], tuningNotes[5]]; // No longer needed

  return (
    <SafeAreaView style={styles.container}>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D', // Darker, terminal-like background
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 60 : 40,
    paddingBottom: Platform.OS === 'android' ? 60 : 40,
  },
  mainContent: {
    flex: 1,
    position: 'relative',
    // alignItems: 'center', // No longer needed here for the note, frequencyDisplayContainer handles its children
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
    paddingTop: 60,
    paddingBottom: 100,
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
    marginTop: 10,
  },
  frequencyValueText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: NEON_GREEN, // Neon green text
    marginBottom: 10,
  },
});

