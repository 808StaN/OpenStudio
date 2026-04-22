import {
  assignPluginToChannel,
  assignSampleToChannel,
  duplicateChannel,
  openWindow,
  removeChannel,
  renameChannel,
  setActiveChannel,
  setChannelMixerInsert,
  toggleStep,
} from "../../store";
import { resolveChannelMenuPosition } from "./channelRackUtils";

export function useChannelRackActions({
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
}) {
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
    // Resolve menu inside rack bounds so it never renders outside the panel.
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
        patternId: patternId || activePatternId,
        channelId,
        stepIndex,
      }),
    );
  };

  const onCloneChannel = function () {
    if (!channelContextMenu) {
      return;
    }
    dispatch(duplicateChannel(channelContextMenu.channelId));
    setChannelContextMenu(null);
  };

  const onRemoveChannel = function () {
    if (!channelContextMenu) {
      return;
    }
    if (channels.length <= 1) {
      return;
    }
    dispatch(removeChannel(channelContextMenu.channelId));
    setChannelContextMenu(null);
  };

  const onBeginRenameChannel = function () {
    if (!channelContextMenu) {
      return;
    }

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

  const onRenamePanelChange = function (event) {
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
  };

  const onRenamePanelKeyDown = function (event) {
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
  };

  return {
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
  };
}
