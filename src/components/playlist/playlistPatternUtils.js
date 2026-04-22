import { C5_PITCH } from "../../utils/patternNotes";

const MIDI_PITCH_MIN = 0;
const MIDI_PITCH_MAX = 127;

// Merges step-grid and piano-preview notes into one compact preview list.
export function getPatternPreviewNotes(pattern) {
  if (!pattern) {
    return [];
  }

  const patternLength = Math.max(1, pattern.lengthSteps || 16);
  const merged = [];

  Object.entries(pattern.stepGrid || {}).forEach(function ([channelId, row]) {
    (row || []).forEach(function (isOn, stepIndex) {
      if (!isOn) {
        return;
      }

      merged.push({
        id: "step-" + channelId + "-" + stepIndex,
        start: stepIndex,
        length: 1,
        pitch: C5_PITCH,
      });
    });
  });

  Object.entries(pattern.pianoPreview || {}).forEach(function ([
    channelId,
    notes,
  ]) {
    (notes || []).forEach(function (note) {
      const start = Math.max(
        0,
        Math.min(patternLength - 0.0625, Number(note.start || 0)),
      );
      const maxLen = Math.max(0.0625, patternLength - start);
      merged.push({
        id:
          note.id ||
          "piano-" +
            channelId +
            "-" +
            String(note.start) +
            "-" +
            String(note.pitch),
        start,
        length: Math.max(0.0625, Math.min(maxLen, Number(note.length || 1))),
        pitch: Math.round(note.pitch || C5_PITCH),
      });
    });
  });

  merged.sort(function (a, b) {
    if (a.start !== b.start) {
      return a.start - b.start;
    }

    return b.pitch - a.pitch;
  });

  return merged.map(function (note) {
    return {
      ...note,
      pitch: Math.max(
        MIDI_PITCH_MIN,
        Math.min(MIDI_PITCH_MAX, Math.round(note.pitch || C5_PITCH)),
      ),
    };
  });
}
