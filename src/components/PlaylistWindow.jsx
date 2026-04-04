import { useDispatch, useSelector } from "react-redux";
import {
  addPlaylistPatternClip,
  removePlaylistClip,
  setActivePattern,
} from "../store";

const BAR_COUNT = 16;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function PlaylistWindow() {
  const dispatch = useDispatch();

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

  return (
    <section className="playlist-shell">
      <div className="playlist-header">
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
            <article className="playlist-track" key={track.id}>
              <div className="track-name">{track.name}</div>
              <div className="track-grid" onMouseDown={onTrackGridMouseDown}>
                {clipsOnTrack.map(function (clip) {
                  const pattern = patternsById[clip.patternId];
                  const isActivePattern = activePatternId === clip.patternId;

                  return (
                    <div
                      key={clip.id}
                      className={"clip" + (isActivePattern ? " is-active" : "")}
                      style={{
                        left: ((clip.barStart - 1) / BAR_COUNT) * 100 + "%",
                        width: (clip.barLength / BAR_COUNT) * 100 + "%",
                      }}
                      onMouseDown={function (event) {
                        event.stopPropagation();
                        if (event.button === 0) {
                          dispatch(setActivePattern(clip.patternId));
                        }
                      }}
                      onContextMenu={function (event) {
                        event.preventDefault();
                        event.stopPropagation();
                        dispatch(removePlaylistClip(clip.id));
                      }}
                    >
                      {pattern?.name || "Pattern"}
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
