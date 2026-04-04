import { useDispatch, useSelector } from "react-redux";
import {
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
import {
  C5_PITCH,
  PIANO_PITCH_MAX,
  PIANO_PITCH_MIN,
  getChannelMergedNotes,
} from "../utils/patternNotes";

function isMelodyShapeNote(note) {
  const pitch = Math.round(Number(note.pitch || C5_PITCH));
  const length = Number(note.length || 1);

  return pitch !== C5_PITCH || Math.abs(length - 1) > 0.0001;
}

export function ChannelRackWindow() {
  const dispatch = useDispatch();

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
  const channelRackMode = useSelector(function (state) {
    return state.daw.ui.channelRackMode;
  });
  const patternLength = Math.max(4, activePattern?.lengthSteps || 16);

  const getInsertTrackLabel = function (insert, index) {
    const fromName = String(insert.name || "").replace(/^insert\b/i, "Track");
    if (fromName && fromName !== insert.name) {
      return fromName;
    }

    const numericSuffix = String(insert.id || "").match(/insert-(\d+)/i)?.[1];
    if (numericSuffix) {
      return "Track " + numericSuffix;
    }

    return "Track " + (index + 1);
  };

  return (
    <section className="rack-shell">
      <header className="rack-topbar">
        <div className="rack-pattern-picker-wrap">
          <label className="rack-pattern-picker">
            <span className="rack-pattern-picker-prefix">Pattern</span>
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
            const notes = getChannelMergedNotes(activePattern, channel.id);
            const pianoNotes = activePattern?.pianoPreview?.[channel.id] || [];
            const shouldAutoShowMelodyInSequencer =
              pianoNotes.some(isMelodyShapeNote);
            const showPianoPreview =
              channelRackMode === "melody" ||
              (channelRackMode === "sequencer" &&
                shouldAutoShowMelodyInSequencer);

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
                  const raw = event.dataTransfer.getData(
                    "application/x-daw-sample",
                  );
                  if (!raw) {
                    return;
                  }

                  try {
                    const payload = JSON.parse(raw);
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
                    title={channel.sampleRef || "Drop WAV from Browser"}
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
                      aria-label="Track assignment"
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
                            {getInsertTrackLabel(insert, index)}
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
                      onClick={function () {
                        dispatch(setActiveChannel(channel.id));
                        dispatch(openWindow("pianoRoll"));
                      }}
                    >
                      {notes.map(function (note) {
                        const left = (note.start / patternLength) * 100;
                        const width = (note.length / patternLength) * 100;
                        const clampedPitch = Math.max(
                          PIANO_PITCH_MIN,
                          Math.min(
                            PIANO_PITCH_MAX,
                            note.pitch || PIANO_PITCH_MIN,
                          ),
                        );
                        const pitchRange = Math.max(
                          1,
                          PIANO_PITCH_MAX - PIANO_PITCH_MIN,
                        );
                        const pitchRatio =
                          (PIANO_PITCH_MAX - clampedPitch) / pitchRange;
                        const top = 8 + pitchRatio * 84;

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
                          "repeat(" + patternLength + ", 24px)",
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
                              (isPlaying && playhead === stepIndex
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
