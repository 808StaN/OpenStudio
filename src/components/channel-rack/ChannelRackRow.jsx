import { memo } from "react";
import { C5_PITCH, getChannelMergedNotes } from "../../utils/patternNotes";
import {
  MIDI_PITCH_MAX,
  MIDI_PITCH_MIN,
  STEP_CELL_GAP_PX,
  STEP_CELL_WIDTH_PX,
  isMelodyShapeNote,
} from "./channelRackUtils";
import { ChannelRackRowControls } from "./ChannelRackRowControls";
import { ChannelRackStepGrid } from "./ChannelRackStepGrid";
import { ChannelRackPianoPreview } from "./ChannelRackPianoPreview";

/**
 * Derives the visible step row, merged notes, pitch bounds and preview mode
 * for a single channel inside the active pattern.
 */
function useChannelRackRowData({
  channel,
  activePattern,
  patternLength,
  channelRackMode,
}) {
  const rawRow = (activePattern && activePattern.stepGrid[channel.id]) || [];
  const row = Array.from({ length: patternLength }, function (_, i) {
    return Boolean(rawRow[i]);
  });
  const hasAnyStepNotes = row.some(Boolean);

  const notes = getChannelMergedNotes(activePattern, channel.id);
  const hasAnyNotes = notes.length > 0;

  const notePitchBounds = notes.reduce(
    function (acc, note) {
      const pitch = Math.max(
        MIDI_PITCH_MIN,
        Math.min(MIDI_PITCH_MAX, Math.round(note.pitch || C5_PITCH)),
      );
      return {
        min: Math.min(acc.min, pitch),
        max: Math.max(acc.max, pitch),
      };
    },
    { min: Infinity, max: -Infinity },
  );
  const hasPitchBounds = Number.isFinite(notePitchBounds.min);
  const notePitchRange = hasPitchBounds
    ? notePitchBounds.max - notePitchBounds.min
    : 0;

  const pianoNotes = activePattern?.pianoPreview?.[channel.id] || [];
  const shouldAutoShowMelodyInSequencer = pianoNotes.some(isMelodyShapeNote);
  const showPianoPreview =
    channelRackMode === "melody" ||
    (channelRackMode === "sequencer" && shouldAutoShowMelodyInSequencer);

  const channelGridWidthPx =
    patternLength * STEP_CELL_WIDTH_PX +
    Math.max(0, patternLength - 1) * STEP_CELL_GAP_PX;

  return {
    row,
    hasAnyStepNotes,
    notes,
    hasAnyNotes,
    notePitchBounds,
    notePitchRange,
    showPianoPreview,
    channelGridWidthPx,
  };
}

/**
 * One channel row in the Channel Rack.
 * Composes controls, a step grid or mini piano preview, and drag-and-drop.
 * Wrapped in React.memo so the row only re-renders when its props change.
 */
export const ChannelRackRow = memo(function ChannelRackRow({
  channel,
  activePattern,
  activePatternId,
  patternLength,
  channelRackMode,
  isPlaying,
  playheadStep,
  openInsertMenuChannelId,
  mixerInserts,
  insertLabelById,
  onActivateChannel,
  onAssignPluginToChannel,
  onAssignSampleToChannel,
  onToggleMute,
  onToggleSolo,
  onSetVolume,
  onSetPan,
  onOpenSampleSettings,
  onOpenChannelContextMenu,
  onToggleInsertMenu,
  onAssignMixerInsert,
  onMidiPatternDragOver,
  onMidiPatternDrop,
  onOpenPianoRoll,
  onToggleStep,
}) {
  const {
    row,
    hasAnyStepNotes,
    notes,
    hasAnyNotes,
    notePitchBounds,
    notePitchRange,
    showPianoPreview,
    channelGridWidthPx,
  } = useChannelRackRowData({
    channel,
    activePattern,
    patternLength,
    channelRackMode,
  });

  return (
    <article
      className={
        "rack-row" +
        (openInsertMenuChannelId === channel.id ? " is-menu-open" : "")
      }
      onMouseDown={function () {
        onActivateChannel(channel.id);
      }}
      onDragOver={function (event) {
        event.preventDefault();
      }}
      onDrop={function (event) {
        event.preventDefault();

        const rawPlugin = event.dataTransfer.getData(
          "application/x-daw-plugin",
        );
        if (rawPlugin) {
          try {
            const payload = JSON.parse(rawPlugin);
            onAssignPluginToChannel(channel.id, payload);
            return;
          } catch {
            return;
          }
        }

        const rawSample = event.dataTransfer.getData(
          "application/x-daw-sample",
        );
        if (!rawSample) {
          return;
        }

        try {
          const payload = JSON.parse(rawSample);
          onAssignSampleToChannel(channel.id, payload);
        } catch {
          return;
        }
      }}
    >
      <ChannelRackRowControls
        channel={channel}
        mixerInserts={mixerInserts}
        insertLabelById={insertLabelById}
        openInsertMenuChannelId={openInsertMenuChannelId}
        onToggleMute={onToggleMute}
        onToggleSolo={onToggleSolo}
        onSetVolume={onSetVolume}
        onSetPan={onSetPan}
        onOpenSampleSettings={onOpenSampleSettings}
        onOpenChannelContextMenu={onOpenChannelContextMenu}
        onToggleInsertMenu={onToggleInsertMenu}
        onAssignMixerInsert={onAssignMixerInsert}
      />

      <div
        className={
          "rack-input " +
          (showPianoPreview ? "rack-input-piano" : "rack-input-steps")
        }
      >
        {showPianoPreview ? (
          <ChannelRackPianoPreview
            channel={channel}
            patternLength={patternLength}
            notes={notes}
            hasAnyNotes={hasAnyNotes}
            notePitchBounds={notePitchBounds}
            notePitchRange={notePitchRange}
            channelGridWidthPx={channelGridWidthPx}
            onMidiPatternDragOver={onMidiPatternDragOver}
            onMidiPatternDrop={onMidiPatternDrop}
            onOpenPianoRoll={onOpenPianoRoll}
          />
        ) : (
          <ChannelRackStepGrid
            channel={channel}
            activePatternId={activePatternId}
            patternLength={patternLength}
            row={row}
            isPlaying={isPlaying}
            hasAnyStepNotes={hasAnyStepNotes}
            playheadStep={playheadStep}
            onToggleStep={onToggleStep}
            onMidiPatternDragOver={onMidiPatternDragOver}
            onMidiPatternDrop={onMidiPatternDrop}
          />
        )}
      </div>
    </article>
  );
});
