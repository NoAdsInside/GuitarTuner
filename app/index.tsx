import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, StyleSheet, Alert, Text, Platform, LayoutChangeEvent, SafeAreaView, Modal, Pressable, Linking, AppState, PermissionsAndroid } from 'react-native';
import Pitchy, { PitchyConfig } from 'react-native-pitchy';
import FrequencyVisualizer from './FrequencyVisualizer'; // Import the new component
import SettingsScreen from './SettingsScreen'; // Import SettingsScreen
import TuningSelector from './TuningSelector'; // Instrument/tuning picker
import NotePicker from './NotePicker'; // Scrollable note list for customising a string
import { INSTRUMENTS, Instrument, Tuning } from './tunings';

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

// --- Pitch-detection stabilization ---------------------------------------
// The raw Pitchy stream is noisy: plucked strings ring with strong harmonics,
// so a single frame can read an octave (2x) or a fifth-above-octave (3x) up,
// and readings wobble across note-bin boundaries. Without correction the
// visualizer dot jumps around or slams to one rail. We run every frame through
// a small pipeline (confidence gate → octave fold → median → note hysteresis)
// before committing it to state. Constants biased toward STABILITY over
// responsiveness — a tuner holds a string for seconds, so a little settle
// latency is imperceptible.
//
// Pitch algorithm: Pitchy defaults to ACF2+ (autocorrelation), the most
// octave-error-prone option, and its `confidence` is a useless binary flag.
// MPM (McLeod) has built-in octave-error mitigation and emits real graded
// confidence. Switching is a pure JS config string — the native library
// already contains MPM, so no NDK rebuild. Fallback: 'YIN' (use MIN_CONFIDENCE
// ~0.5 for YIN).
const PITCH_ALGORITHM = 'MPM' as const;
// Reject frames below this NSDF-clarity confidence (MPM scale). NOTE: this is a
// JS-side gate — Pitchy's `minConfidence` config field is NOT wired on Android
// (Kotlin configure() ignores it), so gating must happen here on data.confidence.
const MIN_CONFIDENCE = 0.6;
// Median-of-N over the folded stream kills residual single-frame spikes without
// the lag-smear of a mean. Kept small so a new note reflects quickly.
const MEDIAN_WINDOW = 3;
// Octave/harmonic fold: only fold a reading that is FALSE_FAR from the stable
// reference (beyond ~3 semitones, so it can't be an adjacent string the player
// genuinely moved to) AND whose folded candidate lands within FOLD_ACCEPT_CENTS.
const FOLD_GUARD_CENTS = 350;
const FOLD_ACCEPT_CENTS = 60;
// Harmonic/subharmonic ratios to test when folding (2x/3x octave errors up,
// 1/2 & 1/3 subharmonic errors down — 3rd harmonic matters for low bass strings).
const HARMONIC_RATIOS = [0.5, 1, 2, 3, 1 / 3];
// Note-switch hysteresis — applies ONLY when the incoming pitch is near the
// held note (true boundary-flicker territory). A pitch more than
// IMMEDIATE_SWITCH_CENTS away from the held note is an unambiguous note change
// and switches instantly, so the dot never sits pegged against a stale target
// (which looked like the new note was out of tune). At the boundary, a new note
// must still repeat this many frames AND the current note must have been held
// this long before switching. On silence, hold the note this long before blanking.
const IMMEDIATE_SWITCH_CENTS = 70; // > half a semitone (50c boundary) + margin
const SWITCH_CONFIRM_FRAMES = 2;
const MIN_HOLD_MS = 120;
const RELEASE_MS = 300;

// Cents (log-frequency) distance between two frequencies.
const centsBetween = (a: number, b: number) => 1200 * Math.log2(a / b);

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

// Module-level derived helpers (built once from the standard table):
// - NOTE_FREQUENCY_BY_NAME: noteNameWithOctave → true (unrounded) frequency,
//   used to look up a tuning string's frequency when narrowing classification.
// - ALL_NOTE_NAMES: every note C0..B5 sorted low → high, for the NotePicker list.
const NOTE_FREQUENCY_BY_NAME: Record<string, number> = {};
getStandardNoteFrequencies().forEach((n) => {
  NOTE_FREQUENCY_BY_NAME[n.noteNameWithOctave] = n.frequency;
});
const ALL_NOTE_NAMES: string[] = getStandardNoteFrequencies()
  .slice()
  .sort((a, b) => a.frequency - b.frequency)
  .map((n) => n.noteNameWithOctave);

