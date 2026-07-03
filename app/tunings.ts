// Instrument tuning presets for the tuner.
//
// A `Tuning.strings` array lists notes LOW → HIGH using the same `♯`-glyph
// `noteNameWithOctave` naming as `noteBaseNames` in index.tsx (e.g. "E2", "G♯2").
// Every note here MUST be lookup-able in `standardNoteFrequencies`, which only
// covers octaves 0–5 (C0 16.35 Hz … B5 987.77 Hz) and the app only classifies
// within MIN_GUITAR_FREQUENCY..MAX_GUITAR_FREQUENCY (30–1300 Hz) — all presets
// below stay inside those bounds.

export interface Tuning {
  name: string;
  strings: string[]; // noteNameWithOctave, low → high
}

export interface Instrument {
  name: string;
  tunings: Tuning[];
}

export const INSTRUMENTS: Instrument[] = [
  {
    name: 'Guitar',
    tunings: [
      { name: 'Standard', strings: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'] },
      { name: 'Drop D', strings: ['D2', 'A2', 'D3', 'G3', 'B3', 'E4'] },
      { name: 'Half-step down', strings: ['D♯2', 'G♯2', 'C♯3', 'F♯3', 'A♯3', 'D♯4'] },
      { name: 'Open G', strings: ['D2', 'G2', 'D3', 'G3', 'B3', 'D4'] },
      { name: 'Open D', strings: ['D2', 'A2', 'D3', 'F♯3', 'A3', 'D4'] },
      { name: 'DADGAD', strings: ['D2', 'A2', 'D3', 'G3', 'A3', 'D4'] },
    ],
  },
  {
    name: 'Bass',
    tunings: [
      { name: 'Standard', strings: ['E1', 'A1', 'D2', 'G2'] },
      { name: 'Drop D', strings: ['D1', 'A1', 'D2', 'G2'] },
    ],
  },
  {
    name: 'Ukulele',
    tunings: [
      { name: 'Standard (reentrant)', strings: ['G4', 'C4', 'E4', 'A4'] },
      { name: 'Baritone', strings: ['D3', 'G3', 'B3', 'E4'] },
    ],
  },
  {
    name: 'Violin / Mandolin',
    tunings: [
      { name: 'Standard', strings: ['G3', 'D4', 'A4', 'E5'] },
    ],
  },
];
