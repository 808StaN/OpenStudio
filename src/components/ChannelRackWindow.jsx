import { useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  addChannel,
  assignPluginToChannel,
  createPattern,
  assignSampleToChannel,
  openWindow,
  setActivePattern,
  setActiveChannel,
  setChannelRackMode,
  setChannelMute,
  setChannelMixerInsert,
  setChannelPan,
  setPatternLength,
  setChannelSolo,
  setChannelVolume,
  toggleStep,
} from "../store";
import { getPluginInstrument } from "../data/pluginInstruments";
import { C5_PITCH, getChannelMergedNotes } from "../utils/patternNotes";

const MIDI_PITCH_MIN = 0;
const MIDI_PITCH_MAX = 127;
const PREVIEW_TOP_MIN_PERCENT = 9;
const PREVIEW_TOP_MAX_PERCENT = 91;
const STEP_CELL_WIDTH_PX = 24;
const STEP_CELL_GAP_PX = 5;
const STEPS_PER_BEAT = 4;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function isMelodyShapeNote(note) {
  const pitch = Math.round(Number(note.pitch || C5_PITCH));
  const length = Number(note.length || 1);

  return pitch !== C5_PITCH || Math.abs(length - 1) > 0.0001;
}

export function ChannelRackWindow() {
  const dispatch = useDispatch();
  const rackShellRef = useRef(null);
  const playheadStepRef = useRef(0);
  const playheadStepTimestampRef = useRef(0);

  const activePatternId = useSelector(function (state) {
    return state.daw.project.activePatternId;
  });
  const patterns = useSelector(function (state) {
    return state.daw.project.patterns;
  });
  const activePattern = useSelector(function (state) {
    return state.daw.project.patterns.find(function (item) {
      return item.id === activePatternId;
    });
  });
  const channels = useSelector(function (state) {
    return state.daw.project.channels;
  });
  const mixerInserts = useSelector(function (state) {
    return state.daw.mixer.inserts.filter(function (insert) {
      return !insert.isMaster;
    });
  });
  const playhead = useSelector(function (state) {
    return state.daw.transport.currentStep16;
  });
  const isPlaying = useSelector(function (state) {
    return state.daw.transport.isPlaying;
  });
  const bpm = useSelector(function (state) {
    return state.daw.transport.bpm;
  });
  const channelRackMode = useSelector(function (state) {
    return state.daw.ui.channelRackMode;
  });
  const patternLength = Math.max(4, activePattern?.lengthSteps || 16);
  const normalizedPlayheadStep =
    ((playhead % patternLength) + patternLength) % patternLength;
  const playheadStep = isPlaying
    ? (normalizedPlayheadStep - 1 + patternLength) % patternLength
    : normalizedPlayheadStep;

  useEffect(
    function () {
      if (playheadStepRef.current === playheadStep) {
        return;
      }

      playheadStepRef.current = playheadStep;
      playheadStepTimestampRef.current = performance.now();
    },
    [playheadStep],
  );

  useEffect(
    function () {
      const shellElement = rackShellRef.current;
      if (!shellElement) {
        return;
      }

      const setPlayheadRatio = function (ratio) {
        shellElement.style.setProperty(
          "--rack-playhead-ratio",
          String(clamp(ratio, 0, 1)),
        );
      };

      const currentBaseStep =
        ((playheadStepRef.current % patternLength) + patternLength) %
        patternLength;

      if (!isPlaying) {
        setPlayheadRatio(currentBaseStep / patternLength);
        return;
      }

      if (playheadStepTimestampRef.current <= 0) {
        playheadStepTimestampRef.current = performance.now();
      }

      let rafId = 0;
      const stepDurationMs = (60 / Math.max(1, bpm) / STEPS_PER_BEAT) * 1000;

      const tick = function () {
        const elapsed = performance.now() - playheadStepTimestampRef.current;
        const progress = clamp(elapsed / stepDurationMs, 0, 0.999);
        const baseStep =
          ((playheadStepRef.current % patternLength) + patternLength) %
          patternLength;

        setPlayheadRatio((baseStep + progress) / patternLength);
        rafId = requestAnimationFrame(tick);
      };

      tick();

      return function () {
        cancelAnimationFrame(rafId);
      };
    },
    [isPlaying, bpm, patternLength],
  );

  const getInsertLabel = function (insert, index) {
    const fromName = String(insert.name || "").replace(/^insert\b/i, "Insert");
    if (fromName && fromName !== insert.name) {
      return fromName;
    }

    const numericSuffix = String(insert.id || "").match(/insert-(\d+)/i)?.[1];
    if (numericSuffix) {
      return "Insert " + numericSuffix;
    }

    return "Insert " + (index + 1);
  };

  const handleRackKnobSpace = function (event) {
    if (event.code !== "Space" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    if (event.currentTarget && typeof event.currentTarget.blur === "function") {
      event.currentTarget.blur();
    }
  };

  return (
    <section className="rack-shell" ref={rackShellRef}>
      <header className="rack-topbar">
        <div className="rack-pattern-picker-wrap">
          <label className="rack-pattern-picker">
            <select
              value={activePatternId}
              aria-label="Active pattern"
              onChange={function (event) {
                dispatch(setActivePattern(event.target.value));
              }}
            >
              {patterns.map(function (pattern) {
                return (
                  <option key={pattern.id} value={pattern.id}>
                    {pattern.name}
                  </option>
                );
              })}
            </select>
          </label>
          <button
            className="rack-pattern-add"
            title="Add pattern"
            aria-label="Add pattern"
            onClick={function () {
              dispatch(createPattern());
            }}
          >
            +
          </button>
          <button
            className="rack-channel-add"
            title="Add channel"
            aria-label="Add channel"
            onClick={function () {
              dispatch(addChannel());
            }}
          >
            + Channel
          </button>
        </div>

        <div className="rack-topbar-controls">
          <div className="rack-mode-toggle">
            <button
              className={channelRackMode === "sequencer" ? "is-active" : ""}
              onClick={function () {
                dispatch(setChannelRackMode("sequencer"));
              }}
            >
              Sequencer
            </button>
            <button
              className={channelRackMode === "melody" ? "is-active" : ""}
              onClick={function () {
                dispatch(setChannelRackMode("melody"));
              }}
            >
              Melody Mode
            </button>
          </div>

          <div className="pattern-length-control">
            <span>Pattern Length</span>
            <button
              onClick={function () {
                dispatch(
                  setPatternLength({
                    patternId: activePatternId,
                    length: patternLength - 4,
                  }),
                );
              }}
            >
              -
            </button>
            <input
              type="number"
              min="4"
              max="128"
              step="1"
              value={patternLength}
              onChange={function (event) {
                dispatch(
                  setPatternLength({
                    patternId: activePatternId,
                    length: Number(event.target.value),
                  }),
                );
              }}
            />
            <button
              onClick={function () {
                dispatch(
                  setPatternLength({
                    patternId: activePatternId,
                    length: patternLength + 4,
                  }),
                );
              }}
            >
              +
            </button>
            <small>steps</small>
          </div>
        </div>
      </header>

      <div className="rack-scroll-area">
        <div className="rack-rows">
          {channels.map(function (channel) {
            const rawRow =
              (activePattern && activePattern.stepGrid[channel.id]) || [];
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
            const notePitchRange = hasPitchBounds
              ? notePitchBounds.max - notePitchBounds.min
              : 0;
            const pianoNotes = activePattern?.pianoPreview?.[channel.id] || [];
            const shouldAutoShowMelodyInSequencer =
              pianoNotes.some(isMelodyShapeNote);
            const showPianoPreview =
              channelRackMode === "melody" ||
              (channelRackMode === "sequencer" &&
                shouldAutoShowMelodyInSequencer);
            const channelGridWidthPx =
              patternLength * STEP_CELL_WIDTH_PX +
              Math.max(0, patternLength - 1) * STEP_CELL_GAP_PX;

            return (
              <article
                className="rack-row"
                key={channel.id}
                onMouseDown={function () {
                  dispatch(setActiveChannel(channel.id));
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
                      dispatch(
                        assignPluginToChannel({
                          channelId: channel.id,
                          pluginRef: payload.pluginRef,
                          pluginName: payload.pluginName,
                        }),
                      );
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
                    dispatch(
                      assignSampleToChannel({
                        channelId: channel.id,
                        sampleRef: payload.samplePath || payload.file,
                        sampleName: payload.file,
                      }),
                    );
                  } catch {
                    return;
                  }
                }}
              >
                <div className="rack-controls">
                  <button
                    className={"small-toggle" + (channel.muted ? " is-on" : "")}
                    onClick={function () {
                      dispatch(
                        setChannelMute({
                          channelId: channel.id,
                          value: !channel.muted,
                        }),
                      );
                    }}
                  >
                    M
                  </button>
                  <button
                    className={"small-toggle" + (channel.solo ? " is-on" : "")}
                    onClick={function () {
                      dispatch(
                        setChannelSolo({
                          channelId: channel.id,
                          value: !channel.solo,
                        }),
                      );
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
                      onKeyDown={handleRackKnobSpace}
                      onDoubleClick={function () {
                        dispatch(
                          setChannelVolume({
                            channelId: channel.id,
                            value: 1,
                          }),
                        );
                      }}
                      onChange={function (event) {
                        dispatch(
                          setChannelVolume({
                            channelId: channel.id,
                            value: Number(event.target.value),
                          }),
                        );
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
                      onKeyDown={handleRackKnobSpace}
                      onDoubleClick={function () {
                        dispatch(
                          setChannelPan({
                            channelId: channel.id,
                            value: 0,
                          }),
                        );
                      }}
                      onChange={function (event) {
                        dispatch(
                          setChannelPan({
                            channelId: channel.id,
                            value: Number(event.target.value),
                          }),
                        );
                      }}
                    />
                  </label>

                  <button
                    className="channel-name"
                    title={
                      channel.pluginRef
                        ? "Instrument: " +
                          (getPluginInstrument(channel.pluginRef)?.name ||
                            channel.name)
                        : channel.sampleRef || "Drop WAV from Browser"
                    }
                    onClick={function (event) {
                      event.stopPropagation();
                      dispatch(setActiveChannel(channel.id));
                      dispatch(openWindow("sampleSettings"));
                    }}
                  >
                    {channel.name}
                  </button>

                  <label className="channel-insert">
                    <select
                      className="channel-insert-select"
                      aria-label="Insert assignment"
                      value={channel.mixerInsertId || ""}
                      onChange={function (event) {
                        dispatch(
                          setChannelMixerInsert({
                            channelId: channel.id,
                            insertId: event.target.value,
                          }),
                        );
                      }}
                    >
                      {mixerInserts.map(function (insert, index) {
                        return (
                          <option key={insert.id} value={insert.id}>
                            {getInsertLabel(insert, index)}
                          </option>
                        );
                      })}
                    </select>
                  </label>
                </div>

                <div
                  className={
                    "rack-input " +
                    (showPianoPreview ? "rack-input-piano" : "rack-input-steps")
                  }
                >
                  {showPianoPreview ? (
                    <button
                      className="piano-preview"
                      style={{ width: channelGridWidthPx + "px" }}
                      onClick={function () {
                        dispatch(setActiveChannel(channel.id));
                        dispatch(openWindow("pianoRoll"));
                      }}
                    >
                      {showPianoPreview ? (
                        hasAnyNotes ? (
                          <span className="piano-preview-playhead" />
                        ) : null
                      ) : null}
                      {notes.map(function (note) {
                        const left = (note.start / patternLength) * 100;
                        const width = (note.length / patternLength) * 100;
                        const pitch = Math.max(
                          MIDI_PITCH_MIN,
                          Math.min(
                            MIDI_PITCH_MAX,
                            Math.round(note.pitch || C5_PITCH),
                          ),
                        );
                        const pitchRatio =
                          notePitchRange <= 0
                            ? 0.5
                            : (notePitchBounds.max - pitch) / notePitchRange;
                        const top =
                          PREVIEW_TOP_MIN_PERCENT +
                          pitchRatio *
                            (PREVIEW_TOP_MAX_PERCENT - PREVIEW_TOP_MIN_PERCENT);

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
                      style={{
                        gridTemplateColumns:
                          "repeat(" +
                          patternLength +
                          ", " +
                          STEP_CELL_WIDTH_PX +
                          "px)",
                      }}
                    >
                      {row.map(function (isOn, stepIndex) {
                        return (
                          <button
                            key={channel.id + "-" + stepIndex}
                            type="button"
                            className={
                              "step" +
                              (Math.floor(stepIndex / 4) % 2 === 0
                                ? " group-a"
                                : " group-b") +
                              (isOn ? " is-on" : "") +
                              (isPlaying &&
                              hasAnyStepNotes &&
                              playheadStep === stepIndex
                                ? " is-playhead"
                                : "")
                            }
                            onMouseDown={function (event) {
                              if (event.button === 0 && !isOn) {
                                dispatch(
                                  toggleStep({
                                    patternId: activePatternId,
                                    channelId: channel.id,
                                    stepIndex,
                                  }),
                                );
                              }

                              if (event.button === 2 && isOn) {
                                event.preventDefault();
                                dispatch(
                                  toggleStep({
                                    patternId: activePatternId,
                                    channelId: channel.id,
                                    stepIndex,
                                  }),
                                );
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
          })}
        </div>
      </div>
    </section>
  );
}
