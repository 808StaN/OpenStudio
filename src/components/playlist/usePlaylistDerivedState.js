import { useMemo } from "react";
import { getPatternPreviewNotes } from "./playlistUtils";

// Builds memoized view-model data for PlaylistWindow:
// maps, timeline, playhead, snap settings and helper widths.
export function usePlaylistDerivedState({
  patterns,
  channels,
  clips,
  activePatternId,
  transportMode,
  isPlaying,
  currentStep16,
  playlistBarCount,
  barWidth,
  snapOptions,
  snapKey,
  playheadPhaseCompensation,
}) {
  const patternsById = useMemo(function () {
    return patterns.reduce(function (acc, pattern) {
      acc[pattern.id] = pattern;
      return acc;
    }, {});
  }, [patterns]);

  const channelsById = useMemo(function () {
    return channels.reduce(function (acc, channel) {
      acc[channel.id] = channel;
      return acc;
    }, {});
  }, [channels]);

  const previewNotesByPatternId = useMemo(function () {
    return patterns.reduce(function (acc, pattern) {
      acc[pattern.id] = getPatternPreviewNotes(pattern);
      return acc;
    }, {});
  }, [patterns]);

  const timelineWidth = playlistBarCount * barWidth;
  const activePatternLengthSteps = Math.max(
    1,
    patternsById[activePatternId]?.lengthSteps || 16,
  );

  const songLengthSteps = Math.max(
    activePatternLengthSteps,
    clips.reduce(function (maxSongStep, clip) {
      const clipStartStep = Math.max(
        0,
        Math.round((Number(clip.barStart || 1) - 1) * 16),
      );
      const clipLengthSteps = Math.max(
        1,
        Math.round(Number(clip.barLength || 1) * 16),
      );
      return Math.max(maxSongStep, clipStartStep + clipLengthSteps);
    }, 16),
  );

  const playheadCycleSteps =
    transportMode === "song" ? songLengthSteps : activePatternLengthSteps;
  const timelineSteps = Math.max(1, playheadCycleSteps);
  const normalizedPlayheadStep =
    ((currentStep16 % timelineSteps) + timelineSteps) % timelineSteps;
  const playheadStep = isPlaying
    ? (normalizedPlayheadStep + playheadPhaseCompensation + timelineSteps) %
      timelineSteps
    : normalizedPlayheadStep;

  const activeSnap =
    snapOptions.find(function (option) {
      return option.key === snapKey;
    }) || snapOptions[11];
  const snapLineWidth = activeSnap.stepSize
    ? Math.max(1, (activeSnap.stepSize / 16) * barWidth)
    : 1;
  const snapLineOpacity = activeSnap.stepSize ? 0.09 : 0;
  const snapBarSize = activeSnap.stepSize
    ? Math.max(1 / 16, activeSnap.stepSize / 16)
    : null;

  return {
    patternsById,
    channelsById,
    previewNotesByPatternId,
    timelineWidth,
    timelineSteps,
    playheadStep,
    activeSnap,
    snapLineWidth,
    snapLineOpacity,
    snapBarSize,
  };
}
