import { memo } from "react";
import {
  MIDI_PITCH_MAX,
  MIDI_PITCH_MIN,
  PREVIEW_TOP_MAX_PERCENT,
  PREVIEW_TOP_MIN_PERCENT,
} from "./channelRackUtils";
import { C5_PITCH } from "../../utils/patternNotes";

/**
 * Mini piano-roll preview inside a channel row.
 * Renders tiny bars representing note start / length / pitch.
 * Clicking opens the full Piano Roll.
 */
export const ChannelRackPianoPreview = memo(function ChannelRackPianoPreview({
  channel,
  patternLength,
  notes,
  hasAnyNotes,
  notePitchBounds,
  notePitchRange,
  channelGridWidthPx,
  onMidiPatternDragOver,
  onMidiPatternDrop,
  onOpenPianoRoll,
}) {
  return (
    <button
      className="piano-preview"
      style={{ width: channelGridWidthPx + "px" }}
      onDragOver={onMidiPatternDragOver}
      onDrop={function (event) {
        void onMidiPatternDrop(event, channel);
      }}
      onClick={function () {
        onOpenPianoRoll(channel.id);
      }}
    >
      {hasAnyNotes ? <span className="piano-preview-playhead" /> : null}
      {notes.map(function (note) {
        const left = (note.start / patternLength) * 100;
        const width = (note.length / patternLength) * 100;
        const pitch = Math.max(
          MIDI_PITCH_MIN,
          Math.min(MIDI_PITCH_MAX, Math.round(note.pitch || C5_PITCH)),
        );
        const pitchRatio =
          notePitchRange <= 0
            ? 0.5
            : (notePitchBounds.max - pitch) / notePitchRange;
        const top =
          PREVIEW_TOP_MIN_PERCENT +
          pitchRatio * (PREVIEW_TOP_MAX_PERCENT - PREVIEW_TOP_MIN_PERCENT);

        return (
          <span
            key={note.id}
            className="mini-note"
            style={{
              left: left + "%",
              width: width + "%",
              top: top + "%",
            }}
          />
        );
      })}
      <span className="piano-hint">Open Piano Roll</span>
    </button>
  );
});
