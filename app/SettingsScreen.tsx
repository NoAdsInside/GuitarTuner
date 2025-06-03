import React from 'react';
import { View, Text, StyleSheet, Button, Platform } from 'react-native';
import Slider from '@react-native-community/slider';
import { SafeAreaView } from 'react-native-safe-area-context';

const NEON_GREEN = '#39FF14';
const DARK_BACKGROUND = '#0D0D0D';
const DIM_GREEN = '#2AAA8A';

interface SettingsScreenProps {
  noiseThreshold: number;
  setNoiseThreshold: (value: number) => void;
  visualizerSensitivity: number;
  setVisualizerSensitivity: (value: number) => void;
  onClose: () => void; // Function to close the settings screen
}

const SettingsScreen: React.FC<SettingsScreenProps> = ({
  noiseThreshold,
  setNoiseThreshold,
  visualizerSensitivity,
  setVisualizerSensitivity,
  onClose,
}) => {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>Settings</Text>

        {/* Noise Threshold Setting */}
        <View style={styles.settingContainer}>
          <Text style={styles.label}>
            Noise Threshold: {noiseThreshold.toFixed(0)} dBFS
          </Text>
          <Text style={styles.description}>
            Minimum volume to detect notes. Quieter sounds are ignored.
          </Text>
          <Slider
            style={styles.slider}
            minimumValue={-90} // More sensitive
            maximumValue={-20} // Less sensitive
            step={1}
            value={noiseThreshold}
            onValueChange={setNoiseThreshold}
            minimumTrackTintColor={NEON_GREEN}
            maximumTrackTintColor={DIM_GREEN}
            thumbTintColor={NEON_GREEN}
          />
          <View style={styles.sliderLabels}>
            <Text style={styles.sliderLabelText}>More Sensitive (-90)</Text>
            <Text style={styles.sliderLabelText}>Less Sensitive (-20)</Text>
          </View>
        </View>

        {/* Visualizer Sensitivity Setting */}
        <View style={styles.settingContainer}>
          <Text style={styles.label}>
            Visualizer Sensitivity: {visualizerSensitivity.toFixed(5)} Hz
          </Text>
          <Text style={styles.description}>
            Minimum frequency change (Hz) for the visualizer dot to react.
          </Text>
          <Slider
            style={styles.slider}
            minimumValue={1.0} // More reactive
            maximumValue={10.0}  // Less reactive
            step={1.0}
            value={visualizerSensitivity}
            onValueChange={setVisualizerSensitivity}
            minimumTrackTintColor={NEON_GREEN}
            maximumTrackTintColor={DIM_GREEN}
            thumbTintColor={NEON_GREEN}
          />
          <View style={styles.sliderLabels}>
            <Text style={styles.sliderLabelText}>More Reactive (1.0)</Text>
            <Text style={styles.sliderLabelText}>Less Reactive (10.0)</Text>
          </View>
        </View>

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
    marginBottom: 30,
  },
  settingContainer: {
    marginBottom: 30,
  },
  label: {
    fontSize: 18,
    color: NEON_GREEN,
    marginBottom: 5,
  },
  description: {
    fontSize: 12,
    color: DIM_GREEN,
    marginBottom: 10,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 10, // To align with slider ends if possible
  },
  sliderLabelText: {
    fontSize: 10,
    color: DIM_GREEN,
  },
  closeButtonContainer: {
    marginTop: 20,
    borderRadius: 5,
    overflow: 'hidden', // Ensures the borderRadius is applied to the Button background on Android
    backgroundColor: Platform.OS === 'android' ? NEON_GREEN : undefined, // Button bg for Android
  },
});

export default SettingsScreen; 