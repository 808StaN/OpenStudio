import { DropdownMenu } from "../common/DropdownMenu";

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
        <DropdownMenu
          menuRef={snapMenuRef}
          triggerClassName="snap-trigger"
          triggerLabel={"Snap: " + activeSnap.label}
          isOpen={isSnapMenuOpen}
          setIsOpen={setIsSnapMenuOpen}
          options={SNAP_OPTIONS}
          activeKey={snapKey}
          onSelect={setSnapKey}
          radioName="playlist-snap"
        />

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
          <div className="playlist-loop-toggle-inner">
            <button
              type="button"
              className={songLoopEnabled ? "is-active" : ""}
              onClick={function () {
                onSongLoopEnabledChange(true);
              }}
            >
              On
            </button>
            <button
              type="button"
              className={!songLoopEnabled ? "is-active" : ""}
              onClick={function () {
                onSongLoopEnabledChange(false);
              }}
            >
              Off
            </button>
          </div>
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
