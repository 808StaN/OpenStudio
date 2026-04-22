import { toSafeSampleUrl } from "../../utils/sampleUrl";

// Centralizes playlist placement decisions for dragged patterns/samples.
// This keeps drag/drop logic deterministic and reusable across row handlers.
export const usePlaylistDropPlacement = function ({
  patternsById,
  patterns,
  tracks,
  activePatternId,
  playlistBarCount,
  snapBarSize,
  bpm,
  dispatch,
  getAudioAnalysis,
  audioClipFallbackBarLength,
  minClipBarLength,
  lastTouchedAudioClipRef,
  patternSelectionForInsertRef,
  clampFn,
  quantizeBySnapFn,
  getTargetAudioClipBarLengthFn,
  getPatternDragSessionFn,
  normalizePatternIdsFn,
  getDraggedPatternIdsWithFallbackFn,
  hasDraggedPatternDataFn,
  getDraggedSamplePayloadFn,
  hasDraggedSampleDataFn,
  resolveBarStartFromPointerFn,
  addPlaylistPatternClipAction,
  setActivePatternAction,
  addPlaylistSampleAsChannelAction,
  patternDragMime,
  sampleDragMime,
}) {
  const getPatternBarLength = function (patternId) {
    const pattern = patternsById[patternId];
    if (!pattern) {
      return 1;
    }

    return Math.max(1, Math.ceil((pattern.lengthSteps || 16) / 16));
  };

  const normalizePatternIds = function (rawIds) {
    return normalizePatternIdsFn(rawIds, patternsById);
  };

  const getDraggedPatternIdsWithFallback = function (event) {
    return getDraggedPatternIdsWithFallbackFn({
      event,
      patternDragMime,
      patternsById,
      sessionPatternIds: getPatternDragSessionFn(),
    });
  };

  const resolvePatternIdsForPlacement = function (candidateIds) {
    const normalized = normalizePatternIds(candidateIds);
    if (normalized.length > 0) {
      return normalized;
    }

    const activeFallback = normalizePatternIds([activePatternId]);
    if (activeFallback.length > 0) {
      return activeFallback;
    }

    const firstPatternId = patterns.find(function (pattern) {
      return Boolean(pattern?.id) && Boolean(patternsById[pattern.id]);
    })?.id;

    return normalizePatternIds([firstPatternId]);
  };

  const hasDraggedPatternData = function (event) {
    return hasDraggedPatternDataFn({
      event,
      patternDragMime,
      patternsById,
      sessionPatternIds: getPatternDragSessionFn(),
    });
  };

  const getDraggedSamplePayload = function (event) {
    return getDraggedSamplePayloadFn({
      event,
      sampleDragMime,
    });
  };

  const hasDraggedSampleData = function (event) {
    return hasDraggedSampleDataFn({
      event,
      sampleDragMime,
    });
  };

  const resolveBarStartFromPointer = function (event, trackElement) {
    return resolveBarStartFromPointerFn({
      event,
      trackElement,
      playlistBarCount,
      snapBarSize,
      clampFn,
      quantizeFn: quantizeBySnapFn,
    });
  };

  const buildDropPlacements = function (trackId, startBar, patternIds) {
    const resolvedPatternIds = resolvePatternIdsForPlacement(patternIds);
    if (!trackId || resolvedPatternIds.length === 0) {
      return [];
    }

    const trackIndex = tracks.findIndex(function (track) {
      return track.id === trackId;
    });
    if (trackIndex < 0) {
      return [];
    }

    const barStart = clampFn(startBar, 1, playlistBarCount);

    return resolvedPatternIds
      .map(function (patternId, offset) {
        const targetTrack = tracks[trackIndex + offset];
        if (!targetTrack) {
          return null;
        }

        return {
          trackId: targetTrack.id,
          patternId,
          barStart,
          barLength: getPatternBarLength(patternId),
        };
      })
      .filter(Boolean);
  };

  const placePatternsOnTrack = function (trackId, startBar, patternIds) {
    const placements = buildDropPlacements(trackId, startBar, patternIds);
    if (placements.length === 0) {
      return;
    }

    placements.forEach(function (placement) {
      dispatch(
        addPlaylistPatternClipAction({
          patternId: placement.patternId,
          trackId: placement.trackId,
          barStart: placement.barStart,
          barLength: placement.barLength,
        }),
      );
    });

    dispatch(setActivePatternAction(placements[placements.length - 1].patternId));
  };

  const placeAudioClipOnTrack = function (trackId, startBar, samplePayload) {
    if (!trackId || !samplePayload?.samplePath) {
      return;
    }

    void (async function () {
      const analysis = await getAudioAnalysis(samplePayload.samplePath);
      const resolvedBars = analysis
        ? getTargetAudioClipBarLengthFn(analysis.durationSec, null, bpm)
        : audioClipFallbackBarLength;
      const normalizedBarLength = clampFn(resolvedBars, minClipBarLength, 64);
      const safeSamplePath = toSafeSampleUrl(samplePayload.samplePath);

      lastTouchedAudioClipRef.current = {
        samplePath: safeSamplePath,
        audioName: samplePayload.clipName,
        barLength: normalizedBarLength,
        sourceOffsetSteps: 0,
        channelId: null,
      };
      patternSelectionForInsertRef.current = null;
      window.dispatchEvent(new CustomEvent("openstudio:playlist-audio-focus"));

      dispatch(
        addPlaylistSampleAsChannelAction({
          trackId,
          barStart: clampFn(startBar, 1, playlistBarCount),
          barLength: normalizedBarLength,
          samplePath: safeSamplePath,
          clipName: samplePayload.clipName,
        }),
      );
    })();
  };

  return {
    normalizePatternIds,
    getDraggedPatternIdsWithFallback,
    hasDraggedPatternData,
    getDraggedSamplePayload,
    hasDraggedSampleData,
    resolveBarStartFromPointer,
    buildDropPlacements,
    placePatternsOnTrack,
    placeAudioClipOnTrack,
  };
};
