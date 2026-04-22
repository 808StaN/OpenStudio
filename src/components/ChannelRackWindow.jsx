import { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  addChannel,
  renameChannel,
  duplicateChannel,
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
  pasteMidiPatternToChannel,
  setChannelSolo,
  setChannelVolume,
  removeChannel,
  toggleStep,
} from "../store";
import {
  dataTransferHasMidiPatternPayload,
  readMidiPatternFromDataTransfer,
} from "../utils/midiPattern";
import {
  dataTransferHasMidiFilePayload,
  isMidiFileName,
  parseMidiArrayBufferToStepNotes,
  readMidiFilePayloadFromDataTransfer,
} from "../utils/midiImport";
import { ChannelRackRow } from "./channel-rack/ChannelRackRow";
import {
  ChannelContextMenuPanel,
  ChannelRenamePanel,
} from "./channel-rack/ChannelRackContextPanels";
import {
  DEFAULT_PATTERN_COLOR,
  STEPS_PER_BEAT,
  clamp,
  getInsertLabel,
  resolveChannelMenuPosition,
} from "./channel-rack/channelRackUtils";

export function ChannelRackWindow() {
  const dispatch = useDispatch();
  const rackShellRef = useRef(null);
  const playheadStepRef = useRef(0);
  const playheadStepTimestampRef = useRef(0);
  const [isPatternMenuOpen, setIsPatternMenuOpen] = useState(false);
  const [openInsertMenuChannelId, setOpenInsertMenuChannelId] = useState(null);
  const [channelContextMenu, setChannelContextMenu] = useState(null);
  const [channelRenamePanel, setChannelRenamePanel] = useState(null);

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
  const activePatternColor = String(activePattern?.color || DEFAULT_PATTERN_COLOR);
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

  const insertLabelById = useMemo(
    function () {
      return mixerInserts.reduce(function (acc, insert, index) {
        acc[insert.id] = getInsertLabel(insert, index);
        return acc;
      }, {});
    },
    [mixerInserts],
  );

  useEffect(
    function () {
      if (
        !isPatternMenuOpen &&
        !openInsertMenuChannelId &&
        !channelContextMenu &&
        !channelRenamePanel
      ) {
        return;
      }

      const onPointerDown = function (event) {
        const target = event.target;
        if (!(target instanceof HTMLElement)) {
          setIsPatternMenuOpen(false);
          setOpenInsertMenuChannelId(null);
          return;
        }

        if (target.closest(".rack-modern-select")) {
          return;
        }
        if (target.closest(".rack-channel-context-menu")) {
          return;
        }
        if (target.closest(".rack-channel-rename-panel")) {
          return;
        }

        setIsPatternMenuOpen(false);
        setOpenInsertMenuChannelId(null);
        setChannelContextMenu(null);
        setChannelRenamePanel(null);
      };

      const onKeyDown = function (event) {
        if (event.key !== "Escape") {
          return;
        }

        setIsPatternMenuOpen(false);
        setOpenInsertMenuChannelId(null);
        setChannelContextMenu(null);
        setChannelRenamePanel(null);
      };

      window.addEventListener("mousedown", onPointerDown);
      window.addEventListener("keydown", onKeyDown);

      return function () {
        window.removeEventListener("mousedown", onPointerDown);
        window.removeEventListener("keydown", onKeyDown);
      };
    },
    [isPatternMenuOpen, openInsertMenuChannelId, channelContextMenu, channelRenamePanel],
  );

  const onMidiPatternDragOver = function (event) {
    const hasMidiPatternType = dataTransferHasMidiPatternPayload(
      event.dataTransfer,
    );
    const hasMidiFileType = dataTransferHasMidiFilePayload(event.dataTransfer);
    const payload = readMidiPatternFromDataTransfer(event.dataTransfer);
    const midiFilePayload = readMidiFilePayloadFromDataTransfer(
      event.dataTransfer,
    );
    const droppedFile = Array.from(event.dataTransfer?.files || []).find(
      function (file) {
        return isMidiFileName(file?.name);
      },
    );

    if (
      hasMidiPatternType ||
      hasMidiFileType ||
      payload ||
      midiFilePayload ||
      droppedFile
    ) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    }
  };

  const onMidiPatternDrop = async function (event, channel) {
    if (!channel) {
      return;
    }

    const payload = readMidiPatternFromDataTransfer(event.dataTransfer);
    const midiFilePayload = readMidiFilePayloadFromDataTransfer(
      event.dataTransfer,
    );
    const droppedFile = Array.from(event.dataTransfer?.files || []).find(
      function (file) {
        return isMidiFileName(file?.name);
      },
    );

    if (!payload && !midiFilePayload && !droppedFile) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (payload) {
      dispatch(
        pasteMidiPatternToChannel({
          patternId: activePatternId,
          channelId: channel.id,
          notes: payload.notes,
        }),
      );
      return;
    }

    if (midiFilePayload?.midiPath) {
      try {
        const response = await fetch(midiFilePayload.midiPath, {
          cache: "no-store",
        });
        if (!response.ok) {
          return;
        }

        const bytes = await response.arrayBuffer();
        const notes = parseMidiArrayBufferToStepNotes(bytes);
        if (notes.length === 0) {
          return;
        }

        dispatch(
          pasteMidiPatternToChannel({
            patternId: activePatternId,
            channelId: channel.id,
            notes,
          }),
        );
      } catch {
        return;
      }

      return;
    }

    if (!droppedFile) {
      return;
    }

    try {
      const bytes = await droppedFile.arrayBuffer();
      const notes = parseMidiArrayBufferToStepNotes(bytes);
      if (notes.length === 0) {
        return;
      }

      dispatch(
        pasteMidiPatternToChannel({
          patternId: activePatternId,
          channelId: channel.id,
          notes,
        }),
      );
    } catch {
      return;
    }
  };

  const onAssignPluginToChannel = function (channelId, payload) {
    dispatch(
      assignPluginToChannel({
        channelId,
        pluginRef: payload.pluginRef,
        pluginName: payload.pluginName,
      }),
    );
  };

  const onAssignSampleToChannel = function (channelId, payload) {
    dispatch(
      assignSampleToChannel({
        channelId,
        sampleRef: payload.samplePath || payload.file,
        sampleName: payload.file,
      }),
    );
  };

  const onOpenSampleSettings = function (channelId) {
    setChannelContextMenu(null);
    dispatch(setActiveChannel(channelId));
    dispatch(openWindow("sampleSettings"));
  };

  const onOpenChannelContextMenu = function (channelId, buttonRect) {
    const shellRect = rackShellRef.current?.getBoundingClientRect() || {
      left: 0,
      top: 0,
      width: window.innerWidth,
      height: window.innerHeight,
    };
    const position = resolveChannelMenuPosition(buttonRect, shellRect);

    dispatch(setActiveChannel(channelId));
    setIsPatternMenuOpen(false);
    setOpenInsertMenuChannelId(null);
    setChannelRenamePanel(null);
    setChannelContextMenu({
      channelId,
      x: position.x,
      y: position.y,
    });
  };

  const onToggleInsertMenu = function (channelId) {
    setOpenInsertMenuChannelId(function (value) {
      const next = value === channelId ? null : channelId;
      if (next) {
        setIsPatternMenuOpen(false);
      }
      return next;
    });
  };

  const onAssignMixerInsert = function (channelId, insertId) {
    dispatch(
      setChannelMixerInsert({
        channelId,
        insertId,
      }),
    );
    setOpenInsertMenuChannelId(null);
  };

  const onOpenPianoRoll = function (channelId) {
    dispatch(setActiveChannel(channelId));
    dispatch(openWindow("pianoRoll"));
  };

  const onTogglePatternStep = function (patternId, channelId, stepIndex) {
    dispatch(
      toggleStep({
        patternId,
        channelId,
        stepIndex,
      }),
    );
  };

  const onSaveRenamePanel = function () {
    const nextName = String(channelRenamePanel?.value || "").trim();
    if (!nextName) {
      setChannelRenamePanel(null);
      return;
    }
    dispatch(
      renameChannel({
        channelId: channelRenamePanel.channelId,
        name: nextName,
      }),
    );
    setChannelRenamePanel(null);
  };

  return (
    <section className="rack-shell" ref={rackShellRef}>
      <header className="rack-topbar">
        <div className="rack-pattern-picker-wrap">
          <div
            className={
              "rack-pattern-picker rack-modern-select" +
              (isPatternMenuOpen ? " is-open" : "")
            }
          >
            <button
              type="button"
              className="rack-modern-select-trigger"
              aria-label="Active pattern"
              onClick={function () {
                setIsPatternMenuOpen(function (value) {
                  const next = !value;
                  if (next) {
                    setOpenInsertMenuChannelId(null);
                  }
                  return next;
                });
              }}
            >
              <span className="rack-modern-select-value">
                <span style={{ color: activePatternColor }}>
                  {activePattern?.name || "Pattern"}
                </span>
              </span>
              <span className="rack-modern-select-caret">v</span>
            </button>
            {isPatternMenuOpen ? (
              <div className="rack-modern-select-dropdown">
                {patterns.map(function (pattern) {
                  const isActive = pattern.id === activePatternId;
                  return (
                    <button
                      key={pattern.id}
                      type="button"
                      className={
                        "rack-modern-select-option" + (isActive ? " is-active" : "")
                      }
                      style={
                        isActive
                          ? null
                          : { color: String(pattern.color || DEFAULT_PATTERN_COLOR) }
                      }
                      onClick={function () {
                        dispatch(setActivePattern(pattern.id));
                        setIsPatternMenuOpen(false);
                      }}
                    >
                      {pattern.name}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
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
            return (
              <ChannelRackRow
                key={channel.id}
                channel={channel}
                activePattern={activePattern}
                activePatternId={activePatternId}
                patternLength={patternLength}
                channelRackMode={channelRackMode}
                isPlaying={isPlaying}
                playheadStep={playheadStep}
                openInsertMenuChannelId={openInsertMenuChannelId}
                mixerInserts={mixerInserts}
                insertLabelById={insertLabelById}
                onActivateChannel={function (channelId) {
                  dispatch(setActiveChannel(channelId));
                }}
                onAssignPluginToChannel={onAssignPluginToChannel}
                onAssignSampleToChannel={onAssignSampleToChannel}
                onToggleMute={function (channelId, value) {
                  dispatch(setChannelMute({ channelId, value }));
                }}
                onToggleSolo={function (channelId, value) {
                  dispatch(setChannelSolo({ channelId, value }));
                }}
                onSetVolume={function (channelId, value) {
                  dispatch(setChannelVolume({ channelId, value }));
                }}
                onSetPan={function (channelId, value) {
                  dispatch(setChannelPan({ channelId, value }));
                }}
                onOpenSampleSettings={onOpenSampleSettings}
                onOpenChannelContextMenu={onOpenChannelContextMenu}
                onToggleInsertMenu={onToggleInsertMenu}
                onAssignMixerInsert={onAssignMixerInsert}
                onMidiPatternDragOver={onMidiPatternDragOver}
                onMidiPatternDrop={onMidiPatternDrop}
                onOpenPianoRoll={onOpenPianoRoll}
                onToggleStep={onTogglePatternStep}
              />
            );
          })}
        </div>
      </div>
      <ChannelContextMenuPanel
        channelContextMenu={channelContextMenu}
        channelsCount={channels.length}
        onCloneChannel={function () {
          dispatch(duplicateChannel(channelContextMenu.channelId));
          setChannelContextMenu(null);
        }}
        onRemoveChannel={function () {
          if (channels.length <= 1) {
            return;
          }
          dispatch(removeChannel(channelContextMenu.channelId));
          setChannelContextMenu(null);
        }}
        onBeginRenameChannel={function () {
          const channel = channels.find(function (item) {
            return item.id === channelContextMenu.channelId;
          });
          const currentName = String(channel?.name || "").trim() || "Channel";
          setChannelRenamePanel({
            channelId: channelContextMenu.channelId,
            x: channelContextMenu.x + 12,
            y: channelContextMenu.y + 8,
            value: currentName,
          });
          setChannelContextMenu(null);
        }}
      />
      <ChannelRenamePanel
        renamePanel={channelRenamePanel}
        onChangeValue={function (event) {
          const nextValue = String(event.target.value || "");
          setChannelRenamePanel(function (previous) {
            if (!previous) {
              return previous;
            }
            return {
              ...previous,
              value: nextValue,
            };
          });
        }}
        onKeyDown={function (event) {
          if (event.key === "Escape") {
            event.preventDefault();
            setChannelRenamePanel(null);
            return;
          }
          if (event.key !== "Enter") {
            return;
          }
          event.preventDefault();
          onSaveRenamePanel();
        }}
        onSave={onSaveRenamePanel}
        onCancel={function () {
          setChannelRenamePanel(null);
        }}
      />
    </section>
  );
}
