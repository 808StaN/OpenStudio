export const C5_PITCH = 72;
export const PIANO_PITCH_MIN = 12; // C0
export const PIANO_PITCH_MAX = 132; // C10
const DEFAULT_NOTE_VELOCITY = 95;

export function getChannelMergedNotes(pattern, channelId) {
  if (!pattern) {
    return [];
  }

  const patternLength = Math.max(1, pattern.lengthSteps || 16);
  const merged = [];

  const stepRow = pattern.stepGrid?.[channelId] || [];
  stepRow.forEach(function (isOn, index) {
    if (!isOn) {
      return;
    }

    merged.push({
      id: "step-" + channelId + "-" + index,
      start: index,
      length: 1,
      pitch: C5_PITCH,
      velocity: DEFAULT_NOTE_VELOCITY,
      source: "step",
    });
  });

  const pianoNotes = pattern.pianoPreview?.[channelId] || [];
  pianoNotes.forEach(function (note) {
    const start = Math.max(
      0,
      Math.min(patternLength - 0.0625, Number(note.start || 0)),
    );
    const maxLen = Math.max(0.0625, patternLength - start);
    merged.push({
      id: note.id || "piano-" + channelId + "-" + note.start + "-" + note.pitch,
      start,
      length: Math.max(0.0625, Math.min(maxLen, Number(note.length || 1))),
      pitch: Math.round(note.pitch || C5_PITCH),
      velocity: Math.max(
        1,
        Math.min(
          127,
          Math.round(Number(note.velocity || DEFAULT_NOTE_VELOCITY)),
        ),
      ),
      source: "piano",
    });
  });

  merged.sort(function (a, b) {
    if (a.start !== b.start) {
      return a.start - b.start;
    }
    return b.pitch - a.pitch;
  });

  return merged;
}
