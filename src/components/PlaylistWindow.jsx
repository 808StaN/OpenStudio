import { useEffect, useMemo, useRef, useState } from "react";
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
import { getSafeSampleSettings } from "../audio/domain/sampleSettings";
import { PlaylistTopControls } from "./playlist/PlaylistTopControls";
import { PlaylistTrackRow } from "./playlist/PlaylistTrackRow";
import { usePlaylistAudioAnalysis } from "./playlist/usePlaylistAudioAnalysis";
import { usePlaylistPasteShortcut } from "./playlist/usePlaylistPasteShortcut";
import { usePlaylistPatternSelectionRef } from "./playlist/usePlaylistPatternSelectionRef";
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
  getDraggedPatternIdsWithFallback as getDraggedPatternIdsWithFallbackFromUtils,
  getDraggedSamplePayload as getDraggedSamplePayloadFromUtils,
  hasDraggedPatternData as hasDraggedPatternDataFromUtils,
  hasDraggedSampleData as hasDraggedSampleDataFromUtils,
  normalizePatternIds as normalizePatternIdsFromUtils,
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
  const [, setWaveformTick] = useState(0);

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
    const initialLength = Math.max(
      MIN_CLIP_BAR_LENGTH,
      Number(clip.barLength || 1),
    );
    const maxTrackLength = Math.max(
      MIN_CLIP_BAR_LENGTH,
      playlistBarCount - Number(clip.barStart || 1) + 1,
    );

    const onMouseMove = function (moveEvent) {
      const deltaPx = moveEvent.clientX - startClientX;
      const deltaBarsRaw = deltaPx / Math.max(1, barWidthPx);
      const nextRawLength = initialLength + deltaBarsRaw;
      const snappedLength = quantizeBySnap(nextRawLength, snapBarSize);
      const nextLength = clamp(
        snappedLength,
        MIN_CLIP_BAR_LENGTH,
        maxTrackLength,
      );

      dispatch(
        setPlaylistClipLength({
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
    const startBar = clamp(Number(clip.barStart || 1), 1, playlistBarCount);
    const startLength = Math.max(
      MIN_CLIP_BAR_LENGTH,
      Number(clip.barLength || 1),
    );
    const startOffsetSteps = Math.max(0, Number(clip.sourceOffsetSteps || 0));
    const clipEndBar = startBar + startLength;
    const sourceEndSteps = startOffsetSteps + startLength * 16;

    const onMouseMove = function (moveEvent) {
      const deltaBarsRaw =
        (moveEvent.clientX - startClientX) / Math.max(1, barWidthPx);
      const nextRawStart = startBar + deltaBarsRaw;
      const snappedStart = quantizeBySnap(nextRawStart, snapBarSize);

      const maxStartByClipEnd = Math.max(1, clipEndBar - MIN_CLIP_BAR_LENGTH);
      const nextStart = clamp(snappedStart, 1, maxStartByClipEnd);
      const nextLengthRaw = Math.max(
        MIN_CLIP_BAR_LENGTH,
        clipEndBar - nextStart,
      );
      const nextLength = Math.min(nextLengthRaw, sourceEndSteps / 16);
      const normalizedStart = clipEndBar - nextLength;
      const nextOffsetSteps = Math.max(0, sourceEndSteps - nextLength * 16);

      dispatch(
        setPlaylistClipTrimStart({
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
      lastTouchedAudioClipRef.current = {
        samplePath: String(clip.samplePath || "").trim(),
        audioName: String(clip.audioName || "Audio").trim() || "Audio",
        barLength: Math.max(MIN_CLIP_BAR_LENGTH, Number(clip.barLength || 1)),
        sourceOffsetSteps: Math.max(0, Number(clip.sourceOffsetSteps || 0)),
        channelId: String(clip.channelId || "").trim() || null,
      };

      patternSelectionForInsertRef.current = null;
      window.dispatchEvent(new CustomEvent("openstudio:playlist-audio-focus"));
    }

    if (clip.clipType !== "audio" && clip.patternId) {
      dispatch(setActivePattern(clip.patternId));
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
    const startBar = clamp(Number(clip.barStart || 1), 1, playlistBarCount);
    const clipLength = Math.max(
      MIN_CLIP_BAR_LENGTH,
      Number(clip.barLength || 1),
    );
    let fallbackTrackId = clip.trackId;

    const findTargetGrid = function (moveEvent) {
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
      const snappedStart = quantizeBySnap(nextRawStart, snapBarSize);
      const maxBarStart = Math.max(1, playlistBarCount - clipLength + 1);
      const barStart = clamp(snappedStart, 1, maxBarStart);
      fallbackTrackId = targetTrackId;

      dispatch(
        setPlaylistClipPlacement({
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

  const getPatternBarLength = function (patternId) {
    const pattern = patternsById[patternId];
    if (!pattern) {
      return 1;
    }

    return Math.max(1, Math.ceil((pattern.lengthSteps || 16) / 16));
  };

  const normalizePatternIds = function (rawIds) {
    return normalizePatternIdsFromUtils(rawIds, patternsById);
  };

  const getDraggedPatternIdsWithFallback = function (event) {
    return getDraggedPatternIdsWithFallbackFromUtils({
      event,
      patternDragMime: PATTERN_DRAG_MIME,
      patternsById,
      sessionPatternIds: getPatternDragSession(),
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
    return hasDraggedPatternDataFromUtils({
      event,
      patternDragMime: PATTERN_DRAG_MIME,
      patternsById,
      sessionPatternIds: getPatternDragSession(),
    });
  };

  const getDraggedSamplePayload = function (event) {
    return getDraggedSamplePayloadFromUtils({
      event,
      sampleDragMime: SAMPLE_DRAG_MIME,
    });
  };

  const hasDraggedSampleData = function (event) {
    return hasDraggedSampleDataFromUtils({
      event,
      sampleDragMime: SAMPLE_DRAG_MIME,
    });
  };

  const resolveBarStartFromPointer = function (event, trackElement) {
    return resolveBarStartFromPointerFromUtils({
      event,
      trackElement,
      playlistBarCount,
      snapBarSize,
      clampFn: clamp,
      quantizeFn: quantizeBySnap,
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

    const barStart = clamp(startBar, 1, playlistBarCount);

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
        addPlaylistPatternClip({
          patternId: placement.patternId,
          trackId: placement.trackId,
          barStart: placement.barStart,
          barLength: placement.barLength,
        }),
      );
    });

    dispatch(setActivePattern(placements[placements.length - 1].patternId));
  };

  const placeAudioClipOnTrack = function (trackId, startBar, samplePayload) {
    if (!trackId || !samplePayload?.samplePath) {
      return;
    }

    void (async function () {
      const analysis = await getAudioAnalysis(samplePayload.samplePath);
      const resolvedBars = analysis
        ? getTargetAudioClipBarLength(analysis.durationSec, null, bpm)
        : AUDIO_CLIP_FALLBACK_BAR_LENGTH;
      const normalizedBarLength = clamp(resolvedBars, MIN_CLIP_BAR_LENGTH, 64);
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
        addPlaylistSampleAsChannel({
          trackId,
          barStart: clamp(startBar, 1, playlistBarCount),
          barLength: normalizedBarLength,
          samplePath: safeSamplePath,
          clipName: samplePayload.clipName,
        }),
      );
    })();
  };

  useEffect(
    function () {
      const audioClips = clips.filter(function (clip) {
        return (
          String(clip.clipType || "pattern").toLowerCase() === "audio" &&
          String(clip.channelId || "").trim()
        );
      });
      if (audioClips.length === 0) {
        return;
      }

      let isCanceled = false;

      const syncClipLengths = async function () {
        for (let index = 0; index < audioClips.length; index += 1) {
          if (isCanceled) {
            return;
          }

          const clip = audioClips[index];
          if (clip.autoStretchSync === false) {
            continue;
          }

          const channel = channelsById[String(clip.channelId || "").trim()];
          if (!channel) {
            continue;
          }

          const settings = getSafeSampleSettings(channel.sampleSettings);
          const stretchMode = String(settings.stretchMode || "none").toLowerCase();
          const timeMode = String(settings.stretchTimeMode || "none").toLowerCase();
          if (stretchMode === "none" || timeMode === "none") {
            continue;
          }

          const safePath = toSafeSampleUrl(clip.samplePath || channel.sampleRef);
          if (!safePath) {
            continue;
          }

          let analysis = audioAnalysisCache.get(safePath);
          if (!analysis) {
            analysis = await getAudioAnalysis(safePath);
          }
          if (!analysis) {
            continue;
          }

          const targetBars = getTargetAudioClipBarLength(
            analysis.durationSec,
            settings,
            bpm,
          );
          const currentBars = clamp(
            Number(clip.barLength || 1),
            MIN_CLIP_BAR_LENGTH,
            64,
          );

          if (Math.abs(targetBars - currentBars) <= 0.0005) {
            continue;
          }

          dispatch(
            setPlaylistClipLength({
              clipId: clip.id,
              barLength: targetBars,
            }),
          );
        }
      };

      void syncClipLengths();

      return function () {
        isCanceled = true;
      };
    },
    [clips, channelsById, bpm, dispatch, audioAnalysisCache, getAudioAnalysis],
  );

  useEffect(
    function () {
      const audioClips = clips.filter(function (clip) {
        return String(clip.clipType || "pattern").toLowerCase() === "audio";
      });

      if (audioClips.length === 0) {
        return;
      }

      let isCanceled = false;

      const warmup = async function () {
        await Promise.all(
          audioClips.map(async function (clip) {
            const samplePath = String(clip.samplePath || "").trim();
            if (!samplePath) {
              return;
            }

            const safePath = toSafeSampleUrl(samplePath);
            if (audioAnalysisCache.has(safePath)) {
              return;
            }

            await getAudioAnalysis(safePath);
          }),
        );

        if (!isCanceled) {
          setWaveformTick(function (value) {
            return value + 1;
          });
        }
      };

      void warmup();

      return function () {
        isCanceled = true;
      };
    },
    [clips, bpm, audioAnalysisCache, getAudioAnalysis],
  );

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

            const onTrackGridMouseDown = function (event) {
            if (event.button !== 0) {
              return;
            }

            const hasClipTarget = event.target.closest(".clip");
            if (hasClipTarget) {
              return;
            }

            const barStart = resolveBarStartFromPointer(
              event,
              event.currentTarget,
            );
            setLastHoverPlacement({
              trackId: track.id,
              barStart,
            });

            const selectedPatternId = patternSelectionForInsertRef.current;
            if (selectedPatternId && patternsById[selectedPatternId]) {
              dispatch(
                addPlaylistPatternClip({
                  patternId: selectedPatternId,
                  trackId: track.id,
                  barStart,
                }),
              );
              return;
            }

            const touchedAudioClip = lastTouchedAudioClipRef.current;
            if (!touchedAudioClip?.samplePath) {
              return;
            }

            dispatch(
              addPlaylistAudioClip({
                trackId: track.id,
                barStart,
                barLength: touchedAudioClip.barLength,
                samplePath: touchedAudioClip.samplePath,
                clipName: touchedAudioClip.audioName,
                channelId: touchedAudioClip.channelId,
                sourceOffsetSteps: touchedAudioClip.sourceOffsetSteps,
              }),
            );
          };

            const onTrackGridDragOver = function (event) {
            const acceptsSample = hasDraggedSampleData(event);
            const draggedSample = acceptsSample
              ? getDraggedSamplePayload(event)
              : null;
            const acceptsPattern = hasDraggedPatternData(event);

            if (!acceptsSample && !acceptsPattern) {
              return;
            }

            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";

            const barStart = resolveBarStartFromPointer(
              event,
              event.currentTarget,
            );

            const placements = draggedSample
              ? [
                  {
                    clipType: "audio",
                    trackId: track.id,
                    barStart,
                    barLength: 2,
                    clipName: draggedSample.clipName,
                    samplePath: draggedSample.samplePath,
                  },
                ]
              : acceptsSample
                ? [
                    {
                      clipType: "audio",
                      trackId: track.id,
                      barStart,
                      barLength: 2,
                      clipName: "Audio",
                      samplePath: "",
                    },
                  ]
                : buildDropPlacements(
                    track.id,
                    barStart,
                    normalizePatternIds(
                      getDraggedPatternIdsWithFallback(event),
                    ),
                  ).map(function (placement) {
                    return {
                      ...placement,
                      clipType: "pattern",
                    };
                  });

            if (placements.length === 0) {
              return;
            }

            setDropPreview(function (prev) {
              const samePlacements =
                prev &&
                prev.placements.length === placements.length &&
                prev.placements.every(function (item, index) {
                  const next = placements[index];
                  return (
                    item.trackId === next.trackId &&
                    item.barStart === next.barStart &&
                    item.barLength === next.barLength &&
                    item.clipType === next.clipType &&
                    item.patternId === next.patternId &&
                    item.samplePath === next.samplePath
                  );
                });

              if (
                prev &&
                prev.trackId === track.id &&
                samePlacements &&
                Math.abs(prev.barStart - barStart) <= 0.0001
              ) {
                return prev;
              }

              return {
                trackId: track.id,
                barStart,
                placements,
              };
            });
          };

            const onTrackGridMouseMove = function (event) {
            const barStart = resolveBarStartFromPointer(
              event,
              event.currentTarget,
            );
            setLastHoverPlacement(function (prev) {
              if (
                prev &&
                prev.trackId === track.id &&
                Math.abs(prev.barStart - barStart) <= 0.0001
              ) {
                return prev;
              }

              return {
                trackId: track.id,
                barStart,
              };
            });
          };

            const onTrackGridDragLeave = function (event) {
            const pointerX = event.clientX;
            const pointerY = event.clientY;

            requestAnimationFrame(function () {
              const hoveredElement = document.elementFromPoint(
                pointerX,
                pointerY,
              );
              if (hoveredElement?.closest(".track-grid")) {
                return;
              }

              setDropPreview(function (prev) {
                if (!prev || prev.trackId !== track.id) {
                  return prev;
                }

                return null;
              });
            });
          };

            const onTrackGridDrop = function (event) {
            const acceptsSample = hasDraggedSampleData(event);
            const draggedSample = acceptsSample
              ? getDraggedSamplePayload(event)
              : null;
            const acceptsPattern = hasDraggedPatternData(event);

            if (!acceptsSample && !acceptsPattern) {
              return;
            }

            event.preventDefault();

            const barStart = resolveBarStartFromPointer(
              event,
              event.currentTarget,
            );

            if (acceptsSample) {
              if (!draggedSample) {
                setDropPreview(null);
                return;
              }

              placeAudioClipOnTrack(track.id, barStart, draggedSample);
            } else {
              const patternIds = normalizePatternIds(
                getDraggedPatternIdsWithFallback(event),
              );
              if (patternIds.length === 0) {
                return;
              }

              placePatternsOnTrack(track.id, barStart, patternIds);
            }

            setDropPreview(null);
          };

            const dropPlacementsOnTrack = (dropPreview?.placements || []).filter(
              function (placement) {
                return placement.trackId === track.id;
              },
            );

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

