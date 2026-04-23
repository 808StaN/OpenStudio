const MIDI_VELOCITY_MAX = 127;
const DEFAULT_NOTE_VELOCITY = 95;
const DEFAULT_SAMPLE_MIDI_PITCH = 72;
const PITCH_CLASS_NAMES = [
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

// Shared numeric clamp for cursor math, note resize and velocity transforms.
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// Converts MIDI velocity [1..127] to UI percent [0..100].
export function midiVelocityToPercent(rawVelocity) {
  const safeMidi = clamp(
    Number(rawVelocity || DEFAULT_NOTE_VELOCITY),
    1,
    MIDI_VELOCITY_MAX,
  );
  return Math.round((safeMidi / MIDI_VELOCITY_MAX) * 100);
}

// Converts UI percent [0..100] back to MIDI velocity [1..127].
export function percentToMidiVelocity(rawPercent) {
  const safePercent = clamp(Number(rawPercent || 0), 0, 100);
  return Math.max(1, Math.round((safePercent / 100) * MIDI_VELOCITY_MAX));
}

// Quantizes timeline values by the current snap size with stable precision.
export function quantizeBySnap(value, snapSize) {
  if (!snapSize) {
    return Math.round(value * 1000) / 1000;
  }

  return Math.round(value / snapSize) * snapSize;
}

// Small epsilon compare used for drag/session updates.
export function isNearlyEqual(left, right, epsilon = 0.0001) {
  return Math.abs(left - right) <= epsilon;
}

// Converts MIDI pitch to note labels like C4, F#3 etc.
export function getNoteName(pitch) {
  const name = PITCH_CLASS_NAMES[pitch % 12];
  const octave = Math.floor(pitch / 12) - 1;
  return name + octave;
}

// Returns only the pitch class name (C, C#, D ... B).
export function getPitchClassName(pitch) {
  return PITCH_CLASS_NAMES[toPitchClass(pitch)];
}

// Normalizes pitch class for negative/overflow pitch math.
export function toPitchClass(pitch) {
  return ((pitch % 12) + 12) % 12;
}

// Generates deterministic-enough note ids for temporary/new note creation.
export function makeGeneratedNoteId(prefix) {
  return (
    prefix +
    "-" +
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 7)
  );
}

// Converts MIDI pitch delta around C5 to playback-rate ratio.
export function midiPitchToPlaybackRate(
  midiPitch,
  defaultMidiPitch = DEFAULT_SAMPLE_MIDI_PITCH,
) {
  const semitoneOffset = Number(midiPitch || defaultMidiPitch) - defaultMidiPitch;
  const rawRate = Math.pow(2, semitoneOffset / 12);
  return clamp(rawRate, 0.125, 8);
}

// Returns stable selection keys across step and piano note sources.
export function getNoteSelectionId(note) {
  if (note.source === "step") {
    return "step:" + note.start;
  }
  return "piano:" + note.id;
}

// Moves notes by nearest scale member while clamping to editor range.
export function moveByScaleStep(pitch, direction, pitchClassSet, minPitch, maxPitch) {
  let probe = pitch;
  for (let attempt = 0; attempt < 24; attempt += 1) {
    probe += direction;
    if (probe < minPitch || probe > maxPitch) {
      break;
    }
    if (pitchClassSet.has(toPitchClass(probe))) {
      return probe;
    }
  }

  return clamp(pitch + direction, minPitch, maxPitch);
}
