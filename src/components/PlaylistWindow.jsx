import { useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
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
import { PlaylistTrackRow } from "./playlist/PlaylistTrackRow";
import { usePlaylistAudioAnalysis } from "./playlist/usePlaylistAudioAnalysis";
import { usePlaylistAudioClipMaintenance } from "./playlist/usePlaylistAudioClipMaintenance";
import { usePlaylistDropPlacement } from "./playlist/usePlaylistDropPlacement";
import { usePlaylistPasteShortcut } from "./playlist/usePlaylistPasteShortcut";
import { usePlaylistClipInteractions } from "./playlist/usePlaylistClipInteractions";
import { usePlaylistPatternSelectionRef } from "./playlist/usePlaylistPatternSelectionRef";
import { usePlaylistTrackGridHandlers } from "./playlist/usePlaylistTrackGridHandlers";
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
  getPatternPreviewNotes,
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
  const lastTouchedAudioClipRef = useRef(null);
  const patternSelectionForInsertRef = useRef(null);
  const snapMenuRef = useRef(null);
  const playlistShellRef = useRef(null);
  const playlistBodyRef = useRef(null);
  const playlistHeaderRef = useRef(null);
  const playheadRef = useRef(null);
  const playheadStepRef = useRef(0);
  const playheadStepTimestampRef = useRef(0);
  const [barWidth, setBarWidth] = useState(INITIAL_BAR_WIDTH);
  const [playlistBarCount, setPlaylistBarCount] = useState(
    DEFAULT_PLAYLIST_BARS,
  );
  const [snapKey, setSnapKey] = useState("1-2-beat");
  const [isSnapMenuOpen, setIsSnapMenuOpen] = useState(false);
  const [dropPreview, setDropPreview] = useState(null);
  const [isPointerOverPlaylist, setIsPointerOverPlaylist] = useState(false);
  const [lastHoverPlacement, setLastHoverPlacement] = useState(null);

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

  usePlaylistPatternSelectionRef(patternSelectionForInsertRef);
  const { getAudioAnalysis, audioAnalysisCache } = usePlaylistAudioAnalysis({
    buildWaveformEnvelopeFn: buildWaveformEnvelope,
    waveformBins: AUDIO_WAVEFORM_BINS,
  });

  const patternsById = patterns.reduce(function (acc, pattern) {
    acc[pattern.id] = pattern;
    return acc;
  }, {});
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
    ? (normalizedPlayheadStep +
        PLAYLIST_PLAYHEAD_STEP_PHASE_COMPENSATION +
        timelineSteps) %
      timelineSteps
    : normalizedPlayheadStep;
  const activeSnap =
    SNAP_OPTIONS.find(function (option) {
      return option.key === snapKey;
    }) || SNAP_OPTIONS[11];
  const snapLineWidth = activeSnap.stepSize
    ? Math.max(1, (activeSnap.stepSize / 16) * barWidth)
    : 1;
  const snapLineOpacity = activeSnap.stepSize ? 0.09 : 0;
  const snapBarSize = activeSnap.stepSize
    ? Math.max(1 / 16, activeSnap.stepSize / 16)
    : null;

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
        <div
          className="playlist-tracks-shell"
          style={{ width: 92 + timelineWidth }}
        >
          {isPlaying || currentStep16 > 0 ? (
            <div
              className="playlist-playhead-layer"
              style={{ width: timelineWidth + "px" }}
            >
              <span ref={playheadRef} className="playlist-playhead-line" />
            </div>
          ) : null}
          {tracks.map(function (track) {
            const clipsOnTrack = clips
              .filter(function (clip) {
                return clip.trackId === track.id;
              })
              .sort(function (a, b) {
                return a.barStart - b.barStart;
              });

            const {
              onTrackGridMouseDown,
              onTrackGridMouseMove,
              onTrackGridDragOver,
              onTrackGridDragLeave,
              onTrackGridDrop,
              dropPlacementsOnTrack,
            } = createTrackGridHandlers(track.id);

            return (
              <PlaylistTrackRow
                key={track.id}
                track={track}
                timelineWidth={timelineWidth}
                playlistBarCount={playlistBarCount}
                dropPlacementsOnTrack={dropPlacementsOnTrack}
                onTrackGridMouseDown={onTrackGridMouseDown}
                onTrackGridMouseMove={onTrackGridMouseMove}
                onTrackGridDragOver={onTrackGridDragOver}
                onTrackGridDragLeave={onTrackGridDragLeave}
                onTrackGridDrop={onTrackGridDrop}
                patternsById={patternsById}
                clipsOnTrack={clipsOnTrack}
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
            );
          })}
        </div>
      </div>
    </section>
  );
}


