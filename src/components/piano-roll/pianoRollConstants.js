import { PIANO_PITCH_MAX, PIANO_PITCH_MIN } from "../../utils/patternNotes";

// Shared pitch boundaries used by the Piano Roll grid and note operations.
export const PITCH_MIN = PIANO_PITCH_MIN;
export const PITCH_MAX = PIANO_PITCH_MAX;

// Base layout defaults for the editor canvas.
export const DEFAULT_ROW_HEIGHT = 20;
export const DEFAULT_STEP_WIDTH = 24;
export const MIN_STEP_WIDTH = 10;
export const MAX_STEP_WIDTH = 72;
export const GRID_HEADER_HEIGHT = 28;

// Grid math helpers for rhythmic divisions.
export const STEPS_PER_BEAT = 4;
export const STEPS_PER_BAR = STEPS_PER_BEAT * 4;

// Editing constraints and interaction thresholds.
export const MIN_FREE_LENGTH = 1 / 12;
export const SNAP_EPSILON = 0.0001;
export const MARQUEE_MIN_DRAG = 4;

// Default playback/edit values for sample-backed notes.
export const DEFAULT_SAMPLE_MIDI_PITCH = 72;
export const DEFAULT_NOTE_VELOCITY = 95;

// Velocity lane min/max heights for resize behavior.
export const MIN_VELOCITY_LANE_HEIGHT = 72;
export const MAX_VELOCITY_LANE_HEIGHT = 2400;

// Snap presets presented in the toolbar.
export const SNAP_OPTIONS = [
  { key: "none", label: "(none)", stepSize: null },
  { key: "1-6-step", label: "1/6 step", stepSize: 1 / 6 },
  { key: "1-4-step", label: "1/4 step", stepSize: 1 / 4 },
  { key: "1-3-step", label: "1/3 step", stepSize: 1 / 3 },
  { key: "1-2-step", label: "1/2 step", stepSize: 1 / 2 },
  { key: "step", label: "Step", stepSize: 1 },
  { key: "1-6-beat", label: "1/6 beat", stepSize: 2 / 3 },
  { key: "1-4-beat", label: "1/4 beat", stepSize: 1 },
  { key: "1-3-beat", label: "1/3 beat", stepSize: 4 / 3 },
  { key: "1-2-beat", label: "1/2 beat", stepSize: 2 },
  { key: "beat", label: "Beat", stepSize: 4 },
  { key: "bar", label: "Bar", stepSize: 16 },
];

// Scale root options used by scale highlighting and note movement.
export const SCALE_ROOTS = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

// Supported scale types with semitone intervals from the root note.
export const SCALE_TYPES = [
  {
    key: "minor",
    label: "Minor",
    intervals: [0, 2, 3, 5, 7, 8, 10],
  },
  {
    key: "major",
    label: "Major",
    intervals: [0, 2, 4, 5, 7, 9, 11],
  },
];
