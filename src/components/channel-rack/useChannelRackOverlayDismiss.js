import { useEffect } from "react";

// Close Channel Rack dropdowns/panels when clicking outside or pressing Escape.
export const useChannelRackOverlayDismiss = function ({
  isPatternMenuOpen,
  openInsertMenuChannelId,
  channelContextMenu,
  channelRenamePanel,
  setIsPatternMenuOpen,
  setOpenInsertMenuChannelId,
  setChannelContextMenu,
  setChannelRenamePanel,
}) {
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
    [
      isPatternMenuOpen,
      openInsertMenuChannelId,
      channelContextMenu,
      channelRenamePanel,
      setIsPatternMenuOpen,
      setOpenInsertMenuChannelId,
      setChannelContextMenu,
      setChannelRenamePanel,
    ],
  );
};