export default function App() {
  const [currentFrequency, setCurrentFrequency] = useState<number | null>(null);
  const [detectedNote, setDetectedNote] = useState<string | null>(null);
  const [targetFrequency, setTargetFrequency] = useState<number | null>(null); // For the visualizer
  const [visualizerLayout, setVisualizerLayout] = useState<{width: number, height: number} | null>(null);
  const pitchyStartedRef = useRef(false); // To track if Pitchy started

  // Settings State
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);
  // noiseThreshold maps directly to Pitchy's `minVolume` (dBFS). Pitchy gates
  // pitch detection internally, so this is the single source of noise gating.
  const [noiseThreshold, setNoiseThreshold] = useState(-45); // Default noise threshold
  const [visualizerSensitivity, setVisualizerSensitivity] = useState(5); // Default visualizer sensitivity

  // Tuning State
  // tuningStrings is the single switch: null = Chromatic (detect any note, no
  // string buttons); non-null = an active tuning's notes (low → high), which
  // both narrows classification to just these notes AND drives the headstock
  // layout. It holds a working copy so per-string edits make a custom tuning.
  const [tuningStrings, setTuningStrings] = useState<string[] | null>(null);
  const [activeInstrumentName, setActiveInstrumentName] = useState<string | null>(null);
  const [activeTuningName, setActiveTuningName] = useState<string | null>(null);
  const [tuningModalVisible, setTuningModalVisible] = useState(false);
  const [editingStringIndex, setEditingStringIndex] = useState<number | null>(null);

  // State for sensitivity-adjusted note frequencies
  const [currentDetailedNoteFrequencies, setCurrentDetailedNoteFrequencies] = useState<DetailedNote[]>([]);

  // --- Stabilization pipeline state -------------------------------------
  // All mutable pipeline state lives in refs so the once-registered Pitchy
  // listener always sees live values (never a stale closure). Reset together
  // via resetPitchPipeline on teardown and tuning change. Declared here (above
  // the tuning-reset effect) so resetPitchPipeline exists when that effect runs.
  const pitchBufRef = useRef<number[]>([]);          // median-of-N ring buffer (folded values)
  const lastStableFreqRef = useRef<number | null>(null); // octave-fold anchor = last committed freq
  const heldNoteRef = useRef<string | null>(null);   // currently displayed note
  const candidateRef = useRef<string | null>(null);  // note pending confirmation
  const candidateCountRef = useRef(0);               // consecutive frames the candidate has repeated
  const heldSinceMsRef = useRef(0);                  // when heldNote was committed (tCaptureMs epoch)
  const releaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null); // debounced silence blank

  const resetPitchPipeline = useCallback(() => {
    pitchBufRef.current = [];
    lastStableFreqRef.current = null;
    heldNoteRef.current = null;
    candidateRef.current = null;
    candidateCountRef.current = 0;
    heldSinceMsRef.current = 0;
    if (releaseTimerRef.current != null) {
      clearTimeout(releaseTimerRef.current);
      releaseTimerRef.current = null;
    }
  }, []);

  // Build the set of candidate notes used to classify an incoming pitch.
  // Chromatic = the full 12×6 table; Tuning = only the active tuning's notes
  // (so the app reports which string the input is nearest — the automatic
  // active-string indicator).
  //
  // Use TRUE, UNROUNDED frequencies. Previously these were snapped to a
  // visualizerSensitivity-sized grid, which collapsed adjacent low notes into
  // one bin (D♯2 77.78 Hz and E2 82.41 Hz both rounded to 80 Hz), making the
  // lower-colliding note unreachable — that's why low E never appeared in
  // Chromatic mode. visualizerSensitivity controls ONLY the dot's zoom (handled
  // in FrequencyVisualizer); it must not decide which note is detected.
  useEffect(() => {
    const newDetailedNotes: DetailedNote[] = [];

    if (tuningStrings) {
      tuningStrings.forEach((noteName) => {
        const freq = NOTE_FREQUENCY_BY_NAME[noteName];
        if (freq != null) {
          newDetailedNotes.push({ noteNameWithOctave: noteName, frequency: freq });
        }
      });
    } else {
      noteFrequencyTable.forEach((octaveFrequencies, noteIndex) => {
        const baseName = noteBaseNames[noteIndex];
        octaveFrequencies.forEach((freq, octave) => {
          newDetailedNotes.push({ noteNameWithOctave: `${baseName}${octave}`, frequency: freq });
        });
      });
    }
    setCurrentDetailedNoteFrequencies(newDetailedNotes);
  }, [tuningStrings]);

  // Clear stale readings when switching tunings so a note classified under the
  // previous set doesn't linger before the next detection arrives. Also reset
  // the stabilization pipeline so no stale octave anchor / held note survives
  // the mode switch.
  useEffect(() => {
    resetPitchPipeline();
    setCurrentFrequency(null);
    setDetectedNote(null);
  }, [tuningStrings, resetPitchPipeline]);

  // Convert a frequency to the nearest candidate note (by absolute Hz distance)
  // against currentDetailedNoteFrequencies (true, unrounded frequencies).
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

  // Octave/harmonic fold + median. Given a raw pitch, fold obvious harmonic
  // octave errors back onto the stable reference (BEFORE note classification,
  // so it works even in tuning mode where the harmonic's octave has no bin),
  // then median-filter to reject stragglers. Pure w.r.t. refs — stable identity.
  const processPitch = useCallback((rawPitch: number): number => {
    let folded = rawPitch;
    const ref = lastStableFreqRef.current;
    if (ref != null) {
      const rawErr = Math.abs(centsBetween(rawPitch, ref));
      // Only fold when the raw reading is too far to be a real adjacent note —
      // otherwise trust it, so deliberate note changes aren't "stuck" on the old.
      if (rawErr > FOLD_GUARD_CENTS) {
        let best = rawPitch;
        let bestErr = rawErr;
        for (const ratio of HARMONIC_RATIOS) {
          const cand = rawPitch * ratio;
          if (cand < MIN_GUITAR_FREQUENCY || cand > MAX_GUITAR_FREQUENCY) continue;
          const err = Math.abs(centsBetween(cand, ref));
          if (err < bestErr) { bestErr = err; best = cand; }
        }
        if (best !== rawPitch && bestErr < FOLD_ACCEPT_CENTS) folded = best;
      }
    }

    const buf = pitchBufRef.current;
    buf.push(folded);
    if (buf.length > MEDIAN_WINDOW) buf.shift();
    const sorted = [...buf].sort((a, b) => a - b);
    return sorted[sorted.length >> 1]; // median
  }, []);

  // Note-switch hysteresis: classify the stabilized frequency, but only change
  // the displayed note when a new candidate is genuinely sustained. Also anchors
  // the octave-fold reference to the committed frequency (closing the loop so
  // the anchor only ever tracks notes that survived hysteresis).
  const pickNote = useCallback((freq: number, tMs: number): string | null => {
    const candidate = frequencyToNoteRef.current(freq);
    const held = heldNoteRef.current;

    const commit = (note: string | null) => {
      heldNoteRef.current = note;
      heldSinceMsRef.current = tMs;
      candidateRef.current = null;
      candidateCountRef.current = 0;
      if (note != null) lastStableFreqRef.current = freq;
      return note;
    };

    if (candidate === held) {
      candidateRef.current = null;
      candidateCountRef.current = 0;
      if (held != null) lastStableFreqRef.current = freq; // anchor tracks the held note
      return held;
    }

    // First detection after silence — commit immediately (nothing to debounce).
    if (held == null) return commit(candidate);

    // Unambiguous note change: the pitch is well clear of the held note, so this
    // can't be boundary jitter — switch instantly rather than holding the old
    // target (which would peg the dot and look out of tune during the wait).
    const heldFreq = NOTE_FREQUENCY_BY_NAME[held];
    if (heldFreq != null && Math.abs(centsBetween(freq, heldFreq)) > IMMEDIATE_SWITCH_CENTS) {
      return commit(candidate);
    }

    // Near the held note's boundary — debounce: candidate must repeat AND the
    // held note must have shown a while before we switch.
    if (candidate === candidateRef.current) {
      candidateCountRef.current += 1;
    } else {
      candidateRef.current = candidate;
      candidateCountRef.current = 1;
    }
    const heldLongEnough = tMs - heldSinceMsRef.current >= MIN_HOLD_MS;
    if (candidateCountRef.current >= SWITCH_CONFIRM_FRAMES && heldLongEnough) {
      return commit(candidate);
    }
    return held; // keep the current note for now
  }, []);

  // Debounced silence: don't blank on a single dropped/gated frame (that strobes
  // between plucks and during decay). Blank only after RELEASE_MS of no signal.
  const handleSilence = useCallback(() => {
    if (releaseTimerRef.current != null) return; // release already pending
    releaseTimerRef.current = setTimeout(() => {
      releaseTimerRef.current = null;
      resetPitchPipeline();
      setCurrentFrequency(null);
      setDetectedNote(null);
    }, RELEASE_MS);
  }, [resetPitchPipeline]);

  // Mirror the helpers into refs so the once-registered listener never holds a
  // stale copy (same idiom as frequencyToNoteRef).
  const processPitchRef = useRef(processPitch);
  const pickNoteRef = useRef(pickNote);
  const handleSilenceRef = useRef(handleSilence);
  useEffect(() => { processPitchRef.current = processPitch; }, [processPitch]);
  useEffect(() => { pickNoteRef.current = pickNote; }, [pickNote]);
  useEffect(() => { handleSilenceRef.current = handleSilence; }, [handleSilence]);

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

  // Step 1: microphone permission — must be granted BEFORE any native recorder
  // is created, or Pitchy's AudioRecord comes up uninitialized and start() fails.
  const [hasPermission, setHasPermission] = useState(false);

  // Verify/request mic permission. On Android, if it was previously denied with
  // "Don't ask again", the system dialog will NOT reappear no matter how many
  // times we ask — so in that case we route the user to the app settings screen
  // to grant it manually. Safe to call repeatedly (e.g. from a button).
  const ensureMicPermission = useCallback(async () => {
    try {
      const RECORD_AUDIO = PermissionsAndroid.PERMISSIONS.RECORD_AUDIO;

      // Already granted? Nothing to do.
      if (await PermissionsAndroid.check(RECORD_AUDIO)) {
        setHasPermission(true);
        return;
      }

      // Ask. `request` returns GRANTED / DENIED / NEVER_ASK_AGAIN. Unlike Expo's
      // `canAskAgain`, PermissionsAndroid signals "don't ask again" via the
      // NEVER_ASK_AGAIN result — that's when we route the user to Settings.
      const result = await PermissionsAndroid.request(RECORD_AUDIO);
      if (result === PermissionsAndroid.RESULTS.GRANTED) {
        setHasPermission(true);
        return;
      }

      setHasPermission(false);
      if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
        Alert.alert(
          'Microphone Access Needed',
          'The system permission dialog can no longer be shown. Enable Microphone for this app in Settings, then return here.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ]
        );
      }
    } catch (e: any) {
      Alert.alert('Permission Error', 'Could not request microphone permission: ' + e.message);
    }
  }, []);

  // Ask on mount, and re-check whenever the app returns to the foreground — so
  // granting permission in Settings is picked up automatically on return.
  useEffect(() => {
    ensureMicPermission();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') ensureMicPermission();
    });
    return () => sub.remove();
  }, [ensureMicPermission]);

  // Step 2: once permission is granted, (re)initialize and start Pitchy. This
  // re-runs whenever noiseThreshold changes, because Pitchy's noise gate
  // (`minVolume`) is fixed at init time. Pitchy is now the ONLY microphone
  // client — react-native-sound-level was removed to avoid two AudioSource.MIC
  // recorders fighting over the device microphone on Android.
  useEffect(() => {
    if (!hasPermission) return;

    let isMounted = true;
    let pitchSubscription: { remove: () => void } | null = null;

    const setupAudioProcessing = async () => {
      try {
        // Ensure any prior session (e.g. from a previous threshold) is stopped
        // before re-initializing, so we never leak a native recorder.
        if (pitchyStartedRef.current) {
          try { await Pitchy.stop(); } catch { /* ignore */ }
          pitchyStartedRef.current = false;
        }

        // bufferSize is passed straight to AudioRecord as bytes. Pitchy's
        // default (4096) is below the minimum buffer some devices require for
        // 44.1kHz mono PCM16, which makes AudioRecord initialize in
        // STATE_UNINITIALIZED and startRecording() throw. 8192 is large enough
        // for those devices while still small enough for responsive tuning.
        // algorithm: MPM is far less octave-error-prone than Pitchy's default
        // ACF2+ and gives real (non-binary) confidence for the JS gate below.
        const pitchyConfig: PitchyConfig = { minVolume: noiseThreshold, bufferSize: 8192, algorithm: PITCH_ALGORITHM };
        await Pitchy.init(pitchyConfig);
        if (!isMounted) return;

        await Pitchy.start();
        pitchyStartedRef.current = true;

        if (!isMounted) {
          try { await Pitchy.stop(); } catch { /* ignore */ }
          pitchyStartedRef.current = false;
          return;
        }

        // Pitchy gates on volume natively; here we run each frame through the
        // stabilization pipeline: confidence gate → octave fold + median
        // (processPitch) → note hysteresis (pickNote). See constants above.
        pitchSubscription = Pitchy.addListener((data) => {
          if (!isMounted) return;
          const pitch = data?.pitch ?? -1;
          const confidence = data?.confidence ?? 0;
          // tCaptureMs is the true audio-clock capture time (immune to bridge
          // backlog); fall back to Date.now() if the native module omits it.
          const tMs = data?.tCaptureMs ?? Date.now();

          // Out of guitar range / unvoiced → schedule a debounced blank, don't
          // clear instantly (that strobes between plucks and during decay).
          if (pitch < MIN_GUITAR_FREQUENCY || pitch > MAX_GUITAR_FREQUENCY) {
            handleSilenceRef.current();
            return;
          }
          // Low-confidence frame carries no reliable pitch — keep the last held
          // reading rather than reacting to it.
          if (confidence < MIN_CONFIDENCE) return;

          // Good frame: cancel any pending silence blank.
          if (releaseTimerRef.current != null) {
            clearTimeout(releaseTimerRef.current);
            releaseTimerRef.current = null;
          }

          const stable = processPitchRef.current(pitch);
          setCurrentFrequency(stable);
          setDetectedNote(pickNoteRef.current(stable, tMs));
        });
      } catch (error: any) {
        if (pitchSubscription) {
          pitchSubscription.remove();
          pitchSubscription = null;
        }
        if (pitchyStartedRef.current) {
          try { await Pitchy.stop(); } catch { /* ignore */ }
          pitchyStartedRef.current = false;
        }
        if (isMounted) Alert.alert('Audio Processing Error', 'Could not start pitch detection: ' + error.message);
      }
    };

    setupAudioProcessing();

    return () => {
      isMounted = false;
      if (pitchSubscription) {
        pitchSubscription.remove();
        pitchSubscription = null;
      }
      if (pitchyStartedRef.current) {
        Pitchy.stop().catch(() => { /* ignore */ });
        pitchyStartedRef.current = false;
      }
      // Clear any stale reading and stabilization state when the session tears down.
      resetPitchPipeline();
      setCurrentFrequency(null);
      setDetectedNote(null);
    };
  }, [hasPermission, noiseThreshold, resetPitchPipeline]);

  const onVisualizerLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setVisualizerLayout({ width, height });
  };

  // Tuning selection / customisation handlers
  const handleSelectChromatic = () => {
    setTuningStrings(null);
    setActiveInstrumentName(null);
    setActiveTuningName(null);
    setTuningModalVisible(false);
  };

  const handleSelectTuning = (instrument: Instrument, tuning: Tuning) => {
    setTuningStrings([...tuning.strings]); // working copy so edits don't mutate the preset
    setActiveInstrumentName(instrument.name);
    setActiveTuningName(tuning.name);
    setTuningModalVisible(false);
  };

  const handleSelectNote = (note: string) => {
    if (editingStringIndex === null) return;
    setTuningStrings((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      next[editingStringIndex] = note;
      return next;
    });
    setActiveTuningName('Custom'); // editing a string makes this a custom tuning
    setEditingStringIndex(null);
  };

  // Headstock split: low strings on the left column, high strings on the right,
  // each ordered top → bottom. Works for any string count (e.g. 6 → 3+3, 4 → 2+2).
  const leftCount = tuningStrings ? Math.ceil(tuningStrings.length / 2) : 0;
  const leftStrings = tuningStrings ? tuningStrings.slice(0, leftCount) : [];
  const rightStrings = tuningStrings ? tuningStrings.slice(leftCount) : [];

  // Render a single string button. `globalIndex` is the index into tuningStrings
  // so tapping opens the note picker for the correct string.
  const renderStringButton = (note: string, globalIndex: number) => {
    const isActive = detectedNote === note;
    return (
      <Pressable
        key={`${note}-${globalIndex}`}
        style={[styles.stringButton, isActive && styles.stringButtonActive]}
        onPress={() => setEditingStringIndex(globalIndex)}
      >
        <Text style={[styles.stringButtonText, isActive && styles.stringButtonTextActive]}>
          {note}
        </Text>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.container}>

      {/* Tuning Button - top left */}
      <View style={styles.headerControlsLeft}>
        <Pressable onPress={() => setTuningModalVisible(true)} style={styles.settingsButton}>
          <Text style={styles.settingsButtonText}>Tuning</Text>
        </Pressable>
      </View>

      {/* Settings Button - Placed at top right or a dedicated settings area */}
      <View style={styles.headerControls}>
        <Pressable onPress={() => setSettingsModalVisible(true)} style={styles.settingsButton}>
          <Text style={styles.settingsButtonText}>Settings</Text>
        </Pressable>
      </View>

      <View style={styles.mainContent}>
        {/* Microphone permission prompt - shown until access is granted */}
        {!hasPermission && (
          <Pressable style={styles.permissionBanner} onPress={ensureMicPermission}>
            <Text style={styles.permissionBannerText}>
              Microphone access needed — tap to enable
            </Text>
          </Pressable>
        )}

        {/* Frequency Display Area (Visualizer + Frequency Value + Detected Note) */}
        <View style={styles.frequencyDisplayContainer}>
          {/* Detected Note - Top Center of this container */}
          <View style={styles.detectedNoteContainer}>
            <Text style={styles.detectedNoteText}>{detectedNote !== null ? detectedNote : '--'}</Text>
          </View>

          {/* Visualizer, flanked by string buttons (headstock layout) when a
              tuning is active. In Chromatic mode the columns are absent and the
              visualizer fills the width, exactly as before. */}
          <View style={styles.visualizerRow}>
            {tuningStrings && (
              <View style={styles.stringColumn}>
                {leftStrings.map((note, i) => renderStringButton(note, i))}
              </View>
            )}

            <View style={styles.visualizerAreaContainer} onLayout={onVisualizerLayout}>
              {visualizerLayout && (
                <FrequencyVisualizer
                  width={visualizerLayout.width}
                  height={visualizerLayout.height}
                  currentFrequency={currentFrequency}
                  targetFrequency={targetFrequency}
                  // Pitchy gates on volume natively; a detected frequency means we
                  // are above the noise floor, so the visualizer is always "audible".
                  currentVolume={0}
                  visualizerSensitivity={visualizerSensitivity} // Pass sensitivity here
                />
              )}
              {!visualizerLayout && (
                <Text style={styles.visualizerPlaceholderText}>Visualizer Area Loading...</Text>
              )}
            </View>

            {tuningStrings && (
              <View style={styles.stringColumn}>
                {rightStrings.map((note, i) => renderStringButton(note, leftCount + i))}
              </View>
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

      {/* Instrument / tuning picker */}
      <Modal
        animationType="slide"
        transparent={false}
        visible={tuningModalVisible}
        onRequestClose={() => setTuningModalVisible(false)}
      >
        <TuningSelector
          instruments={INSTRUMENTS}
          activeInstrumentName={activeInstrumentName}
          activeTuningName={activeTuningName}
          onSelectChromatic={handleSelectChromatic}
          onSelectTuning={handleSelectTuning}
          onClose={() => setTuningModalVisible(false)}
        />
      </Modal>

      {/* Per-string note customisation */}
      <Modal
        animationType="slide"
        transparent={false}
        visible={editingStringIndex !== null}
        onRequestClose={() => setEditingStringIndex(null)}
      >
        {editingStringIndex !== null && tuningStrings && (
          <NotePicker
            notes={ALL_NOTE_NAMES}
            currentNote={tuningStrings[editingStringIndex]}
            stringLabel={`String ${editingStringIndex + 1}`}
            onSelect={handleSelectNote}
            onClose={() => setEditingStringIndex(null)}
          />
        )}
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
  headerControlsLeft: {
    position: 'absolute',
    top: Platform.OS === 'android' ? 25 : 40,
    left: 15, // Mirror of headerControls, on the left edge
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
  permissionBanner: {
    borderWidth: 1,
    borderColor: NEON_GREEN,
    borderRadius: 5,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
    alignItems: 'center',
  },
  permissionBannerText: {
    fontSize: 14,
    color: NEON_GREEN,
    textAlign: 'center',
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
  visualizerRow: {
    flex: 1,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  visualizerAreaContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stringColumn: {
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  stringButton: {
    borderWidth: 1,
    borderColor: '#003300',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    minWidth: 52,
    alignItems: 'center',
  },
  stringButtonActive: {
    borderColor: NEON_GREEN,
    backgroundColor: 'rgba(57,255,20,0.12)',
  },
  stringButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2AAA8A', // dim green when not the active string
  },
  stringButtonTextActive: {
    color: NEON_GREEN,
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

