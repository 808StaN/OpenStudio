import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  addPlaylistPatternClip,
  addPlaylistTrack,
  removePlaylistClip,
  setActivePattern,
  setPlaylistClipPlacement,
  setPlaylistClipLength,
} from "../store";
import { getPatternDragSession } from "../utils/patternDragSession";
import { C5_PITCH } from "../utils/patternNotes";

const DEFAULT_PLAYLIST_BARS = 16;
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
const MIDI_PITCH_MIN = 0;
const MIDI_PITCH_MAX = 127;
const PLAYLIST_PLAYHEAD_STEP_PHASE_COMPENSATION = 1;

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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function quantizeBySnap(value, snapSize) {
  if (!snapSize) {
    return value;
  }

  return Math.round(value / snapSize) * snapSize;
}

function hexToRgb(hexColor) {
  const safe = String(hexColor || "")
    .trim()
    .replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(safe)) {
    return { r: 75, g: 239, b: 159 };
  }

  return {
    r: Number.parseInt(safe.slice(0, 2), 16),
    g: Number.parseInt(safe.slice(2, 4), 16),
    b: Number.parseInt(safe.slice(4, 6), 16),
  };
}

function withAlpha(hexColor, alpha) {
  const rgb = hexToRgb(hexColor);
  return "rgba(" + rgb.r + ", " + rgb.g + ", " + rgb.b + ", " + alpha + ")";
}

function getPatternPreviewNotes(pattern) {
  if (!pattern) {
    return [];
  }

  const patternLength = Math.max(1, pattern.lengthSteps || 16);
  const merged = [];

  Object.entries(pattern.stepGrid || {}).forEach(function ([channelId, row]) {
    (row || []).forEach(function (isOn, stepIndex) {
      if (!isOn) {
        return;
      }

      merged.push({
        id: "step-" + channelId + "-" + stepIndex,
        start: stepIndex,
        length: 1,
        pitch: C5_PITCH,
      });
    });
  });

  Object.entries(pattern.pianoPreview || {}).forEach(function ([
    channelId,
    notes,
  ]) {
    (notes || []).forEach(function (note) {
      const start = Math.max(
        0,
        Math.min(patternLength - 0.0625, Number(note.start || 0)),
      );
      const maxLen = Math.max(0.0625, patternLength - start);
      merged.push({
        id:
          note.id ||
          "piano-" +
            channelId +
            "-" +
            String(note.start) +
            "-" +
            String(note.pitch),
        start,
        length: Math.max(0.0625, Math.min(maxLen, Number(note.length || 1))),
        pitch: Math.round(note.pitch || C5_PITCH),
      });
    });
  });

  merged.sort(function (a, b) {
    if (a.start !== b.start) {
      return a.start - b.start;
    }

    return b.pitch - a.pitch;
  });

  return merged;
}

const ClipPreviewNotes = memo(function ClipPreviewNotes(props) {
  const { clipId, previewNotes, clipLengthSteps, patternLength } = props;

  const renderedPreviewNotes = useMemo(
    function () {
      const visibleNotes = [];
      const visiblePatternSteps = Math.max(
        1,
        Math.min(patternLength, clipLengthSteps),
      );
      let minPitch = Infinity;
      let maxPitch = -Infinity;

      for (let noteIndex = 0; noteIndex < previewNotes.length; noteIndex += 1) {
        const note = previewNotes[noteIndex];
        const noteStart = Number(note.start || 0);
        if (noteStart >= visiblePatternSteps) {
          continue;
        }

        const noteLength = Math.max(
          0.0625,
          Math.min(
            Number(note.length || 1),
            Math.max(0.0625, visiblePatternSteps - noteStart),
          ),
        );
        const pitch = Math.max(
          MIDI_PITCH_MIN,
          Math.min(MIDI_PITCH_MAX, Math.round(note.pitch || C5_PITCH)),
        );

        minPitch = Math.min(minPitch, pitch);
        maxPitch = Math.max(maxPitch, pitch);
        visibleNotes.push({
          id: note.id,
          noteIndex,
          left: (noteStart / clipLengthSteps) * 100,
          width: Math.max(0.8, (noteLength / clipLengthSteps) * 100),
          pitch,
        });
      }

      if (visibleNotes.length === 0) {
        return [];
      }

      const pitchRange = maxPitch - minPitch;

      return visibleNotes.slice(0, 700).map(function (note) {
        const pitchRatio =
          pitchRange <= 0 ? 0.5 : (maxPitch - note.pitch) / pitchRange;
        const top = 6 + pitchRatio * 88;

        return (
          <span
            key={clipId + "-" + note.id + "-" + note.noteIndex}
            className="clip-mini-note"
            style={{
              left: note.left + "%",
              width: note.width + "%",
              top: top + "%",
            }}
          />
        );
      });
    },
    [clipId, previewNotes, clipLengthSteps, patternLength],
  );

  return <div className="clip-note-preview">{renderedPreviewNotes}</div>;
});

