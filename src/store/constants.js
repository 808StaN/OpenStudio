// Domain-wide constants for the DAW state slice.
// These are used across reducers, audio scheduling, and project serialization.

export const FX_SLOT_EFFECT_NONE = "none";
export const FX_SLOT_EFFECT_GRAPHIC_EQ = "graphic-eq";
export const FX_SLOT_EFFECT_REVERB = "reverb";
export const FX_SLOT_EFFECT_MAXIMIZER = "maximizer";

export const SAMPLE_STRETCH_MODES = new Set([
  "none",
  "resample",
  "stretch",
  "realtime",
]);

export const SAMPLE_STRETCH_TIME_MODES = new Set([
  "none",
  "set-bpm",
  "project-tempo",
  "beat-1",
  "beat-2",
  "bar-1",
  "bar-2",
  "bar-3",
  "bar-4",
]);

export const DEFAULT_INSERT_SPECTRUM_BINS = 112;

export const GRAPHIC_EQ_DEFAULT_POINT_FREQUENCIES = [
  50, 100, 250, 500, 1000, 3000, 8000,
];

export const GRAPHIC_EQ_BAND_TYPES = [
  "peaking",
  "lowshelf",
  "highshelf",
  "lowpass",
  "highpass",
];

export const DEFAULT_MIDI_PITCH = 72;
export const DEFAULT_NOTE_VELOCITY = 95;

export const UI_THEME_DEFAULT = "default";
export const UI_THEME_MIDNIGHT = "midnight";
export const UI_THEMES = new Set([UI_THEME_DEFAULT, UI_THEME_MIDNIGHT]);

export const MAXIMIZER_MODES = ["irc-ll", "irc-i", "irc-ii", "irc-iii", "irc-iv"];

export const MIN_CLIP_BAR_LENGTH = 1 / 16;
export const MAX_PLAYLIST_BARS = 512;

export const DEFAULT_PATTERN_COLOR = "#4bef9f";

export const UNDO_HISTORY_LIMIT = 140;
