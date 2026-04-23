import { useCallback } from "react";
import { duplicateChannel, removeChannel, renameChannel } from "../../store";

/**
 * Context-menu and rename-panel handlers for Channel Rack channels.
 * Kept separate from row actions to keep responsibilities narrow.
 */
export function useChannelRackContextMenuActions({
  dispatch,
  channels,
  channelContextMenu,
  channelRenamePanel,
  setChannelContextMenu,
  setChannelRenamePanel,
}) {
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
    onCloneChannel,
    onRemoveChannel,
    onBeginRenameChannel,
    onSaveRenamePanel,
    onRenamePanelChange,
    onRenamePanelKeyDown,
  };
}
