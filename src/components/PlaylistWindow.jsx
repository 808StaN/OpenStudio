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
import { C5_PITCH } from "../utils/patternNotes";

const BAR_COUNT = 16;
const BASE_BAR_WIDTH = 56;
const PLAYLIST_ZOOM_X = 3;
const INITIAL_BAR_WIDTH = Math.round(BASE_BAR_WIDTH * PLAYLIST_ZOOM_X);
const MIN_BAR_WIDTH = 42;
const MAX_BAR_WIDTH = 320;
const DEFAULT_PATTERN_COLOR = "#4bef9f";
const MIN_CLIP_BAR_LENGTH = 1 / 16;
const MIDI_PITCH_MIN = 0;
const MIDI_PITCH_MAX = 127;

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
  const [barWidth, setBarWidth] = useState(INITIAL_BAR_WIDTH);
  const [snapKey, setSnapKey] = useState("bar");
  const [isSnapMenuOpen, setIsSnapMenuOpen] = useState(false);

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

  const timelineWidth = BAR_COUNT * barWidth;
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
    const barWidthPx = rect.width / BAR_COUNT;
    const startClientX = event.clientX;
    const initialLength = Math.max(1, Math.round(Number(clip.barLength || 1)));
    const maxTrackLength = Math.max(1, BAR_COUNT - clip.barStart + 1);

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
      const barWidthPx = rect.width / BAR_COUNT;
      const deltaBars = Math.round(
        (moveEvent.clientX - startClientX) / Math.max(1, barWidthPx),
      );
      const maxBarStart = Math.max(1, BAR_COUNT - clipLength + 1);
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

  return (
    <section
      ref={playlistShellRef}
      className="playlist-shell"
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
      </div>

      <div className="playlist-header-shell">
        <div
          ref={playlistHeaderRef}
          className="playlist-header"
          style={{
            gridTemplateColumns:
              "92px repeat(" + BAR_COUNT + ", " + barWidth + "px)",
            width: 92 + timelineWidth,
          }}
        >
          <div className="bar-label empty" />
          {Array.from({ length: BAR_COUNT }).map(function (_, index) {
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
              Math.floor((x / rect.width) * BAR_COUNT) + 1,
              1,
              BAR_COUNT,
            );

            dispatch(
              addPlaylistPatternClip({
                patternId: activePatternId,
                trackId: track.id,
                barStart,
              }),
            );
          };

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
                className="track-grid"
                data-track-id={track.id}
                onMouseDown={onTrackGridMouseDown}
              >
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
                          ((clip.barStart - 1) / BAR_COUNT) * 100 +
                          "% + 0.5px)",
                        width:
                          "calc(" +
                          (clip.barLength / BAR_COUNT) * 100 +
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
