import { useCallback } from "react";

// Manages synchronized scrolling between grid, keys, and velocity lane
// plus Ctrl+Wheel horizontal zoom centered around pointer position.
export const usePianoRollScrollAndZoom = function ({
  gridWrapRef,
  keysRef,
  velocityWrapRef,
  isSyncingScrollRef,
  isSyncingHorizontalScrollRef,
  stepWidth,
  setStepWidth,
  minStepWidth,
  maxStepWidth,
  clampFn,
}) {
  // Keep horizontal scroll of velocity lane aligned with main grid.
  const onGridWrapScroll = useCallback(
    function (event) {
      if (velocityWrapRef.current && !isSyncingHorizontalScrollRef.current) {
        isSyncingHorizontalScrollRef.current = true;
        velocityWrapRef.current.scrollLeft = event.currentTarget.scrollLeft;
        isSyncingHorizontalScrollRef.current = false;
      }

      // Keep piano keys vertically aligned with note rows.
      if (!keysRef.current || isSyncingScrollRef.current) {
        return;
      }
      isSyncingScrollRef.current = true;
      keysRef.current.scrollTop = event.currentTarget.scrollTop;
      isSyncingScrollRef.current = false;
    },
    [
      velocityWrapRef,
      isSyncingHorizontalScrollRef,
      keysRef,
      isSyncingScrollRef,
    ],
  );

  // Mirror horizontal scroll from velocity lane to main grid.
  const onVelocityWrapScroll = useCallback(
    function (event) {
      if (!gridWrapRef.current || isSyncingHorizontalScrollRef.current) {
        return;
      }

      isSyncingHorizontalScrollRef.current = true;
      gridWrapRef.current.scrollLeft = event.currentTarget.scrollLeft;
      isSyncingHorizontalScrollRef.current = false;
    },
    [gridWrapRef, isSyncingHorizontalScrollRef],
  );

  // Mirror vertical scroll from piano keys to main grid.
  const onKeysScroll = useCallback(
    function (event) {
      if (!gridWrapRef.current || isSyncingScrollRef.current) {
        return;
      }
      isSyncingScrollRef.current = true;
      gridWrapRef.current.scrollTop = event.currentTarget.scrollTop;
      isSyncingScrollRef.current = false;
    },
    [gridWrapRef, isSyncingScrollRef],
  );

  // Ctrl+Wheel zoom changes step width and preserves pointer-anchored position.
  const onGridWheel = useCallback(
    function (event) {
      const viewport = gridWrapRef.current;
      if (!viewport) {
        return;
      }

      if (!event.ctrlKey) {
        return;
      }

      const rect = viewport.getBoundingClientRect();
      const pointerX = clampFn(
        event.clientX - rect.left,
        0,
        viewport.clientWidth,
      );

      event.preventDefault();
      const previousWidth = stepWidth;
      const nextWidth = clampFn(
        previousWidth + (event.deltaY < 0 ? 2 : -2),
        minStepWidth,
        maxStepWidth,
      );

      if (nextWidth === previousWidth) {
        return;
      }

      const worldX = viewport.scrollLeft + pointerX;
      const stepPosition = worldX / previousWidth;

      setStepWidth(nextWidth);

      requestAnimationFrame(function () {
        viewport.scrollLeft = Math.max(0, stepPosition * nextWidth - pointerX);
        if (keysRef.current) {
          keysRef.current.scrollTop = viewport.scrollTop;
        }
      });
    },
    [
      gridWrapRef,
      clampFn,
      stepWidth,
      minStepWidth,
      maxStepWidth,
      setStepWidth,
      keysRef,
    ],
  );

  return {
    onGridWrapScroll,
    onVelocityWrapScroll,
    onKeysScroll,
    onGridWheel,
  };
};
