import { useDispatch } from "react-redux";
import {
  addPlaylistAudioClip,
  addPlaylistPatternClip,
  addPlaylistSampleAsChannel,
  addPlaylistTrack,
  openWindow,
  removePlaylistClip,
  setActiveChannel,
  setActivePattern,
  setPlayheadStep,
  setPlaylistClipPlacement,
  setPlaylistClipLength,
  setPlaylistClipTrimStart,
  setSongLoopEnabled,
  setTransportMode,
} from "../store";
import { PlaylistTopControls } from "./playlist/PlaylistTopControls";
import { PlaylistTracksCanvas } from "./playlist/PlaylistTracksCanvas";
import { usePlaylistAudioAnalysis } from "./playlist/usePlaylistAudioAnalysis";
import { usePlaylistAudioClipMaintenance } from "./playlist/usePlaylistAudioClipMaintenance";
import { usePlaylistDerivedState } from "./playlist/usePlaylistDerivedState";
import { usePlaylistDropPlacement } from "./playlist/usePlaylistDropPlacement";
import { usePlaylistPasteShortcut } from "./playlist/usePlaylistPasteShortcut";
import { usePlaylistClipInteractions } from "./playlist/usePlaylistClipInteractions";
import { usePlaylistPatternSelectionRef } from "./playlist/usePlaylistPatternSelectionRef";
import { usePlaylistStoreState } from "./playlist/usePlaylistStoreState";
import { usePlaylistTrackGridHandlers } from "./playlist/usePlaylistTrackGridHandlers";
import { usePlaylistUiState } from "./playlist/usePlaylistUiState";
import {
  usePlaylistDropPreviewCleanup,
  usePlaylistHeaderAlignment,
  usePlaylistPlayheadAnimation,
  usePlaylistPlayheadClock,
  usePlaylistPreventBrowserZoom,
  usePlaylistSnapMenuDismiss,
  usePlaylistViewportHandlers,
} from "./playlist/usePlaylistViewportAndPlayhead";
import {
  normalizePatternIds as normalizePatternIdsFromUtils,
  getDraggedPatternIdsWithFallback as getDraggedPatternIdsWithFallbackFromUtils,
  hasDraggedPatternData as hasDraggedPatternDataFromUtils,
  getDraggedSamplePayload as getDraggedSamplePayloadFromUtils,
  hasDraggedSampleData as hasDraggedSampleDataFromUtils,
  resolveBarStartFromPointer as resolveBarStartFromPointerFromUtils,
} from "./playlist/playlistDragUtils";
import {
  buildWaveformEnvelope,
  clamp,
  getTargetAudioClipBarLength,
  quantizeBySnap,
} from "./playlist/playlistUtils";
import { getPatternDragSession } from "../utils/patternDragSession";
import { getSafeSampleSettings } from "../audio/domain/sampleSettings";
import { toSafeSampleUrl } from "../utils/sampleUrl";

const DEFAULT_PLAYLIST_BARS = 256;
const MIN_PLAYLIST_BARS = 4;
const MAX_PLAYLIST_BARS = 512;
const BASE_BAR_WIDTH = 56;
const PLAYLIST_ZOOM_X = 3;
const INITIAL_BAR_WIDTH = Math.round(BASE_BAR_WIDTH * PLAYLIST_ZOOM_X);
const MIN_BAR_WIDTH = 42;
const MAX_BAR_WIDTH = 320;
const MIN_CLIP_BAR_LENGTH = 1 / 16;
const PATTERN_DRAG_MIME = "application/x-daw-pattern";
const SAMPLE_DRAG_MIME = "application/x-daw-sample";
const PLAYLIST_PLAYHEAD_STEP_PHASE_COMPENSATION = 1;
const AUDIO_CLIP_FALLBACK_BAR_LENGTH = 2;
const AUDIO_WAVEFORM_BINS = 2048;
const AUDIO_WAVEFORM_DETAIL_DENSITY = 1.15;
const AUDIO_WAVEFORM_MAX_BARS = 520;

