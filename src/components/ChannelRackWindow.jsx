import { useCallback, useEffect, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import {
  addChannel,
  createPattern,
  setActivePattern,
  setActiveChannel,
  setChannelRackMode,
  setChannelMute,
  setChannelPan,
  setPatternLength,
  pasteMidiPatternToChannel,
  setChannelSolo,
  setChannelVolume,
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
import { useChannelRackPlayheadAnimation } from "./channel-rack/useChannelRackPlayheadAnimation";
import { useChannelRackActions } from "./channel-rack/useChannelRackActions";

function formatPercentValue(value) {
  return Math.round(value * 100) + "%";
}

function formatSignedPercentValue(value) {
  const intValue = Math.round(value * 100);
  if (intValue > 0) {
    return "+" + intValue + "%";
  }
  return intValue + "%";
}

export function ChannelRackWindow() {
  const dispatch = useDispatch();
  const rackShellRef = useRef(null);
  const [isPatternMenuOpen, setIsPatternMenuOpen] = useState(false);
  const [openInsertMenuChannelId, setOpenInsertMenuChannelId] = useState(null);
  const [channelContextMenu, setChannelContextMenu] = useState(null);
  const [channelRenamePanel, setChannelRenamePanel] = useState(null);
  const [valueReadout, setValueReadout] = useState("");
  const clearReadoutTimeoutRef = useRef(null);

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

  useChannelRackPlayheadAnimation({
    rackShellRef,
    playheadStep,
    isPlaying,
    bpm,
    patternLength,
    stepsPerBeat,
    clampFn,
  });

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

  useEffect(function () {
    return function () {
      if (clearReadoutTimeoutRef.current) {
        clearTimeout(clearReadoutTimeoutRef.current);
      }
    };
  }, []);

  const showValueReadout = useCallback(function (text) {
    setValueReadout(text);

    if (clearReadoutTimeoutRef.current) {
      clearTimeout(clearReadoutTimeoutRef.current);
    }

    clearReadoutTimeoutRef.current = setTimeout(function () {
      setValueReadout("");
    }, 1700);
  }, []);

  const getChannelLabel = useCallback(function (channelId) {
    const channel = channels.find(function (item) {
      return item.id === channelId;
    });
    return String(channel?.name || "Channel").trim() || "Channel";
  }, [channels]);

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

  const {
    onAssignPluginToChannel,
    onAssignSampleToChannel,
    onOpenSampleSettings,
    onOpenChannelContextMenu,
    onToggleInsertMenu,
    onAssignMixerInsert,
    onOpenPianoRoll,
    onTogglePatternStep,
    onCloneChannel,
    onRemoveChannel,
    onBeginRenameChannel,
    onSaveRenamePanel,
    onRenamePanelChange,
    onRenamePanelKeyDown,
  } = useChannelRackActions({
    dispatch,
    rackShellRef,
    activePatternId,
    channels,
    channelContextMenu,
    channelRenamePanel,
    setIsPatternMenuOpen,
    setOpenInsertMenuChannelId,
    setChannelContextMenu,
    setChannelRenamePanel,
  });

  // Stable top-bar callbacks so the toolbar never re-renders unnecessarily.
  const handleTogglePatternMenu = useCallback(function () {
    setIsPatternMenuOpen(function (value) {
      const next = !value;
      if (next) {
        setOpenInsertMenuChannelId(null);
      }
      return next;
    });
  }, []);

  const handleSelectPattern = useCallback(function (patternId) {
    dispatch(setActivePattern(patternId));
    setIsPatternMenuOpen(false);
  }, [dispatch]);

  const handleAddPattern = useCallback(function () {
    dispatch(createPattern());
  }, [dispatch]);

  const handleAddChannel = useCallback(function () {
    dispatch(addChannel());
  }, [dispatch]);

  const handleSetMode = useCallback(function (mode) {
    dispatch(setChannelRackMode(mode));
  }, [dispatch]);

  const handleAdjustPatternLength = useCallback(function (delta) {
    dispatch(
      setPatternLength({
        patternId: activePatternId,
        length: patternLength + delta,
      }),
    );
  }, [dispatch, activePatternId, patternLength]);

  const handlePatternLengthInput = useCallback(function (event) {
    dispatch(
      setPatternLength({
        patternId: activePatternId,
        length: Number(event.target.value),
      }),
    );
  }, [dispatch, activePatternId]);

  // Stable row callbacks so every ChannelRackRow receives the same ref each render.
  const handleActivateChannel = useCallback(function (channelId) {
    dispatch(setActiveChannel(channelId));
  }, [dispatch]);

  const handleToggleMute = useCallback(function (channelId, value) {
    dispatch(setChannelMute({ channelId, value }));
  }, [dispatch]);

  const handleToggleSolo = useCallback(function (channelId, value) {
    dispatch(setChannelSolo({ channelId, value }));
  }, [dispatch]);

  const handleSetVolume = useCallback(function (channelId, value) {
    dispatch(setChannelVolume({ channelId, value }));
    showValueReadout(
      getChannelLabel(channelId) + " Volume: " + formatPercentValue(value),
    );
  }, [dispatch, getChannelLabel, showValueReadout]);

  const handleSetPan = useCallback(function (channelId, value) {
    dispatch(setChannelPan({ channelId, value }));
    showValueReadout(
      getChannelLabel(channelId) + " Pan: " + formatSignedPercentValue(value),
    );
  }, [dispatch, getChannelLabel, showValueReadout]);

  const handleCancelRename = useCallback(function () {
    setChannelRenamePanel(null);
  }, []);

  return (
    <section className="rack-shell" ref={rackShellRef}>
      <ChannelRackTopBar
        isPatternMenuOpen={isPatternMenuOpen}
        activePatternColor={activePatternColor}
        activePatternName={activePattern?.name || "Pattern"}
        patterns={patterns}
        activePatternId={activePatternId}
        onTogglePatternMenu={handleTogglePatternMenu}
        onSelectPattern={handleSelectPattern}
        onAddPattern={handleAddPattern}
        onAddChannel={handleAddChannel}
        channelRackMode={channelRackMode}
        patternLength={patternLength}
        onSetMode={handleSetMode}
        onAdjustPatternLength={handleAdjustPatternLength}
        onPatternLengthInput={handlePatternLengthInput}
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
                onActivateChannel={handleActivateChannel}
                onAssignPluginToChannel={onAssignPluginToChannel}
                onAssignSampleToChannel={onAssignSampleToChannel}
                onToggleMute={handleToggleMute}
                onToggleSolo={handleToggleSolo}
                onSetVolume={handleSetVolume}
                onSetPan={handleSetPan}
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
        onCloneChannel={onCloneChannel}
        onRemoveChannel={onRemoveChannel}
        onBeginRenameChannel={onBeginRenameChannel}
      />
      <ChannelRenamePanel
        renamePanel={channelRenamePanel}
        onChangeValue={onRenamePanelChange}
        onKeyDown={onRenamePanelKeyDown}
        onSave={onSaveRenamePanel}
        onCancel={handleCancelRename}
      />
      <div className={"rack-value-readout" + (valueReadout ? " is-visible" : "")}>
        {valueReadout}
      </div>
    </section>
  );
}
