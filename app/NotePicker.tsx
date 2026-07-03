import React, { useRef } from 'react';
import { View, Text, StyleSheet, Button, Platform, ScrollView, Pressable, LayoutChangeEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const NEON_GREEN = '#39FF14';
const DARK_BACKGROUND = '#0D0D0D';
const DIM_GREEN = '#2AAA8A';

interface NotePickerProps {
  notes: string[]; // all noteNameWithOctave, C0..B5, low → high
  currentNote: string | null; // the string's current note (highlighted)
  stringLabel: string; // e.g. "String 5"
  onSelect: (note: string) => void;
  onClose: () => void;
}

const NotePicker: React.FC<NotePickerProps> = ({
  notes,
  currentNote,
  stringLabel,
  onSelect,
  onClose,
}) => {
  const scrollRef = useRef<ScrollView>(null);
  const currentYRef = useRef<number | null>(null);

  // When the current note's row lays out, remember its Y so we can scroll it
  // roughly into view once, without needing fixed row heights.
  const onRowLayout = (event: LayoutChangeEvent) => {
    currentYRef.current = event.nativeEvent.layout.y;
    scrollRef.current?.scrollTo({ y: Math.max(0, currentYRef.current - 120), animated: false });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>{stringLabel}</Text>
        <Text style={styles.subtitle}>Choose the note for this string</Text>

        <ScrollView ref={scrollRef} style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {notes.map((note) => {
            const isActive = note === currentNote;
            return (
              <Pressable
                key={note}
                onLayout={isActive ? onRowLayout : undefined}
                style={[styles.row, isActive && styles.rowActive]}
                onPress={() => onSelect(note)}
              >
                <Text style={[styles.rowText, isActive && styles.rowTextActive]}>
                  {isActive ? `▶  ${note}  ◀` : note}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.closeButtonContainer}>
          <Button title="Cancel" onPress={onClose} color={Platform.OS === 'ios' ? NEON_GREEN : undefined} />
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
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 12,
    color: DIM_GREEN,
    textAlign: 'center',
    marginBottom: 16,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  row: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  rowActive: {
    backgroundColor: 'rgba(57,255,20,0.08)',
    borderRadius: 5,
  },
  rowText: {
    fontSize: 20,
    color: DIM_GREEN,
  },
  rowTextActive: {
    fontSize: 22,
    color: NEON_GREEN,
    fontWeight: 'bold',
  },
  closeButtonContainer: {
    marginTop: 10,
    borderRadius: 5,
    overflow: 'hidden',
    backgroundColor: Platform.OS === 'android' ? NEON_GREEN : undefined,
  },
});

export default NotePicker;
