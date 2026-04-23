import { useSelector } from "react-redux";

// Encapsulates all Redux reads for PlaylistWindow.
// Keeping selectors together makes the main window component easier to scan.
export function usePlaylistStoreState() {
  const activePatternId = useSelector(function (state) {
    return state.daw.project.activePatternId;
  });
  const patterns = useSelector(function (state) {
    return state.daw.project.patterns;
  });
  const channels = useSelector(function (state) {
    return state.daw.project.channels;
  });
  const tracks = useSelector(function (state) {
    return state.daw.project.playlistTracks;
  });
  const clips = useSelector(function (state) {
    return state.daw.project.playlistClips;
  });
  const clipboardPatternIds = useSelector(function (state) {
    return state.daw.ui.patternClipboardIds;
  });
  const isPlaying = useSelector(function (state) {
    return state.daw.transport.isPlaying;
  });
  const currentStep16 = useSelector(function (state) {
    return state.daw.transport.currentStep16;
  });
  const bpm = useSelector(function (state) {
    return state.daw.transport.bpm;
  });
  const transportMode = useSelector(function (state) {
    return state.daw.transport.mode;
  });
  const songLoopEnabled = useSelector(function (state) {
    return Boolean(state.daw.transport.songLoopEnabled);
  });

  return {
    activePatternId,
    patterns,
    channels,
    tracks,
    clips,
    clipboardPatternIds,
    isPlaying,
    currentStep16,
    bpm,
    transportMode,
    songLoopEnabled,
  };
}
