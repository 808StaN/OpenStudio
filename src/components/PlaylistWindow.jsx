import { memo, useMemo, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  addPlaylistPatternClip,
  removePlaylistClip,
  setActivePattern,
  setPlaylistClipPlacement,
  setPlaylistClipLength,
} from "../store";
import { C5_PITCH, PIANO_PITCH_MAX, PIANO_PITCH_MIN } from "../utils/patternNotes";

const BAR_COUNT = 16;
const BASE_BAR_WIDTH = 56;
const PLAYLIST_ZOOM_X = 1.5;
const BAR_WIDTH = Math.round(BASE_BAR_WIDTH * PLAYLIST_ZOOM_X);
const DEFAULT_PATTERN_COLOR = "#4bef9f";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hexToRgb(hexColor) {
  const safe = String(hexColor || "").trim().replace("#", "");
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

  Object.entries(pattern.pianoPreview || {}).forEach(function ([channelId, notes]) {
    (notes || []).forEach(function (note) {
      const start = Math.max(
        0,
        Math.min(patternLength - 0.0625, Number(note.start || 0)),
      );
      const maxLen = Math.max(0.0625, patternLength - start);
      merged.push({
        id:
          note.id ||
          "piano-" + channelId + "-" + String(note.start) + "-" + String(note.pitch),
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
      const rendered = [];
      const repeatCount = Math.max(1, Math.ceil(clipLengthSteps / patternLength));

      for (let repeatIndex = 0; repeatIndex < repeatCount; repeatIndex += 1) {
        for (let noteIndex = 0; noteIndex < previewNotes.length; noteIndex += 1) {
          const note = previewNotes[noteIndex];
          const noteStart = note.start + repeatIndex * patternLength;
          if (noteStart >= clipLengthSteps) {
            continue;
          }

          const noteLength = Math.max(
            0.0625,
            Math.min(
              Number(note.length || 1),
              Math.max(0.0625, clipLengthSteps - noteStart),
            ),
          );
          const left = (noteStart / clipLengthSteps) * 100;
          const width = Math.max(0.8, (noteLength / clipLengthSteps) * 100);
          const clampedPitch = Math.max(
            PIANO_PITCH_MIN,
            Math.min(PIANO_PITCH_MAX, Math.round(note.pitch || C5_PITCH)),
          );
          const pitchRange = Math.max(1, PIANO_PITCH_MAX - PIANO_PITCH_MIN);
          const pitchRatio = (PIANO_PITCH_MAX - clampedPitch) / pitchRange;
          const top = 6 + pitchRatio * 78;

          rendered.push(
            <span
              key={clipId + "-" + repeatIndex + "-" + note.id + "-" + noteIndex}
              className="clip-mini-note"
              style={{
                left: left + "%",
                width: width + "%",
                top: top + "%",
              }}
            />,
          );

          if (rendered.length >= 700) {
            break;
          }
        }

        if (rendered.length >= 700) {
          break;
        }
      }

      return rendered;
    },
    [clipId, previewNotes, clipLengthSteps, patternLength],
  );

  return <div className="clip-note-preview">{renderedPreviewNotes}</div>;
});

export function PlaylistWindow() {
  const dispatch = useDispatch();
  const previewCacheRef = useRef(new Map());

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

  const timelineWidth = BAR_COUNT * BAR_WIDTH;

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
      const deltaBars = Math.round(deltaPx / Math.max(1, barWidthPx));
      const nextLength = clamp(initialLength + deltaBars, 1, maxTrackLength);

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

      const targetTrackId = targetGrid.getAttribute("data-track-id") || fallbackTrackId;
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
      className="playlist-shell"
      style={{
        "--playlist-bar-width": BAR_WIDTH + "px",
      }}
    >
      <div
        className="playlist-header"
        style={{
          gridTemplateColumns: "92px repeat(" + BAR_COUNT + ", " + BAR_WIDTH + "px)",
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

      <div className="playlist-body">
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
                  const previewNotes = previewNotesByPatternId[clip.patternId] || [];

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
                      <span className="clip-label">{pattern?.name || "Pattern"}</span>
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
