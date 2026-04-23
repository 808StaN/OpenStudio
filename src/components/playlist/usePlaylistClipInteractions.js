// Encapsulates direct clip mouse interactions:
// - resize from end
// - resize/trim from start
// - move across timeline/tracks
export const usePlaylistClipInteractions = function ({
  dispatch,
  playlistBarCount,
  snapBarSize,
  minClipBarLength,
  lastTouchedAudioClipRef,
  patternSelectionForInsertRef,
  clampFn,
  quantizeBySnapFn,
  setActivePatternAction,
  setPlaylistClipLengthAction,
  setPlaylistClipTrimStartAction,
  setPlaylistClipPlacementAction,
}) {
  // Resize clip tail (right handle).
  const startResize = function (event, clip, trackId) {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const trackElement = event.currentTarget.closest(".track-grid");
    if (!trackElement) {
      return;
    }

    const rect = trackElement.getBoundingClientRect();
    const barWidthPx = rect.width / playlistBarCount;
    const startClientX = event.clientX;
    const startLength = Math.max(minClipBarLength, Number(clip.barLength || 1));

    const onMouseMove = function (moveEvent) {
      const deltaBarsRaw =
        (moveEvent.clientX - startClientX) / Math.max(1, barWidthPx);
      const nextRawLength = startLength + deltaBarsRaw;
      const snappedLength = quantizeBySnapFn(nextRawLength, snapBarSize);
      const nextLength = clampFn(
        snappedLength,
        minClipBarLength,
        playlistBarCount,
      );

      dispatch(
        setPlaylistClipLengthAction({
          clipId: clip.id,
          trackId,
          barLength: nextLength,
          manualResize: true,
        }),
      );
    };

    const onMouseUp = function () {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  // Resize clip head (left handle) and translate source offset for trimmed audio.
  const startResizeFromStart = function (event, clip) {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const trackElement = event.currentTarget.closest(".track-grid");
    if (!trackElement) {
      return;
    }

    const rect = trackElement.getBoundingClientRect();
    const barWidthPx = rect.width / playlistBarCount;
    const startClientX = event.clientX;
    const startBar = clampFn(Number(clip.barStart || 1), 1, playlistBarCount);
    const startLength = Math.max(minClipBarLength, Number(clip.barLength || 1));
    const startOffsetSteps = Math.max(0, Number(clip.sourceOffsetSteps || 0));
    const clipEndBar = startBar + startLength;
    const sourceEndSteps = startOffsetSteps + startLength * 16;

    const onMouseMove = function (moveEvent) {
      const deltaBarsRaw =
        (moveEvent.clientX - startClientX) / Math.max(1, barWidthPx);
      const nextRawStart = startBar + deltaBarsRaw;
      const snappedStart = quantizeBySnapFn(nextRawStart, snapBarSize);

      const maxStartByClipEnd = Math.max(1, clipEndBar - minClipBarLength);
      const nextStart = clampFn(snappedStart, 1, maxStartByClipEnd);
      const nextLengthRaw = Math.max(minClipBarLength, clipEndBar - nextStart);
      const nextLength = Math.min(nextLengthRaw, sourceEndSteps / 16);
      const normalizedStart = clipEndBar - nextLength;
      const nextOffsetSteps = Math.max(0, sourceEndSteps - nextLength * 16);

      dispatch(
        setPlaylistClipTrimStartAction({
          clipId: clip.id,
          barStart: normalizedStart,
          barLength: nextLength,
          sourceOffsetSteps: nextOffsetSteps,
          manualResize: true,
        }),
      );
    };

    const onMouseUp = function () {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  // Move clip along timeline and between tracks.
  const startMove = function (event, clip) {
    if (event.button !== 0) {
      return;
    }

    if (event.target.closest(".clip-resize-handle")) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (clip.clipType === "audio") {
      // Keep insertion context in sync with the last touched audio clip.
      lastTouchedAudioClipRef.current = {
        samplePath: String(clip.samplePath || "").trim(),
        audioName: String(clip.audioName || "Audio").trim() || "Audio",
        barLength: Math.max(minClipBarLength, Number(clip.barLength || 1)),
        sourceOffsetSteps: Math.max(0, Number(clip.sourceOffsetSteps || 0)),
        channelId: String(clip.channelId || "").trim() || null,
      };

      patternSelectionForInsertRef.current = null;
      window.dispatchEvent(new CustomEvent("openstudio:playlist-audio-focus"));
    }

    if (clip.clipType !== "audio" && clip.patternId) {
      // Keep pattern focus consistent with moved pattern clips.
      dispatch(setActivePatternAction(clip.patternId));
      patternSelectionForInsertRef.current = clip.patternId;
      window.dispatchEvent(
        new CustomEvent("openstudio:playlist-pattern-focus", {
          detail: {
            patternId: clip.patternId,
          },
        }),
      );
    }

    const startClientX = event.clientX;
    const startBar = clampFn(Number(clip.barStart || 1), 1, playlistBarCount);
    const clipLength = Math.max(minClipBarLength, Number(clip.barLength || 1));
    let fallbackTrackId = clip.trackId;

    const findTargetGrid = function (moveEvent) {
      // Prefer hovered grid, fallback to current track row.
      const targetElement = document.elementFromPoint(
        moveEvent.clientX,
        moveEvent.clientY,
      );
      const hoveredGrid = targetElement?.closest(".track-grid");
      if (hoveredGrid) {
        return hoveredGrid;
      }

      return document.querySelector(
        '.track-grid[data-track-id="' + fallbackTrackId + '"]',
      );
    };

    const onMouseMove = function (moveEvent) {
      const targetGrid = findTargetGrid(moveEvent);
      if (!targetGrid) {
        return;
      }

      const targetTrackId =
        targetGrid.getAttribute("data-track-id") || fallbackTrackId;
      const rect = targetGrid.getBoundingClientRect();
      const barWidthPx = rect.width / playlistBarCount;
      const deltaBarsRaw =
        (moveEvent.clientX - startClientX) / Math.max(1, barWidthPx);
      const nextRawStart = startBar + deltaBarsRaw;
      const snappedStart = quantizeBySnapFn(nextRawStart, snapBarSize);
      const maxBarStart = Math.max(1, playlistBarCount - clipLength + 1);
      const barStart = clampFn(snappedStart, 1, maxBarStart);
      fallbackTrackId = targetTrackId;

      dispatch(
        setPlaylistClipPlacementAction({
          clipId: clip.id,
          trackId: targetTrackId,
          barStart,
        }),
      );
    };

    const onMouseUp = function () {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  return {
    startResize,
    startResizeFromStart,
    startMove,
  };
};
