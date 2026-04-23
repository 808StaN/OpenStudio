import { useEffect } from "react";

// Keep playhead refs in sync with transport step changes.
// We store timestamp + last step in refs to allow smooth rAF interpolation.
export const usePianoRollPlayheadClock = function ({
  playheadStep,
  playheadStepRef,
  playheadStepTimestampRef,
}) {
  useEffect(
    function () {
      if (playheadStepRef.current === playheadStep) {
        return;
      }

      playheadStepRef.current = playheadStep;
      playheadStepTimestampRef.current = performance.now();
    },
    [playheadStep, playheadStepRef, playheadStepTimestampRef],
  );
};

// Animate playhead position between transport ticks.
// The interpolation keeps visual movement fluid while transport advances in step units.
export const usePianoRollPlayheadAnimation = function ({
  playheadRef,
  playheadStepRef,
  playheadStepTimestampRef,
  isPlaying,
  bpm,
  patternLength,
  stepWidth,
  clampFn,
}) {
  useEffect(
    function () {
      const playheadElement = playheadRef.current;
      if (!playheadElement) {
        return;
      }

      const setPlayheadPosition = function (positionPx) {
        playheadElement.style.transform = "translateX(" + positionPx + "px)";
      };

      const currentBaseStep =
        ((playheadStepRef.current % patternLength) + patternLength) %
        patternLength;

      if (!isPlaying) {
        setPlayheadPosition(currentBaseStep * stepWidth);
        return;
      }

      if (playheadStepTimestampRef.current <= 0) {
        playheadStepTimestampRef.current = performance.now();
      }

      let rafId = 0;
      const stepDurationMs = (60 / Math.max(1, bpm) / 4) * 1000;

      const tick = function () {
        const elapsed = performance.now() - playheadStepTimestampRef.current;
        const progress = clampFn(elapsed / stepDurationMs, 0, 0.999);
        const baseStep =
          ((playheadStepRef.current % patternLength) + patternLength) %
          patternLength;
        setPlayheadPosition((baseStep + progress) * stepWidth);
        rafId = requestAnimationFrame(tick);
      };

      tick();

      return function () {
        cancelAnimationFrame(rafId);
      };
    },
    [
      playheadRef,
      playheadStepRef,
      playheadStepTimestampRef,
      isPlaying,
      bpm,
      patternLength,
      stepWidth,
      clampFn,
    ],
  );
};

// Set default vertical viewport to around C5 once on first mount.
export const usePianoRollInitialViewport = function ({
  initializedViewportRef,
  gridWrapRef,
  keysRef,
  rowHeight,
  pitchMax,
  c5Pitch,
  gridHeaderHeight,
}) {
  useEffect(
    function () {
      if (initializedViewportRef.current) {
        return;
      }

      const viewport = gridWrapRef.current;
      if (!viewport) {
        return;
      }

      const c5RowIndex = Math.max(0, pitchMax - c5Pitch);
      const targetScrollTop = Math.max(
        0,
        c5RowIndex * rowHeight - viewport.clientHeight * 0.45 + gridHeaderHeight,
      );
      viewport.scrollTop = targetScrollTop;

      if (keysRef.current) {
        keysRef.current.scrollTop = targetScrollTop;
      }

      initializedViewportRef.current = true;
    },
    [
      initializedViewportRef,
      gridWrapRef,
      keysRef,
      rowHeight,
      pitchMax,
      c5Pitch,
      gridHeaderHeight,
    ],
  );
};

// Prevent Ctrl+Wheel browser zoom inside piano-roll scroll containers.
// This preserves consistent DAW zoom interactions in the app.
export const usePianoRollPreventBrowserZoom = function ({
  gridWrapRef,
  keysRef,
}) {
  useEffect(function () {
    const viewport = gridWrapRef.current;
    const keys = keysRef.current;

    const preventBrowserZoom = function (event) {
      if (!event.ctrlKey) {
        return;
      }
      event.preventDefault();
    };

    const options = { passive: false };

    if (viewport) {
      viewport.addEventListener("wheel", preventBrowserZoom, options);
    }
    if (keys) {
      keys.addEventListener("wheel", preventBrowserZoom, options);
    }

    return function () {
      if (viewport) {
        viewport.removeEventListener("wheel", preventBrowserZoom, options);
      }
      if (keys) {
        keys.removeEventListener("wheel", preventBrowserZoom, options);
      }
    };
  }, [gridWrapRef, keysRef]);
};
