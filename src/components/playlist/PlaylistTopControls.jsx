// Top controls and timeline header for Playlist window.
export function PlaylistTopControls(props) {
  const {
    snapMenuRef,
    isSnapMenuOpen,
    setIsSnapMenuOpen,
    activeSnap,
    SNAP_OPTIONS,
    snapKey,
    setSnapKey,
    onAddTrack,
    minPlaylistBars,
    maxPlaylistBars,
    playlistBarCount,
    onPlaylistLengthChange,
    songLoopEnabled,
    onSongLoopEnabledChange,
    playlistHeaderRef,
    onPlaylistHeaderMouseDown,
    barWidth,
    timelineWidth,
  } = props;

  return (
    <>
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

        <button type="button" className="playlist-add-track-btn" onClick={onAddTrack}>
          + Track
        </button>

        <label className="playlist-length-control">
          <span>Length</span>
          <input
            className="playlist-length-input"
            type="number"
            min={minPlaylistBars}
            max={maxPlaylistBars}
            step="1"
            value={playlistBarCount}
            onChange={onPlaylistLengthChange}
          />
        </label>

        <div className="playlist-loop-toggle" role="group" aria-label="Song loop">
          <span>Loop</span>
          <button
            type="button"
            className={"playlist-loop-btn" + (songLoopEnabled ? " is-active" : "")}
            onClick={function () {
              onSongLoopEnabledChange(true);
            }}
          >
            On
          </button>
          <button
            type="button"
            className={"playlist-loop-btn" + (!songLoopEnabled ? " is-active" : "")}
            onClick={function () {
              onSongLoopEnabledChange(false);
            }}
          >
            Off
          </button>
        </div>
      </div>

      <div className="playlist-header-shell">
        <div
          ref={playlistHeaderRef}
          className="playlist-header"
          onMouseDown={onPlaylistHeaderMouseDown}
          style={{
            gridTemplateColumns:
              "92px repeat(" + playlistBarCount + ", " + barWidth + "px)",
            width: 92 + timelineWidth,
          }}
        >
          <div className="bar-label empty" />
          {Array.from({ length: playlistBarCount }).map(function (_, index) {
            return (
              <div className="bar-cell" key={index} data-bar-index={index}>
                {index + 1}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
