import { useSelector } from "react-redux";

export function PlaylistWindow() {
  const tracks = useSelector(function (state) {
    return state.daw.project.playlistTracks;
  });
  const clips = useSelector(function (state) {
    return state.daw.project.playlistClips;
  });

  return (
    <section className="playlist-shell">
      <div className="playlist-header">
        <div className="bar-label empty" />
        {Array.from({ length: 16 }).map(function (_, index) {
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

          return (
            <article className="playlist-track" key={track.id}>
              <div className="track-name">{track.name}</div>
              <div className="track-grid">
                {clipsOnTrack.map(function (clip) {
                  return (
                    <div
                      key={clip.id}
                      className="clip"
                      style={{
                        left: ((clip.barStart - 1) / 16) * 100 + "%",
                        width: (clip.barLength / 16) * 100 + "%",
                      }}
                    >
                      Pattern 1
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
