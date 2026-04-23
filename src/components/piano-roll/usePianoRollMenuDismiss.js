import { useEffect } from "react";

// Closes Piano Roll dropdown menus when user clicks outside of their containers.
// The hook keeps outside-click logic centralized and avoids repetitive effect code in the window component.
export const usePianoRollMenuDismiss = function ({
  isSnapMenuOpen,
  isChannelMenuOpen,
  isScaleRootMenuOpen,
  isScaleTypeMenuOpen,
  snapMenuRef,
  channelMenuRef,
  scaleRootMenuRef,
  scaleTypeMenuRef,
  setIsSnapMenuOpen,
  setIsChannelMenuOpen,
  setIsScaleRootMenuOpen,
  setIsScaleTypeMenuOpen,
}) {
  useEffect(
    function () {
      if (
        !isSnapMenuOpen &&
        !isChannelMenuOpen &&
        !isScaleRootMenuOpen &&
        !isScaleTypeMenuOpen
      ) {
        return;
      }

      const onPointerDown = function (event) {
        const target = event.target;
        if (
          snapMenuRef.current &&
          !snapMenuRef.current.contains(target) &&
          isSnapMenuOpen
        ) {
          setIsSnapMenuOpen(false);
        }

        if (
          channelMenuRef.current &&
          !channelMenuRef.current.contains(target) &&
          isChannelMenuOpen
        ) {
          setIsChannelMenuOpen(false);
        }

        if (
          scaleRootMenuRef.current &&
          !scaleRootMenuRef.current.contains(target) &&
          isScaleRootMenuOpen
        ) {
          setIsScaleRootMenuOpen(false);
        }

        if (
          scaleTypeMenuRef.current &&
          !scaleTypeMenuRef.current.contains(target) &&
          isScaleTypeMenuOpen
        ) {
          setIsScaleTypeMenuOpen(false);
        }
      };

      window.addEventListener("mousedown", onPointerDown);

      return function () {
        window.removeEventListener("mousedown", onPointerDown);
      };
    },
    [
      isSnapMenuOpen,
      isChannelMenuOpen,
      isScaleRootMenuOpen,
      isScaleTypeMenuOpen,
      snapMenuRef,
      channelMenuRef,
      scaleRootMenuRef,
      scaleTypeMenuRef,
      setIsSnapMenuOpen,
      setIsChannelMenuOpen,
      setIsScaleRootMenuOpen,
      setIsScaleTypeMenuOpen,
    ],
  );
};
