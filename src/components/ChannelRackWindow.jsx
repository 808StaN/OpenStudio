import { useRef, useState } from "react";
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

export function ChannelRackWindow() {
  const dispatch = useDispatch();
  const rackShellRef = useRef(null);
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
        onCloneChannel={onCloneChannel}
        onRemoveChannel={onRemoveChannel}
        onBeginRenameChannel={onBeginRenameChannel}
      />
      <ChannelRenamePanel
        renamePanel={channelRenamePanel}
        onChangeValue={onRenamePanelChange}
        onKeyDown={onRenamePanelKeyDown}
        onSave={onSaveRenamePanel}
        onCancel={function () {
          setChannelRenamePanel(null);
        }}
      />
    </section>
  );
}
