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
import { ClipPreviewNotes } from "./playlist/ClipPreviewNotes";
import { PlaylistTopControls } from "./playlist/PlaylistTopControls";
import {
  buildWaveformEnvelope,
  buildWaveformPathData,
  clamp,
  getAudioClipWaveformWindow,
  getEnvelopePeakAbs,
  getNormalizeGainFromPeak,
  getPatternPreviewNotes,
  getTargetAudioClipBarLength,
  quantizeBySnap,
  withAlpha,
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
const DEFAULT_PATTERN_COLOR = "#4bef9f";
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
  const previewCacheRef = useRef(new Map());
  const snapMenuRef = useRef(null);
  const playlistShellRef = useRef(null);
  const playlistBodyRef = useRef(null);
  const playlistHeaderRef = useRef(null);
  const playheadRef = useRef(null);
  const audioDecodeContextRef = useRef(null);
  const audioAnalysisCacheRef = useRef(new Map());
  const audioAnalysisPromiseRef = useRef(new Map());
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

  useEffect(function () {
    const onPatternSelectionChanged = function (event) {
      const nextPatternId = String(event?.detail?.patternId || "").trim();
      patternSelectionForInsertRef.current = nextPatternId || null;
    };

    window.addEventListener(
      "openstudio:pattern-list-selection-changed",
      onPatternSelectionChanged,
    );

    return function () {
      window.removeEventListener(
        "openstudio:pattern-list-selection-changed",
        onPatternSelectionChanged,
      );
    };
  }, []);

  const ensureAudioDecodeContext = function () {
    if (!audioDecodeContextRef.current) {
      audioDecodeContextRef.current = new AudioContext();
    }

    return audioDecodeContextRef.current;
  };

  const getAudioAnalysis = async function (samplePath) {
    const safePath = toSafeSampleUrl(samplePath);
    if (!safePath) {
      return null;
    }

    const cached = audioAnalysisCacheRef.current.get(safePath);
    if (cached) {
      return cached;
    }

    const pending = audioAnalysisPromiseRef.current.get(safePath);
    if (pending) {
      return pending;
    }

    const request = (async function () {
      const audioCtx = ensureAudioDecodeContext();
      if (audioCtx.state === "suspended") {
        await audioCtx.resume();
      }

      const response = await fetch(safePath);
      if (!response.ok) {
        throw new Error("Cannot load audio clip");
      }

      const data = await response.arrayBuffer();
      const buffer = await audioCtx.decodeAudioData(data.slice(0));
      const analysis = {
        durationSec: Math.max(0.01, Number(buffer.duration || 0.01)),
        waveformEnvelope: buildWaveformEnvelope(buffer, AUDIO_WAVEFORM_BINS),
      };

      audioAnalysisCacheRef.current.set(safePath, analysis);
      return analysis;
    })();

    audioAnalysisPromiseRef.current.set(safePath, request);

    try {
      return await request;
    } catch {
      return null;
    } finally {
      audioAnalysisPromiseRef.current.delete(safePath);
    }
  };

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

  const previewNotesByPatternId = patterns.reduce(function (acc, pattern) {
    const cached = previewCacheRef.current.get(pattern.id);
    if (
      cached &&
      cached.lengthSteps === pattern.lengthSteps &&
      cached.stepGrid === pattern.stepGrid &&
      cached.pianoPreview === pattern.pianoPreview
    ) {
      acc[pattern.id] = cached.notes;
      return acc;
    }

    const nextNotes = getPatternPreviewNotes(pattern);
    previewCacheRef.current.set(pattern.id, {
      lengthSteps: pattern.lengthSteps,
      stepGrid: pattern.stepGrid,
      pianoPreview: pattern.pianoPreview,
      notes: nextNotes,
    });
    acc[pattern.id] = nextNotes;
    return acc;
  }, {});

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

  useEffect(
    function () {
      if (playheadStepRef.current === playheadStep) {
        return;
      }

      playheadStepRef.current = playheadStep;
      playheadStepTimestampRef.current = performance.now();
    },
    [playheadStep],
  );

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
        const progress = clamp(elapsed / stepDurationMs, 0, 0.999);
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
    [isPlaying, bpm, timelineSteps, barWidth, playheadStep],
  );

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
    [isSnapMenuOpen],
  );

  useEffect(
    function () {
      const viewport = playlistBodyRef.current;
      const header = playlistHeaderRef.current;
      if (!viewport || !header) {
        return;
      }

      header.style.transform = "translateX(" + -viewport.scrollLeft + "px)";
    },
    [barWidth],
  );

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
  }, []);

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
  }, []);

  const onPlaylistBodyScroll = function (event) {
    const header = playlistHeaderRef.current;
    if (!header) {
      return;
    }

    header.style.transform =
      "translateX(" + -event.currentTarget.scrollLeft + "px)";
  };

  const onPlaylistBodyWheel = function (event) {
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
    const pointerX = clamp(event.clientX - rect.left, 0, viewport.clientWidth);
    const previousBarWidth = barWidth;
    const nextBarWidth = clamp(
      previousBarWidth + (event.deltaY < 0 ? 8 : -8),
      MIN_BAR_WIDTH,
      MAX_BAR_WIDTH,
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
  };

  const onPlaylistLengthChange = function (event) {
    const parsed = Number(event.target.value);
    if (!Number.isFinite(parsed)) {
      return;
    }

    setPlaylistBarCount(
      clamp(Math.round(parsed), MIN_PLAYLIST_BARS, MAX_PLAYLIST_BARS),
    );
  };

  const onPlaylistHeaderMouseDown = function (event) {
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

    const localX = clamp(event.clientX - rect.left, 0, rect.width);
    const stepOffsetInBar = clamp(
      Math.floor((localX / rect.width) * 16),
      0,
      15,
    );

    const nextStep = Math.max(0, barIndex * 16 + stepOffsetInBar);

    dispatch(setTransportMode("song"));
    dispatch(setPlayheadStep(nextStep));
  };

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
    const seen = new Set();

    return (rawIds || [])
      .map(function (patternId) {
        return String(patternId || "").trim();
      })
      .filter(function (patternId) {
        if (!patternId || !patternsById[patternId] || seen.has(patternId)) {
          return false;
        }

        seen.add(patternId);
        return true;
      });
  };

  const getDraggedPatternIds = function (event) {
    const rawPayload = event.dataTransfer?.getData(PATTERN_DRAG_MIME);
    if (rawPayload) {
      try {
        const payload = JSON.parse(rawPayload);
        const fromArray = normalizePatternIds(payload.patternIds);
        if (fromArray.length > 0) {
          return fromArray;
        }

        const patternId = String(payload.patternId || "").trim();
        if (patternId && patternsById[patternId]) {
          return [patternId];
        }
      } catch {
        return [];
      }
    }

    const textPatternId = String(
      event.dataTransfer?.getData("text/plain") || "",
    ).trim();
    if (textPatternId && patternsById[textPatternId]) {
      return [textPatternId];
    }

    return [];
  };

  const getDraggedPatternIdsWithFallback = function (event) {
    const idsFromSession = normalizePatternIds(getPatternDragSession());
    const idsFromDataTransfer = getDraggedPatternIds(event);

    if (idsFromSession.length > 1) {
      return idsFromSession;
    }

    if (idsFromDataTransfer.length > 0) {
      return idsFromDataTransfer;
    }

    return idsFromSession;
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
    const types = Array.from(event.dataTransfer?.types || []);
    if (types.includes(PATTERN_DRAG_MIME)) {
      return true;
    }

    return normalizePatternIds(getPatternDragSession()).length > 0;
  };

  const getDraggedSamplePayload = function (event) {
    const rawPayloads = [
      String(event.dataTransfer?.getData(SAMPLE_DRAG_MIME) || ""),
      String(event.dataTransfer?.getData("text/plain") || ""),
    ].filter(Boolean);

    for (let index = 0; index < rawPayloads.length; index += 1) {
      try {
        const payload = JSON.parse(rawPayloads[index]);
        const samplePath = String(payload.samplePath || "").trim();
        if (!samplePath) {
          continue;
        }

        return {
          samplePath,
          clipName: String(payload.file || "").trim() || "Audio",
        };
      } catch {
        continue;
      }
    }

    return null;
  };

  const hasDraggedSampleData = function (event) {
    const types = Array.from(event.dataTransfer?.types || []);
    return types.includes(SAMPLE_DRAG_MIME);
  };

  const resolveBarStartFromPointer = function (event, trackElement) {
    const rect = trackElement.getBoundingClientRect();
    const x = clamp(event.clientX - rect.left, 0, rect.width);
    const rawBarStart = (x / Math.max(1, rect.width)) * playlistBarCount + 1;
    const snappedBarStart = quantizeBySnap(rawBarStart, snapBarSize);
    return clamp(snappedBarStart, 1, playlistBarCount);
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

          let analysis = audioAnalysisCacheRef.current.get(safePath);
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
    [clips, channelsById, bpm, dispatch],
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
            if (audioAnalysisCacheRef.current.has(safePath)) {
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
    [clips, bpm],
  );

  useEffect(
    function () {
      const shouldIgnoreShortcutTarget = function (target) {
        if (!(target instanceof HTMLElement)) {
          return false;
        }

        if (target.isContentEditable) {
          return true;
        }

        return Boolean(
          target.closest("input, textarea, select, [contenteditable='true']"),
        );
      };

      const onKeyDown = function (event) {
        const isPasteShortcut =
          (event.ctrlKey || event.metaKey) &&
          !event.shiftKey &&
          event.code === "KeyV";
        if (!isPasteShortcut) {
          return;
        }

        const root = playlistShellRef.current;
        const activeElement = document.activeElement;
        const hasContext =
          isPointerOverPlaylist ||
          (root instanceof HTMLElement && root.contains(activeElement));

        if (!hasContext || shouldIgnoreShortcutTarget(event.target)) {
          return;
        }

        const fallbackTrackId = tracks[0]?.id;
        const targetTrackId = lastHoverPlacement?.trackId || fallbackTrackId;
        if (!targetTrackId) {
          return;
        }

        const targetBarStart = clamp(
          lastHoverPlacement?.barStart ?? 1,
          1,
          playlistBarCount,
        );

        const selectedPatternId = patternSelectionForInsertRef.current;
        if (selectedPatternId) {
          const patternIds = normalizePatternIds(clipboardPatternIds);
          const patternIdsToPaste =
            patternIds.length > 0
              ? patternIds
              : normalizePatternIds([selectedPatternId]);

          if (patternIdsToPaste.length > 0) {
            event.preventDefault();
            placePatternsOnTrack(
              targetTrackId,
              targetBarStart,
              patternIdsToPaste,
            );
            return;
          }
        }

        const touchedAudioClip = lastTouchedAudioClipRef.current;
        if (!touchedAudioClip?.samplePath) {
          return;
        }

        event.preventDefault();
        dispatch(
          addPlaylistAudioClip({
            trackId: targetTrackId,
            barStart: targetBarStart,
            barLength: touchedAudioClip.barLength,
            samplePath: touchedAudioClip.samplePath,
            clipName: touchedAudioClip.audioName,
            channelId: touchedAudioClip.channelId,
            sourceOffsetSteps: touchedAudioClip.sourceOffsetSteps,
          }),
        );
      };

      window.addEventListener("keydown", onKeyDown);
      return function () {
        window.removeEventListener("keydown", onKeyDown);
      };
    },
    [
      clipboardPatternIds,
      isPointerOverPlaylist,
      lastHoverPlacement,
      tracks,
      placePatternsOnTrack,
      playlistBarCount,
    ],
  );

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
          const clipsOnTrack = clips.filter(function (clip) {
            return clip.trackId === track.id;
          });

          clipsOnTrack.sort(function (a, b) {
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
              <article
                className="playlist-track"
                key={track.id}
                style={{
                  gridTemplateColumns: "92px " + timelineWidth + "px",
                  width: 92 + timelineWidth,
                }}
              >
              <div className="track-name">{track.name}</div>
              <div
                className={
                  "track-grid" +
                  (dropPlacementsOnTrack.length > 0 ? " is-drop-target" : "")
                }
                data-track-id={track.id}
                onMouseDown={onTrackGridMouseDown}
                onMouseMove={onTrackGridMouseMove}
                onDragOver={onTrackGridDragOver}
                onDragLeave={onTrackGridDragLeave}
                onDrop={onTrackGridDrop}
              >
                {dropPlacementsOnTrack.map(function (placement) {
                  const previewPattern = patternsById[placement.patternId];
                  const previewColor =
                    placement.clipType === "audio"
                      ? "#69b5ff"
                      : previewPattern?.color || DEFAULT_PATTERN_COLOR;
                  const previewBarLength = clamp(
                    placement.barLength,
                    MIN_CLIP_BAR_LENGTH,
                    Math.max(
                      MIN_CLIP_BAR_LENGTH,
                      playlistBarCount - placement.barStart + 1,
                    ),
                  );

                  return (
                    <div
                      key={
                        "drop-" + placement.trackId + "-" + placement.patternId
                      }
                      className="track-drop-preview"
                      style={{
                        left:
                          "calc(" +
                          ((placement.barStart - 1) / playlistBarCount) * 100 +
                          "% + 0.5px)",
                        width:
                          "calc(" +
                          (previewBarLength / playlistBarCount) * 100 +
                          "% - 1px)",
                        borderColor: withAlpha(previewColor, 0.95),
                        backgroundColor: withAlpha(previewColor, 0.22),
                        boxShadow:
                          "inset 0 0 0 1px " +
                          withAlpha(previewColor, 0.72) +
                          ", 0 0 10px " +
                          withAlpha(previewColor, 0.28),
                      }}
                    />
                  );
                })}
                {clipsOnTrack.map(function (clip) {
                  const isAudioClip = clip.clipType === "audio";
                  const pattern = isAudioClip
                    ? null
                    : patternsById[clip.patternId];
                  const clipChannel = isAudioClip
                    ? channelsById[String(clip.channelId || "").trim()]
                    : null;
                  const audioAnalysis = isAudioClip
                    ? audioAnalysisCacheRef.current.get(
                        toSafeSampleUrl(clip.samplePath),
                      )
                    : null;
                  const waveformEnvelope = audioAnalysis?.waveformEnvelope || null;
                  const waveformNormalizeGain = getNormalizeGainFromPeak(
                    getEnvelopePeakAbs(waveformEnvelope),
                    Boolean(clipChannel?.sampleSettings?.normalize),
                  );
                  const clipColor = isAudioClip
                    ? "#69b5ff"
                    : pattern?.color || DEFAULT_PATTERN_COLOR;
                  const isActivePattern =
                    !isAudioClip && activePatternId === clip.patternId;
                  const patternLength = Math.max(1, pattern?.lengthSteps || 16);
                  const clipLengthSteps = Math.max(
                    1,
                    Math.round(Number(clip.barLength || 1) * 16),
                  );
                  const clipOffsetSteps = Math.max(
                    0,
                    Number(clip.sourceOffsetSteps || 0),
                  );
                  const previewNotes =
                    previewNotesByPatternId[clip.patternId] || [];
                  const secondsPerBar = (60 / Math.max(1, bpm)) * 4;
                  const clipDurationSec = Math.max(
                    0.01,
                    Number(clip.barLength || 1) * secondsPerBar,
                  );
                  const clipOffsetSec = Math.max(
                    0,
                    Number(clipOffsetSteps || 0) * (60 / Math.max(1, bpm) / 4),
                  );
                  const waveformWindow = getAudioClipWaveformWindow(
                    Number(audioAnalysis?.durationSec || 0.01),
                    clipDurationSec,
                    clipOffsetSec,
                    clipChannel?.sampleSettings,
                    bpm,
                  );
                  const sourceDurationSec = waveformWindow.sourceDurationSec;
                  const sourceStartSec = waveformWindow.sourceStartSec;
                  const visibleDurationSec = waveformWindow.visibleClipDurationSec;
                  const sourcePerClipSecond = waveformWindow.sourcePerClipSecond;
                  const clipWidthPx = Math.max(
                    1,
                    Number(clip.barLength || 1) * barWidth,
                  );
                  const waveformPointCount = isAudioClip
                    ? Math.max(
                        32,
                        Math.min(
                          AUDIO_WAVEFORM_MAX_BARS * 3,
                          Math.round(clipWidthPx * AUDIO_WAVEFORM_DETAIL_DENSITY),
                        ),
                      )
                    : 0;
                  const waveformPathData =
                    isAudioClip && waveformEnvelope
                      ? buildWaveformPathData({
                          envelope: waveformEnvelope,
                          pointCount: waveformPointCount,
                          sourceStartSec,
                          sourceDurationSec,
                          sourcePerClipSecond,
                          visibleDurationSec,
                          clipDurationSec,
                          waveformGain: waveformNormalizeGain,
                        })
                      : "";

                  return (
                    <div
                      key={clip.id}
                      className={
                        "clip" +
                        (isActivePattern ? " is-active" : "") +
                        (isAudioClip ? " is-audio" : "")
                      }
                      style={{
                        borderColor: withAlpha(clipColor, 0.9),
                        boxShadow: isActivePattern
                          ? "inset 0 0 0 1px " +
                            withAlpha(clipColor, 0.8) +
                            ", inset 0 1px 0 rgba(255, 255, 255, 0.32), 0 0 10px " +
                            withAlpha(clipColor, 0.34)
                          : "inset 0 1px 0 rgba(255, 255, 255, 0.2), 0 0 8px " +
                            withAlpha(clipColor, 0.24),
                        left:
                          "calc(" +
                          ((clip.barStart - 1) / playlistBarCount) * 100 +
                          "% + 0.5px)",
                        width:
                          "calc(" +
                          (clip.barLength / playlistBarCount) * 100 +
                          "% - 1px)",
                      }}
                      onMouseDown={function (event) {
                        startMove(event, clip);
                      }}
                      onContextMenu={function (event) {
                        event.preventDefault();
                        event.stopPropagation();
                        dispatch(removePlaylistClip(clip.id));
                      }}
                      onDoubleClick={function (event) {
                        if (
                          event.target.closest(".clip-resize-handle") ||
                          event.target.closest(".clip-resize-handle-start")
                        ) {
                          return;
                        }

                        event.preventDefault();
                        event.stopPropagation();

                        if (isAudioClip) {
                          if (!clip.channelId) {
                            return;
                          }

                          dispatch(setActiveChannel(clip.channelId));
                          dispatch(openWindow("sampleSettings"));
                          return;
                        }

                        if (!clip.patternId) {
                          return;
                        }

                        dispatch(setActivePattern(clip.patternId));
                        patternSelectionForInsertRef.current = clip.patternId;
                        window.dispatchEvent(
                          new CustomEvent("openstudio:playlist-pattern-focus", {
                            detail: {
                              patternId: clip.patternId,
                            },
                          }),
                        );
                        dispatch(openWindow("channelRack"));
                      }}
                    >
                      {isAudioClip ? (
                        <div className="clip-audio-preview">
                          <svg
                            className="clip-wave-svg"
                            viewBox="0 0 100 100"
                            preserveAspectRatio="none"
                            aria-hidden="true"
                          >
                            {waveformPathData ? (
                              <path
                                className="clip-wave-fill"
                                d={waveformPathData}
                                style={{
                                  fill: withAlpha(clipColor, 0.58),
                                  stroke: withAlpha(clipColor, 0.94),
                                }}
                              />
                            ) : null}
                          </svg>
                        </div>
                      ) : (
                        <ClipPreviewNotes
                          clipId={clip.id}
                          previewNotes={previewNotes}
                          clipLengthSteps={clipLengthSteps}
                          patternLength={patternLength}
                          clipOffsetSteps={clipOffsetSteps}
                        />
                      )}
                      <span className="clip-label">
                        <span
                          style={
                            isAudioClip
                              ? null
                              : { color: pattern?.color || DEFAULT_PATTERN_COLOR }
                          }
                        >
                          {isAudioClip
                            ? clip.audioName || "Audio"
                            : pattern?.name || "Pattern"}
                        </span>
                      </span>
                      <button
                        type="button"
                        className="clip-resize-handle-start"
                        title={
                          isAudioClip
                            ? "Trim audio clip start"
                            : "Trim pattern clip start"
                        }
                        aria-label={
                          isAudioClip
                            ? "Trim audio clip start"
                            : "Trim pattern clip start"
                        }
                        onMouseDown={function (event) {
                          startResizeFromStart(event, clip);
                        }}
                      />
                      <button
                        type="button"
                        className="clip-resize-handle"
                        title={
                          isAudioClip
                            ? "Resize audio clip"
                            : "Resize pattern clip"
                        }
                        aria-label={
                          isAudioClip
                            ? "Resize audio clip"
                            : "Resize pattern clip"
                        }
                        onMouseDown={function (event) {
                          startResize(event, clip, track.id);
                        }}
                      />
                    </div>
                  );
                })}
              </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

