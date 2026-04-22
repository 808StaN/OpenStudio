import { memo, useMemo } from "react";

const MIDI_PITCH_MIN = 0;
const MIDI_PITCH_MAX = 127;
const C5_PITCH = 72;

// Renders mini note blocks inside a pattern clip so users can read content at a glance.
export const ClipPreviewNotes = memo(function ClipPreviewNotes(props) {
  const { clipId, previewNotes, clipLengthSteps, patternLength, clipOffsetSteps } =
    props;

  const renderedPreviewNotes = useMemo(
    function () {
      const visibleNotes = [];
      const visiblePatternStart = Math.max(
        0,
        Math.min(patternLength, Number(clipOffsetSteps || 0)),
      );
      const visiblePatternEnd = Math.max(
        visiblePatternStart,
        Math.min(patternLength, visiblePatternStart + clipLengthSteps),
      );
      let minPitch = Infinity;
      let maxPitch = -Infinity;

      // First pass: keep only notes visible in the current clip window.
      for (let noteIndex = 0; noteIndex < previewNotes.length; noteIndex += 1) {
        const note = previewNotes[noteIndex];
        const noteStart = Number(note.start || 0);
        const noteEnd = noteStart + Math.max(0.0625, Number(note.length || 1));
        const visibleStart = Math.max(noteStart, visiblePatternStart);
        const visibleEnd = Math.min(noteEnd, visiblePatternEnd);

        if (visibleEnd <= visibleStart) {
          continue;
        }

        const noteLength = Math.max(0.0625, visibleEnd - visibleStart);
        const pitch = Math.max(
          MIDI_PITCH_MIN,
          Math.min(MIDI_PITCH_MAX, Math.round(note.pitch || C5_PITCH)),
        );

        minPitch = Math.min(minPitch, pitch);
        maxPitch = Math.max(maxPitch, pitch);
        visibleNotes.push({
          id: note.id,
          noteIndex,
          left: ((visibleStart - visiblePatternStart) / clipLengthSteps) * 100,
          width: Math.max(0.8, (noteLength / clipLengthSteps) * 100),
          pitch,
        });
      }

      if (visibleNotes.length === 0) {
        return [];
      }

      const pitchRange = maxPitch - minPitch;

      // Second pass: map notes to normalized vertical slots for stable rendering.
      return visibleNotes.slice(0, 700).map(function (note) {
        const pitchRatio =
          pitchRange <= 0 ? 0.5 : (maxPitch - note.pitch) / pitchRange;
        const top = 6 + pitchRatio * 88;

        return (
          <span
            key={clipId + "-" + note.id + "-" + note.noteIndex}
            className="clip-mini-note"
            style={{
              left: note.left + "%",
              width: note.width + "%",
              top: top + "%",
            }}
          />
        );
      });
    },
    [clipId, previewNotes, clipLengthSteps, patternLength, clipOffsetSteps],
  );

  return <div className="clip-note-preview">{renderedPreviewNotes}</div>;
});