const SNAP_OPTIONS = [
  { key: "none", label: "(none)", stepSize: null },
  { key: "1-6-step", label: "1/6 step", stepSize: 1 / 6 },
  { key: "1-4-step", label: "1/4 step", stepSize: 1 / 4 },
  { key: "1-3-step", label: "1/3 step", stepSize: 1 / 3 },
  { key: "1-2-step", label: "1/2 step", stepSize: 1 / 2 },
  { key: "step", label: "Step", stepSize: 1 },
  { key: "1-6-beat", label: "1/6 beat", stepSize: 2 / 3 },
  { key: "1-4-beat", label: "1/4 beat", stepSize: 1 },
  { key: "1-3-beat", label: "1/3 beat", stepSize: 4 / 3 },
  { key: "1-2-beat", label: "1/2 beat", stepSize: 2 },
  { key: "beat", label: "Beat", stepSize: 4 },
  { key: "bar", label: "Bar", stepSize: 16 },
];

export function PlaylistWindow() {
  const dispatch = useDispatch();
  const {
    lastTouchedAudioClipRef,
    patternSelectionForInsertRef,
    snapMenuRef,
    playlistShellRef,
    playlistBodyRef,
    playlistHeaderRef,
    playheadRef,
    playheadStepRef,
    playheadStepTimestampRef,
    barWidth,
    setBarWidth,
    playlistBarCount,
    setPlaylistBarCount,
    snapKey,
    setSnapKey,
    isSnapMenuOpen,
    setIsSnapMenuOpen,
    dropPreview,
    setDropPreview,
    isPointerOverPlaylist,
    setIsPointerOverPlaylist,
    lastHoverPlacement,
    setLastHoverPlacement,
  } = usePlaylistUiState({
    initialBarWidth: INITIAL_BAR_WIDTH,
    defaultPlaylistBars: DEFAULT_PLAYLIST_BARS,
  });

  const {
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
  } = usePlaylistStoreState();

  usePlaylistPatternSelectionRef(patternSelectionForInsertRef);
  const { getAudioAnalysis, audioAnalysisCache } = usePlaylistAudioAnalysis({
    buildWaveformEnvelopeFn: buildWaveformEnvelope,
    waveformBins: AUDIO_WAVEFORM_BINS,
  });

  const {
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
  } = usePlaylistDerivedState({
    patterns,
    channels,
    clips,
    activePatternId,
    transportMode,
    isPlaying,
    currentStep16,
    playlistBarCount,
    barWidth,
    snapOptions: SNAP_OPTIONS,
    snapKey,
    playheadPhaseCompensation: PLAYLIST_PLAYHEAD_STEP_PHASE_COMPENSATION,
  });

  usePlaylistPlayheadClock({
    playheadStep,
    playheadStepRef,
    playheadStepTimestampRef,
  });

  usePlaylistPlayheadAnimation({
    playheadRef,
    playheadStepRef,
    playheadStepTimestampRef,
    isPlaying,
    bpm,
    timelineSteps,
    barWidth,
    clampFn: clamp,
  });

  usePlaylistSnapMenuDismiss({
    isSnapMenuOpen,
    snapMenuRef,
    setIsSnapMenuOpen,
  });

  usePlaylistHeaderAlignment({
    playlistBodyRef,
    playlistHeaderRef,
    barWidth,
  });

  usePlaylistPreventBrowserZoom({
    playlistShellRef,
  });

  usePlaylistDropPreviewCleanup({
    setDropPreview,
  });

  const {
    onPlaylistBodyScroll,
    onPlaylistBodyWheel,
    onPlaylistLengthChange,
    onPlaylistHeaderMouseDown,
  } = usePlaylistViewportHandlers({
    playlistBodyRef,
    playlistHeaderRef,
    barWidth,
    minBarWidth: MIN_BAR_WIDTH,
    maxBarWidth: MAX_BAR_WIDTH,
    minPlaylistBars: MIN_PLAYLIST_BARS,
    maxPlaylistBars: MAX_PLAYLIST_BARS,
    setBarWidth,
    setPlaylistBarCount,
    dispatch,
    setTransportModeAction: setTransportMode,
    setPlayheadStepAction: setPlayheadStep,
    clampFn: clamp,
  });

  // Keep clip drag/resize mechanics in a dedicated hook so PlaylistWindow focuses on wiring.
  const { startResize, startResizeFromStart, startMove } =
    usePlaylistClipInteractions({
      dispatch,
      playlistBarCount,
      snapBarSize,
      minClipBarLength: MIN_CLIP_BAR_LENGTH,
      lastTouchedAudioClipRef,
      patternSelectionForInsertRef,
      clampFn: clamp,
      quantizeBySnapFn: quantizeBySnap,
      setActivePatternAction: setActivePattern,
      setPlaylistClipLengthAction: setPlaylistClipLength,
      setPlaylistClipTrimStartAction: setPlaylistClipTrimStart,
      setPlaylistClipPlacementAction: setPlaylistClipPlacement,
    });

  const {
    normalizePatternIds,
    getDraggedPatternIdsWithFallback,
    hasDraggedPatternData,
    getDraggedSamplePayload,
    hasDraggedSampleData,
    resolveBarStartFromPointer,
    buildDropPlacements,
    placePatternsOnTrack,
    placeAudioClipOnTrack,
  } = usePlaylistDropPlacement({
    patternsById,
    patterns,
    tracks,
    activePatternId,
    playlistBarCount,
    snapBarSize,
    bpm,
    dispatch,
    getAudioAnalysis,
    audioClipFallbackBarLength: AUDIO_CLIP_FALLBACK_BAR_LENGTH,
    minClipBarLength: MIN_CLIP_BAR_LENGTH,
    lastTouchedAudioClipRef,
    patternSelectionForInsertRef,
    clampFn: clamp,
    quantizeBySnapFn: quantizeBySnap,
    getTargetAudioClipBarLengthFn: getTargetAudioClipBarLength,
    getPatternDragSessionFn: getPatternDragSession,
    normalizePatternIdsFn: normalizePatternIdsFromUtils,
    getDraggedPatternIdsWithFallbackFn: getDraggedPatternIdsWithFallbackFromUtils,
    hasDraggedPatternDataFn: hasDraggedPatternDataFromUtils,
    getDraggedSamplePayloadFn: getDraggedSamplePayloadFromUtils,
    hasDraggedSampleDataFn: hasDraggedSampleDataFromUtils,
    resolveBarStartFromPointerFn: resolveBarStartFromPointerFromUtils,
    addPlaylistPatternClipAction: addPlaylistPatternClip,
    setActivePatternAction: setActivePattern,
    addPlaylistSampleAsChannelAction: addPlaylistSampleAsChannel,
    patternDragMime: PATTERN_DRAG_MIME,
    sampleDragMime: SAMPLE_DRAG_MIME,
  });

  const { createTrackGridHandlers } = usePlaylistTrackGridHandlers({
    patternsById,
    patternSelectionForInsertRef,
    lastTouchedAudioClipRef,
    dispatch,
    setLastHoverPlacement,
    setDropPreview,
    addPlaylistPatternClipAction: addPlaylistPatternClip,
    addPlaylistAudioClipAction: addPlaylistAudioClip,
    hasDraggedSampleData,
    getDraggedSamplePayload,
    hasDraggedPatternData,
    resolveBarStartFromPointer,
    buildDropPlacements,
    normalizePatternIds,
    getDraggedPatternIdsWithFallback,
    placeAudioClipOnTrack,
    placePatternsOnTrack,
    dropPreview,
  });

  usePlaylistAudioClipMaintenance({
    clips,
    channelsById,
    bpm,
    dispatch,
    audioAnalysisCache,
    getAudioAnalysis,
    minClipBarLength: MIN_CLIP_BAR_LENGTH,
    getSafeSampleSettingsFn: getSafeSampleSettings,
    toSafeSampleUrlFn: toSafeSampleUrl,
    getTargetAudioClipBarLengthFn: getTargetAudioClipBarLength,
    clampFn: clamp,
    setPlaylistClipLengthAction: setPlaylistClipLength,
  });

  usePlaylistPasteShortcut({
    playlistShellRef,
    isPointerOverPlaylist,
    tracks,
    lastHoverPlacement,
    playlistBarCount,
    clipboardPatternIds,
    patternSelectionForInsertRef,
    normalizePatternIds,
    placePatternsOnTrack,
    lastTouchedAudioClipRef,
    clampFn: clamp,
    onPasteAudioClip: function (payload) {
      dispatch(addPlaylistAudioClip(payload));
    },
  });

  return (
    <section
      ref={playlistShellRef}
      className="playlist-shell"
      onMouseEnter={function () {
        setIsPointerOverPlaylist(true);
      }}
      onMouseLeave={function () {
        setIsPointerOverPlaylist(false);
      }}
      style={{
        "--playlist-bar-width": barWidth + "px",
        "--playlist-snap-width": snapLineWidth + "px",
        "--playlist-snap-opacity": String(snapLineOpacity),
      }}
    >
      <PlaylistTopControls
        snapMenuRef={snapMenuRef}
        isSnapMenuOpen={isSnapMenuOpen}
        setIsSnapMenuOpen={setIsSnapMenuOpen}
        activeSnap={activeSnap}
        SNAP_OPTIONS={SNAP_OPTIONS}
        snapKey={snapKey}
        setSnapKey={setSnapKey}
        onAddTrack={function () {
          dispatch(addPlaylistTrack());
        }}
        minPlaylistBars={MIN_PLAYLIST_BARS}
        maxPlaylistBars={MAX_PLAYLIST_BARS}
        playlistBarCount={playlistBarCount}
        onPlaylistLengthChange={onPlaylistLengthChange}
        songLoopEnabled={songLoopEnabled}
        onSongLoopEnabledChange={function (enabled) {
          dispatch(setSongLoopEnabled(enabled));
        }}
        playlistHeaderRef={playlistHeaderRef}
        onPlaylistHeaderMouseDown={onPlaylistHeaderMouseDown}
        barWidth={barWidth}
        timelineWidth={timelineWidth}
      />

      <div
        ref={playlistBodyRef}
        className="playlist-body"
        onScroll={onPlaylistBodyScroll}
        onWheel={onPlaylistBodyWheel}
      >
        <PlaylistTracksCanvas
          tracks={tracks}
          clips={clips}
          currentStep16={currentStep16}
          isPlaying={isPlaying}
          timelineWidth={timelineWidth}
          playheadRef={playheadRef}
          playlistBarCount={playlistBarCount}
          createTrackGridHandlers={createTrackGridHandlers}
          patternsById={patternsById}
          activePatternId={activePatternId}
          channelsById={channelsById}
          audioAnalysisCache={audioAnalysisCache}
          previewNotesByPatternId={previewNotesByPatternId}
          bpm={bpm}
          barWidth={barWidth}
          onStartMove={startMove}
          onRemoveClip={function (clipId) {
            dispatch(removePlaylistClip(clipId));
          }}
          onOpenSampleSettings={function (channelId) {
            dispatch(setActiveChannel(channelId));
            dispatch(openWindow("sampleSettings"));
          }}
          onOpenPattern={function (patternId) {
            dispatch(setActivePattern(patternId));
            patternSelectionForInsertRef.current = patternId;
            window.dispatchEvent(
              new CustomEvent("openstudio:playlist-pattern-focus", {
                detail: {
                  patternId,
                },
              }),
            );
            dispatch(openWindow("channelRack"));
          }}
          onStartResizeFromStart={startResizeFromStart}
          onStartResize={startResize}
        />
      </div>
    </section>
  );
}


