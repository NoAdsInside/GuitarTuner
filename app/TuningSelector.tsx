import React from 'react';
import { View, Text, StyleSheet, Button, Platform, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Instrument, Tuning } from './tunings';

const NEON_GREEN = '#39FF14';
const DARK_BACKGROUND = '#0D0D0D';
const DIM_GREEN = '#2AAA8A';
const DARK_GREEN_BORDER = '#003300';

interface TuningSelectorProps {
  instruments: Instrument[];
  // The name of the active tuning, or null when Chromatic is active. Names can
  // collide across instruments (e.g. "Standard"), so we also match on instrument.
  activeInstrumentName: string | null;
  activeTuningName: string | null;
  onSelectChromatic: () => void;
  onSelectTuning: (instrument: Instrument, tuning: Tuning) => void;
  onClose: () => void;
}

const TuningSelector: React.FC<TuningSelectorProps> = ({
  instruments,
  activeInstrumentName,
  activeTuningName,
  onSelectChromatic,
  onSelectTuning,
  onClose,
}) => {
  const chromaticActive = activeTuningName === null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>Tuning</Text>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {/* Chromatic (default) */}
          <Pressable
            style={[styles.option, chromaticActive && styles.optionActive]}
            onPress={onSelectChromatic}
          >
            <Text style={[styles.optionText, chromaticActive && styles.optionTextActive]}>
              Chromatic
            </Text>
            <Text style={styles.optionSub}>Detect any note across the full range</Text>
          </Pressable>

          {instruments.map((instrument) => (
            <View key={instrument.name} style={styles.instrumentBlock}>
              <Text style={styles.instrumentHeader}>{instrument.name}</Text>
              {instrument.tunings.map((tuning) => {
                const isActive =
                  activeInstrumentName === instrument.name && activeTuningName === tuning.name;
                return (
                  <Pressable
                    key={tuning.name}
                    style={[styles.option, isActive && styles.optionActive]}
                    onPress={() => onSelectTuning(instrument, tuning)}
                  >
                    <Text style={[styles.optionText, isActive && styles.optionTextActive]}>
                      {tuning.name}
                    </Text>
                    <Text style={styles.optionSub}>{tuning.strings.join('  ')}</Text>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </ScrollView>

        <View style={styles.closeButtonContainer}>
          <Button title="Close" onPress={onClose} color={Platform.OS === 'ios' ? NEON_GREEN : undefined} />
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: DARK_BACKGROUND,
  },
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: DARK_BACKGROUND,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: NEON_GREEN,
    textAlign: 'center',
    marginBottom: 20,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  instrumentBlock: {
    marginTop: 20,
  },
  instrumentHeader: {
    fontSize: 14,
    color: DIM_GREEN,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  option: {
    borderWidth: 1,
    borderColor: DARK_GREEN_BORDER,
    borderRadius: 5,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  optionActive: {
    borderColor: NEON_GREEN,
    backgroundColor: 'rgba(57,255,20,0.08)',
  },
  optionText: {
    fontSize: 18,
    color: DIM_GREEN,
  },
  optionTextActive: {
    color: NEON_GREEN,
    fontWeight: 'bold',
  },
  optionSub: {
    fontSize: 12,
    color: DIM_GREEN,
    marginTop: 4,
  },
  closeButtonContainer: {
    marginTop: 10,
    borderRadius: 5,
    overflow: 'hidden',
    backgroundColor: Platform.OS === 'android' ? NEON_GREEN : undefined,
  },
});

export default TuningSelector;
