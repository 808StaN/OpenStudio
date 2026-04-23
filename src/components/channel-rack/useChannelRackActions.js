import { useCallback } from "react";
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

/**
 * Returns a stable set of action handlers for the Channel Rack.
 * Every callback is wrapped in useCallback so child rows can safely
 * rely on reference equality when memoized with React.memo.
 */
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
  const onAssignPluginToChannel = useCallback(
    function (channelId, payload) {
      dispatch(
        assignPluginToChannel({
          channelId,
          pluginRef: payload.pluginRef,
          pluginName: payload.pluginName,
        }),
      );
    },
    [dispatch],
  );

  const onAssignSampleToChannel = useCallback(
    function (channelId, payload) {
      dispatch(
        assignSampleToChannel({
          channelId,
          sampleRef: payload.samplePath || payload.file,
          sampleName: payload.file,
        }),
      );
    },
    [dispatch],
  );

  const onOpenSampleSettings = useCallback(
    function (channelId) {
      setChannelContextMenu(null);
      dispatch(setActiveChannel(channelId));
      dispatch(openWindow("sampleSettings"));
    },
    [dispatch, setChannelContextMenu],
  );

  const onOpenChannelContextMenu = useCallback(
    function (channelId, buttonRect) {
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
    },
    [
      dispatch,
      rackShellRef,
      setIsPatternMenuOpen,
      setOpenInsertMenuChannelId,
      setChannelRenamePanel,
      setChannelContextMenu,
    ],
  );

  const onToggleInsertMenu = useCallback(
    function (channelId) {
      setOpenInsertMenuChannelId(function (value) {
        const next = value === channelId ? null : channelId;
        if (next) {
          setIsPatternMenuOpen(false);
        }
        return next;
      });
    },
    [setOpenInsertMenuChannelId, setIsPatternMenuOpen],
  );

  const onAssignMixerInsert = useCallback(
    function (channelId, insertId) {
      dispatch(
        setChannelMixerInsert({
          channelId,
          insertId,
        }),
      );
      setOpenInsertMenuChannelId(null);
    },
    [dispatch, setOpenInsertMenuChannelId],
  );

  const onOpenPianoRoll = useCallback(
    function (channelId) {
      dispatch(setActiveChannel(channelId));
      dispatch(openWindow("pianoRoll"));
    },
    [dispatch],
  );

  const onTogglePatternStep = useCallback(
    function (patternId, channelId, stepIndex) {
      dispatch(
        toggleStep({
          patternId: patternId || activePatternId,
          channelId,
          stepIndex,
        }),
      );
    },
    [dispatch, activePatternId],
  );

  const onCloneChannel = useCallback(
    function () {
      if (!channelContextMenu) {
        return;
      }
      dispatch(duplicateChannel(channelContextMenu.channelId));
      setChannelContextMenu(null);
    },
    [dispatch, channelContextMenu, setChannelContextMenu],
  );

  const onRemoveChannel = useCallback(
    function () {
      if (!channelContextMenu) {
        return;
      }
      if (channels.length <= 1) {
        return;
      }
      dispatch(removeChannel(channelContextMenu.channelId));
      setChannelContextMenu(null);
    },
    [dispatch, channelContextMenu, channels.length, setChannelContextMenu],
  );

  const onBeginRenameChannel = useCallback(
    function () {
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
    },
    [channels, channelContextMenu, setChannelRenamePanel, setChannelContextMenu],
  );

  const onSaveRenamePanel = useCallback(
    function () {
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
    },
    [dispatch, channelRenamePanel, setChannelRenamePanel],
  );

  const onRenamePanelChange = useCallback(
    function (event) {
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
    },
    [setChannelRenamePanel],
  );

  const onRenamePanelKeyDown = useCallback(
    function (event) {
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
    },
    [setChannelRenamePanel, onSaveRenamePanel],
  );

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
