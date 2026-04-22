import { useEffect, useRef, useState } from "react";
import { useDispatch } from "react-redux";
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
import { ChannelRackTopBar } from "./channel-rack/ChannelRackTopBar";
import { useChannelRackMidiDrop } from "./channel-rack/useChannelRackMidiDrop";
import { useChannelRackOverlayDismiss } from "./channel-rack/useChannelRackOverlayDismiss";
import { useChannelRackDerivedState } from "./channel-rack/useChannelRackDerivedState";
import {
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

  const {
    activePatternId,
    patterns,
    activePattern,
    activePatternColor,
    channels,
    mixerInserts,
    isPlaying,
    bpm,
    channelRackMode,
    patternLength,
    playheadStep,
    insertLabelById,
    stepsPerBeat,
    clampFn,
  } = useChannelRackDerivedState();

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
          String(clampFn(ratio, 0, 1)),
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
      const stepDurationMs = (60 / Math.max(1, bpm) / stepsPerBeat) * 1000;

      const tick = function () {
        const elapsed = performance.now() - playheadStepTimestampRef.current;
        const progress = clampFn(elapsed / stepDurationMs, 0, 0.999);
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
    [isPlaying, bpm, patternLength, stepsPerBeat, clampFn],
  );

  useChannelRackOverlayDismiss({
    isPatternMenuOpen,
    openInsertMenuChannelId,
    channelContextMenu,
    channelRenamePanel,
    setIsPatternMenuOpen,
    setOpenInsertMenuChannelId,
    setChannelContextMenu,
    setChannelRenamePanel,
  });

  const { onMidiPatternDragOver, onMidiPatternDrop } = useChannelRackMidiDrop({
    activePatternId,
    dispatch,
    dataTransferHasMidiPatternPayloadFn: dataTransferHasMidiPatternPayload,
    dataTransferHasMidiFilePayloadFn: dataTransferHasMidiFilePayload,
    readMidiPatternFromDataTransferFn: readMidiPatternFromDataTransfer,
    readMidiFilePayloadFromDataTransferFn: readMidiFilePayloadFromDataTransfer,
    parseMidiArrayBufferToStepNotesFn: parseMidiArrayBufferToStepNotes,
    isMidiFileNameFn: isMidiFileName,
    pasteMidiPatternToChannelAction: pasteMidiPatternToChannel,
  });

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
      <ChannelRackTopBar
        isPatternMenuOpen={isPatternMenuOpen}
        activePatternColor={activePatternColor}
        activePatternName={activePattern?.name || "Pattern"}
        patterns={patterns}
        activePatternId={activePatternId}
        onTogglePatternMenu={function () {
          setIsPatternMenuOpen(function (value) {
            const next = !value;
            if (next) {
              setOpenInsertMenuChannelId(null);
            }
            return next;
          });
        }}
        onSelectPattern={function (patternId) {
          dispatch(setActivePattern(patternId));
          setIsPatternMenuOpen(false);
        }}
        onAddPattern={function () {
          dispatch(createPattern());
        }}
        onAddChannel={function () {
          dispatch(addChannel());
        }}
        channelRackMode={channelRackMode}
        patternLength={patternLength}
        onSetMode={function (mode) {
          dispatch(setChannelRackMode(mode));
        }}
        onAdjustPatternLength={function (delta) {
          dispatch(
            setPatternLength({
              patternId: activePatternId,
              length: patternLength + delta,
            }),
          );
        }}
        onPatternLengthInput={function (event) {
          dispatch(
            setPatternLength({
              patternId: activePatternId,
              length: Number(event.target.value),
            }),
          );
        }}
      />

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
