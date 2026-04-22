import { getPluginInstrument } from "../../data/pluginInstruments";
import { C5_PITCH, getChannelMergedNotes } from "../../utils/patternNotes";
import {
  MIDI_PITCH_MAX,
  MIDI_PITCH_MIN,
  PREVIEW_TOP_MAX_PERCENT,
  PREVIEW_TOP_MIN_PERCENT,
  STEP_CELL_GAP_PX,
  STEP_CELL_WIDTH_PX,
  isMelodyShapeNote,
  getInsertLabel,
} from "./channelRackUtils";

// One channel row in Channel Rack: controls + step grid or piano preview.
export function ChannelRackRow(props) {
  const {
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
  } = props;

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
    {
      min: Infinity,
      max: -Infinity,
    },
  );
  const hasPitchBounds = Number.isFinite(notePitchBounds.min);
  const notePitchRange = hasPitchBounds ? notePitchBounds.max - notePitchBounds.min : 0;
  const pianoNotes = activePattern?.pianoPreview?.[channel.id] || [];
  const shouldAutoShowMelodyInSequencer = pianoNotes.some(isMelodyShapeNote);
  const showPianoPreview =
    channelRackMode === "melody" ||
    (channelRackMode === "sequencer" && shouldAutoShowMelodyInSequencer);
  const channelGridWidthPx =
    patternLength * STEP_CELL_WIDTH_PX +
    Math.max(0, patternLength - 1) * STEP_CELL_GAP_PX;

  return (
    <article
      className={
        "rack-row" + (openInsertMenuChannelId === channel.id ? " is-menu-open" : "")
      }
      key={channel.id}
      onMouseDown={function () {
        onActivateChannel(channel.id);
      }}
      onDragOver={function (event) {
        event.preventDefault();
      }}
      onDrop={function (event) {
        event.preventDefault();

        const rawPlugin = event.dataTransfer.getData("application/x-daw-plugin");
        if (rawPlugin) {
          try {
            const payload = JSON.parse(rawPlugin);
            onAssignPluginToChannel(channel.id, payload);
            return;
          } catch {
            return;
          }
        }

        const rawSample = event.dataTransfer.getData("application/x-daw-sample");
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
      <div className="rack-controls">
        <button
          className={"small-toggle" + (channel.muted ? " is-on" : "")}
          onClick={function () {
            onToggleMute(channel.id, !channel.muted);
          }}
        >
          M
        </button>
        <button
          className={"small-toggle" + (channel.solo ? " is-on" : "")}
          onClick={function () {
            onToggleSolo(channel.id, !channel.solo);
          }}
        >
          S
        </button>
        <label className="knob-label">
          Vol
          <input
            className="rack-knob"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={channel.volume}
            onDoubleClick={function () {
              onSetVolume(channel.id, 1);
            }}
            onChange={function (event) {
              onSetVolume(channel.id, Number(event.target.value));
            }}
          />
        </label>

        <label className="knob-label">
          Pan
          <input
            className="rack-knob"
            type="range"
            min="-1"
            max="1"
            step="0.01"
            value={channel.pan}
            onDoubleClick={function () {
              onSetPan(channel.id, 0);
            }}
            onChange={function (event) {
              onSetPan(channel.id, Number(event.target.value));
            }}
          />
        </label>

        <button
          className="channel-name"
          title={
            channel.pluginRef
              ? "Instrument: " +
                (getPluginInstrument(channel.pluginRef)?.name || channel.name)
              : channel.sampleRef || "Drop WAV from Browser"
          }
          onClick={function (event) {
            event.stopPropagation();
            onOpenSampleSettings(channel.id);
          }}
          onContextMenu={function (event) {
            event.preventDefault();
            event.stopPropagation();
            onOpenChannelContextMenu(channel.id, event.currentTarget.getBoundingClientRect());
          }}
        >
          {channel.name}
        </button>

        <label className="channel-insert">
          <div
            className={
              "channel-insert-select rack-modern-select" +
              (openInsertMenuChannelId === channel.id ? " is-open" : "")
            }
          >
            <button
              type="button"
              className="rack-modern-select-trigger"
              aria-label="Insert assignment"
              onClick={function (event) {
                event.stopPropagation();
                onToggleInsertMenu(channel.id);
              }}
            >
              <span className="rack-modern-select-value">
                {insertLabelById[channel.mixerInsertId] || "Insert 1"}
              </span>
              <span className="rack-modern-select-caret">v</span>
            </button>
            {openInsertMenuChannelId === channel.id ? (
              <div className="rack-modern-select-dropdown">
                {mixerInserts.map(function (insert, index) {
                  const label = getInsertLabel(insert, index);
                  const isActive = insert.id === channel.mixerInsertId;
                  return (
                    <button
                      key={insert.id}
                      type="button"
                      className={"rack-modern-select-option" + (isActive ? " is-active" : "")}
                      onClick={function (event) {
                        event.stopPropagation();
                        onAssignMixerInsert(channel.id, insert.id);
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </label>
      </div>

      <div className={"rack-input " + (showPianoPreview ? "rack-input-piano" : "rack-input-steps")}>
        {showPianoPreview ? (
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
                notePitchRange <= 0 ? 0.5 : (notePitchBounds.max - pitch) / notePitchRange;
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
        ) : (
          <div
            className="step-grid"
            onDragOver={onMidiPatternDragOver}
            onDrop={function (event) {
              void onMidiPatternDrop(event, channel);
            }}
            style={{
              gridTemplateColumns: "repeat(" + patternLength + ", " + STEP_CELL_WIDTH_PX + "px)",
            }}
          >
            {row.map(function (isOn, stepIndex) {
              return (
                <button
                  key={channel.id + "-" + stepIndex}
                  type="button"
                  className={
                    "step" +
                    (Math.floor(stepIndex / 4) % 2 === 0 ? " group-a" : " group-b") +
                    (isOn ? " is-on" : "") +
                    (isPlaying && hasAnyStepNotes && playheadStep === stepIndex ? " is-playhead" : "")
                  }
                  onMouseDown={function (event) {
                    if (event.button === 0 && !isOn) {
                      onToggleStep(activePatternId, channel.id, stepIndex);
                    }

                    if (event.button === 2 && isOn) {
                      event.preventDefault();
                      onToggleStep(activePatternId, channel.id, stepIndex);
                    }
                  }}
                  onContextMenu={function (event) {
                    event.preventDefault();
                  }}
                />
              );
            })}
          </div>
        )}
      </div>
    </article>
  );
}
