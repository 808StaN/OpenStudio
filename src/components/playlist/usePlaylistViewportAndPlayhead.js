import { useCallback, useEffect } from "react";

// Syncs playhead refs with transport step updates.
export const usePlaylistPlayheadClock = function ({
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

// Animates playhead position in bars based on bpm and step clock.
export const usePlaylistPlayheadAnimation = function ({
  playheadRef,
  playheadStepRef,
  playheadStepTimestampRef,
  isPlaying,
  bpm,
  timelineSteps,
  barWidth,
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
        ((playheadStepRef.current % timelineSteps) + timelineSteps) %
        timelineSteps;

      if (!isPlaying) {
        setPlayheadPosition((currentBaseStep / 16) * barWidth);
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
          ((playheadStepRef.current % timelineSteps) + timelineSteps) %
          timelineSteps;
        const positionInBars = (baseStep + progress) / 16;
        setPlayheadPosition(positionInBars * barWidth);
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
      timelineSteps,
      barWidth,
      clampFn,
    ],
  );
};

// Closes snap menu when pointer clicks outside.
export const usePlaylistSnapMenuDismiss = function ({
  isSnapMenuOpen,
  snapMenuRef,
  setIsSnapMenuOpen,
}) {
  useEffect(
    function () {
      if (!isSnapMenuOpen) {
        return;
      }

      const onPointerDown = function (event) {
        const root = snapMenuRef.current;
        if (!root) {
          return;
        }

        if (!root.contains(event.target)) {
          setIsSnapMenuOpen(false);
        }
      };

      window.addEventListener("mousedown", onPointerDown);

      return function () {
        window.removeEventListener("mousedown", onPointerDown);
      };
    },
    [isSnapMenuOpen, snapMenuRef, setIsSnapMenuOpen],
  );
};

// Keeps timeline header offset aligned with horizontal body scroll.
export const usePlaylistHeaderAlignment = function ({
  playlistBodyRef,
  playlistHeaderRef,
  barWidth,
}) {
  useEffect(
    function () {
      const viewport = playlistBodyRef.current;
      const header = playlistHeaderRef.current;
      if (!viewport || !header) {
        return;
      }

      header.style.transform = "translateX(" + -viewport.scrollLeft + "px)";
    },
    [playlistBodyRef, playlistHeaderRef, barWidth],
  );
};

// Prevent browser-level Ctrl+Wheel zoom inside Playlist shell.
export const usePlaylistPreventBrowserZoom = function ({ playlistShellRef }) {
  useEffect(function () {
    const shell = playlistShellRef.current;
    if (!shell) {
      return;
    }

    const preventBrowserZoom = function (event) {
      if (!event.ctrlKey) {
        return;
      }

      event.preventDefault();
    };

    const options = { passive: false };
    shell.addEventListener("wheel", preventBrowserZoom, options);

    return function () {
      shell.removeEventListener("wheel", preventBrowserZoom, options);
    };
  }, [playlistShellRef]);
};

// Global cleanup of drag preview when drag session ends outside drop zones.
export const usePlaylistDropPreviewCleanup = function ({ setDropPreview }) {
  useEffect(function () {
    const clearDropPreview = function () {
      setDropPreview(null);
    };

    window.addEventListener("dragend", clearDropPreview);
    window.addEventListener("drop", clearDropPreview);

    return function () {
      window.removeEventListener("dragend", clearDropPreview);
      window.removeEventListener("drop", clearDropPreview);
    };
  }, [setDropPreview]);
};

// Returns viewport-level handlers: scroll sync, zoom/pan wheel, header playhead seek, bar count input.
export const usePlaylistViewportHandlers = function ({
  playlistBodyRef,
  playlistHeaderRef,
  barWidth,
  minBarWidth,
  maxBarWidth,
  minPlaylistBars,
  maxPlaylistBars,
  setBarWidth,
  setPlaylistBarCount,
  dispatch,
  setTransportModeAction,
  setPlayheadStepAction,
  clampFn,
}) {
  const onPlaylistBodyScroll = useCallback(
    function (event) {
      const header = playlistHeaderRef.current;
      if (!header) {
        return;
      }

      header.style.transform =
        "translateX(" + -event.currentTarget.scrollLeft + "px)";
    },
    [playlistHeaderRef],
  );

  const onPlaylistBodyWheel = useCallback(
    function (event) {
      const viewport = playlistBodyRef.current;
      if (!viewport) {
        return;
      }

      if (!event.ctrlKey) {
        if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
          event.preventDefault();
          viewport.scrollLeft += event.deltaX + event.deltaY;
          const header = playlistHeaderRef.current;
          if (header) {
            header.style.transform = "translateX(" + -viewport.scrollLeft + "px)";
          }
          return;
        }

        event.preventDefault();
        viewport.scrollTop += event.deltaY;
        return;
      }

      event.preventDefault();

      const rect = viewport.getBoundingClientRect();
      const pointerX = clampFn(event.clientX - rect.left, 0, viewport.clientWidth);
      const previousBarWidth = barWidth;
      const nextBarWidth = clampFn(
        previousBarWidth + (event.deltaY < 0 ? 8 : -8),
        minBarWidth,
        maxBarWidth,
      );

      if (nextBarWidth === previousBarWidth) {
        return;
      }

      const fixedTrackNameWidth = 92;
      const worldX = viewport.scrollLeft + pointerX;
      const timelineX = Math.max(0, worldX - fixedTrackNameWidth);
      const barPosition = timelineX / previousBarWidth;

      setBarWidth(nextBarWidth);

      requestAnimationFrame(function () {
        const nextWorldX = fixedTrackNameWidth + barPosition * nextBarWidth;
        viewport.scrollLeft = Math.max(0, nextWorldX - pointerX);

        const header = playlistHeaderRef.current;
        if (header) {
          header.style.transform = "translateX(" + -viewport.scrollLeft + "px)";
        }
      });
    },
    [
      playlistBodyRef,
      playlistHeaderRef,
      clampFn,
      barWidth,
      minBarWidth,
      maxBarWidth,
      setBarWidth,
    ],
  );

  const onPlaylistLengthChange = useCallback(
    function (event) {
      const parsed = Number(event.target.value);
      if (!Number.isFinite(parsed)) {
        return;
      }

      setPlaylistBarCount(
        clampFn(Math.round(parsed), minPlaylistBars, maxPlaylistBars),
      );
    },
    [setPlaylistBarCount, clampFn, minPlaylistBars, maxPlaylistBars],
  );

  const onPlaylistHeaderMouseDown = useCallback(
    function (event) {
      if (event.button !== 0) {
        return;
      }

      const barCell = event.target.closest(".bar-cell");
      if (!barCell) {
        return;
      }

      const barIndex = Number(barCell.getAttribute("data-bar-index"));
      if (!Number.isFinite(barIndex) || barIndex < 0) {
        return;
      }

      const rect = barCell.getBoundingClientRect();
      if (rect.width <= 0) {
        return;
      }

      const localX = clampFn(event.clientX - rect.left, 0, rect.width);
      const stepOffsetInBar = clampFn(
        Math.floor((localX / rect.width) * 16),
        0,
        15,
      );

      const nextStep = Math.max(0, barIndex * 16 + stepOffsetInBar);

      dispatch(setTransportModeAction("song"));
      dispatch(setPlayheadStepAction(nextStep));
    },
    [dispatch, setTransportModeAction, setPlayheadStepAction, clampFn],
  );

  return {
    onPlaylistBodyScroll,
    onPlaylistBodyWheel,
    onPlaylistLengthChange,
    onPlaylistHeaderMouseDown,
  };
};
