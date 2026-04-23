import { useMemo } from "react";
import { useSelector } from "react-redux";
import { DEFAULT_PATTERN_COLOR, STEPS_PER_BEAT, clamp, getInsertLabel } from "./channelRackUtils";

// Collects Channel Rack store reads and derived values in one place.
// This keeps ChannelRackWindow focused on behavior wiring and rendering.
export function useChannelRackDerivedState() {
  const activePatternId = useSelector(function (state) {
    return state.daw.project.activePatternId;
  });
  const patterns = useSelector(function (state) {
    return state.daw.project.patterns;
  });
  const activePattern = useSelector(function (state) {
    return state.daw.project.patterns.find(function (item) {
      return item.id === activePatternId;
    });
  });
  const channels = useSelector(function (state) {
    return state.daw.project.channels;
  });
  const mixerInserts = useSelector(function (state) {
    return state.daw.mixer.inserts.filter(function (insert) {
      return !insert.isMaster;
    });
  });
  const playhead = useSelector(function (state) {
    return state.daw.transport.currentStep16;
  });
  const isPlaying = useSelector(function (state) {
    return state.daw.transport.isPlaying;
  });
  const bpm = useSelector(function (state) {
    return state.daw.transport.bpm;
  });
  const channelRackMode = useSelector(function (state) {
    return state.daw.ui.channelRackMode;
  });

  const activePatternColor = String(activePattern?.color || DEFAULT_PATTERN_COLOR);
  const patternLength = Math.max(4, activePattern?.lengthSteps || 16);
  const normalizedPlayheadStep =
    ((playhead % patternLength) + patternLength) % patternLength;
  const playheadStep = isPlaying
    ? (normalizedPlayheadStep - 1 + patternLength) % patternLength
    : normalizedPlayheadStep;

  const insertLabelById = useMemo(
    function () {
      return mixerInserts.reduce(function (acc, insert, index) {
        acc[insert.id] = getInsertLabel(insert, index);
        return acc;
      }, {});
    },
    [mixerInserts],
  );

  return {
    activePatternId,
    patterns,
    activePattern,
    activePatternColor,
    channels,
    mixerInserts,
    isPlaying,
    bpm,
    channelRackMode,
    patternLength,
    playheadStep,
    insertLabelById,
    stepsPerBeat: STEPS_PER_BEAT,
    clampFn: clamp,
  };
}