export function PlaylistWindow() {
  const dispatch = useDispatch();
  const previewCacheRef = useRef(new Map());
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
  const [snapKey, setSnapKey] = useState("bar");
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

  const patternsById = patterns.reduce(function (acc, pattern) {
    acc[pattern.id] = pattern;
    return acc;
  }, {});

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
    : 0;
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
    [isPlaying, bpm, timelineSteps, barWidth],
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
    const initialLength = Math.max(1, Math.round(Number(clip.barLength || 1)));
    const maxTrackLength = Math.max(1, playlistBarCount - clip.barStart + 1);

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
    dispatch(setActivePattern(clip.patternId));

    const startClientX = event.clientX;
    const startBar = Math.max(1, Math.round(Number(clip.barStart || 1)));
    const clipLength = Math.max(1, Math.round(Number(clip.barLength || 1)));
    const fallbackTrackId = clip.trackId;

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
      const deltaBars = Math.round(
        (moveEvent.clientX - startClientX) / Math.max(1, barWidthPx),
      );
      const maxBarStart = Math.max(1, playlistBarCount - clipLength + 1);
      const barStart = clamp(startBar + deltaBars, 1, maxBarStart);

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

    return normalizePatternIds([activePatternId]);
  };

  const hasDraggedPatternData = function (event) {
    const types = Array.from(event.dataTransfer?.types || []);
    return (
      types.includes(PATTERN_DRAG_MIME) ||
      types.includes("text/plain") ||
      types.includes("Text")
    );
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

        const patternIds = resolvePatternIdsForPlacement(clipboardPatternIds);
        if (patternIds.length === 0) {
          return;
        }

        const fallbackTrackId = tracks[0]?.id;
        const targetTrackId = lastHoverPlacement?.trackId || fallbackTrackId;
        if (!targetTrackId) {
          return;
        }

        event.preventDefault();
        placePatternsOnTrack(
          targetTrackId,
          clamp(lastHoverPlacement?.barStart ?? 1, 1, playlistBarCount),
          patternIds,
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
      resolvePatternIdsForPlacement,
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
      <div className="playlist-toolbar">
        <div className="playlist-snap-menu" ref={snapMenuRef}>
          <button
            type="button"
            className="playlist-snap-trigger"
            onClick={function () {
              setIsSnapMenuOpen(function (value) {
                return !value;
              });
            }}
          >
            Snap: {activeSnap.label}
          </button>

          {isSnapMenuOpen ? (
            <div className="playlist-snap-dropdown">
              {SNAP_OPTIONS.map(function (option) {
                return (
                  <label key={option.key} className="playlist-snap-option">
                    <input
                      type="radio"
                      name="playlist-snap"
                      checked={snapKey === option.key}
                      onChange={function () {
                        setSnapKey(option.key);
                        setIsSnapMenuOpen(false);
                      }}
                    />
                    <span>{option.label}</span>
                  </label>
                );
              })}
            </div>
          ) : null}
        </div>

        <button
          type="button"
          className="playlist-add-track-btn"
          onClick={function () {
            dispatch(addPlaylistTrack());
          }}
        >
          + Track
        </button>

        <label className="playlist-length-control">
          <span>Length</span>
          <input
            className="playlist-length-input"
            type="number"
            min={MIN_PLAYLIST_BARS}
            max={MAX_PLAYLIST_BARS}
            step="1"
            value={playlistBarCount}
            onChange={onPlaylistLengthChange}
          />
        </label>
      </div>

      <div className="playlist-header-shell">
        <div
          ref={playlistHeaderRef}
          className="playlist-header"
          style={{
            gridTemplateColumns:
              "92px repeat(" + playlistBarCount + ", " + barWidth + "px)",
            width: 92 + timelineWidth,
          }}
        >
          <div className="bar-label empty" />
          {Array.from({ length: playlistBarCount }).map(function (_, index) {
            return (
              <div className="bar-cell" key={index}>
                {index + 1}
              </div>
            );
          })}
        </div>
      </div>

      <div
        ref={playlistBodyRef}
        className="playlist-body"
        onScroll={onPlaylistBodyScroll}
        onWheel={onPlaylistBodyWheel}
      >
        {isPlaying ? (
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

            const rect = event.currentTarget.getBoundingClientRect();
            const x = clamp(event.clientX - rect.left, 0, rect.width);
            const barStart = clamp(
              Math.floor((x / rect.width) * playlistBarCount) + 1,
              1,
              playlistBarCount,
            );
            setLastHoverPlacement({
              trackId: track.id,
              barStart,
            });

            dispatch(
              addPlaylistPatternClip({
                patternId: activePatternId,
                trackId: track.id,
                barStart,
              }),
            );
          };

          const onTrackGridDragOver = function (event) {
            if (!hasDraggedPatternData(event)) {
              return;
            }

            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";

            const patternIds = resolvePatternIdsForPlacement(
              getDraggedPatternIdsWithFallback(event),
            );
            if (patternIds.length === 0) {
              return;
            }

            const barStart = resolveBarStartFromPointer(
              event,
              event.currentTarget,
            );
            const placements = buildDropPlacements(
              track.id,
              barStart,
              patternIds,
            );
            if (placements.length === 0) {
              return;
            }

            setDropPreview(function (prev) {
              const samePatternList =
                prev &&
                prev.patternIds.length === patternIds.length &&
                prev.patternIds.every(function (id, index) {
                  return id === patternIds[index];
                });

              if (
                prev &&
                prev.trackId === track.id &&
                samePatternList &&
                Math.abs(prev.barStart - barStart) <= 0.0001
              ) {
                return prev;
              }

              return {
                trackId: track.id,
                patternIds,
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
            if (!hasDraggedPatternData(event)) {
              return;
            }

            event.preventDefault();
            const patternIds = resolvePatternIdsForPlacement(
              getDraggedPatternIdsWithFallback(event),
            );
            if (patternIds.length === 0) {
              return;
            }

            const barStart = resolveBarStartFromPointer(
              event,
              event.currentTarget,
            );
            placePatternsOnTrack(track.id, barStart, patternIds);
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
                    previewPattern?.color || DEFAULT_PATTERN_COLOR;
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
                  const pattern = patternsById[clip.patternId];
                  const clipColor = pattern?.color || DEFAULT_PATTERN_COLOR;
                  const isActivePattern = activePatternId === clip.patternId;
                  const patternLength = Math.max(1, pattern?.lengthSteps || 16);
                  const clipLengthSteps = Math.max(
                    1,
                    Math.round(Number(clip.barLength || 1)) * 16,
                  );
                  const previewNotes =
                    previewNotesByPatternId[clip.patternId] || [];

                  return (
                    <div
                      key={clip.id}
                      className={"clip" + (isActivePattern ? " is-active" : "")}
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
                    >
                      <ClipPreviewNotes
                        clipId={clip.id}
                        previewNotes={previewNotes}
                        clipLengthSteps={clipLengthSteps}
                        patternLength={patternLength}
                      />
                      <span className="clip-label">
                        {pattern?.name || "Pattern"}
                      </span>
                      <button
                        type="button"
                        className="clip-resize-handle"
                        title="Resize pattern clip"
                        aria-label="Resize pattern clip"
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
    </section>
  );
}
