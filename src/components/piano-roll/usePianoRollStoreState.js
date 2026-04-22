import { useSelector } from "react-redux";
import { getChannelMergedNotes } from "../../utils/patternNotes";

// Encapsulates all Redux reads needed by PianoRollWindow.
// This keeps the window component focused on behavior wiring instead of store plumbing.
export const usePianoRollStoreState = function () {
  const activePatternId = useSelector(function (state) {
    return state.daw.project.activePatternId;
  });
  const activePattern = useSelector(function (state) {
    return state.daw.project.patterns.find(function (item) {
      return item.id === activePatternId;
    });
  });
  const channels = useSelector(function (state) {
    return state.daw.project.channels;
  });
  const activeChannelId = useSelector(function (state) {
    return state.daw.project.activeChannelId;
  });
  const bpm = useSelector(function (state) {
    return state.daw.transport.bpm;
  });
  const scaleRoot = useSelector(function (state) {
    return state.daw.ui.pianoRollScaleRoot || "C";
  });
  const scaleType = useSelector(function (state) {
    return state.daw.ui.pianoRollScaleType || "minor";
  });
  const isPlaying = useSelector(function (state) {
    return state.daw.transport.isPlaying;
  });
  const currentStep16 = useSelector(function (state) {
    return state.daw.transport.currentStep16;
  });

  const activeChannel =
    channels.find(function (channel) {
      return channel.id === activeChannelId;
    }) || channels[0];
  const patternLength = Math.max(4, activePattern?.lengthSteps || 16);
  const pianoNotes = getChannelMergedNotes(activePattern, activeChannel?.id);

  return {
    activePatternId,
    activePattern,
    channels,
    activeChannel,
    bpm,
    scaleRoot,
    scaleType,
    isPlaying,
    currentStep16,
    patternLength,
    pianoNotes,
  };
};
