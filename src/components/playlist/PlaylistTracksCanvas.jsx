import { PlaylistTrackRow } from "./PlaylistTrackRow";

// Renders playlist tracks area including playhead overlay and all track rows.
export function PlaylistTracksCanvas({
  tracks,
  clips,
  currentStep16,
  isPlaying,
  timelineWidth,
  playheadRef,
  playlistBarCount,
  createTrackGridHandlers,
  patternsById,
  activePatternId,
  channelsById,
  audioAnalysisCache,
  previewNotesByPatternId,
  bpm,
  barWidth,
  onStartMove,
  onRemoveClip,
  onOpenSampleSettings,
  onOpenPattern,
  onStartResizeFromStart,
  onStartResize,
}) {
  return (
    <div className="playlist-tracks-shell" style={{ width: 92 + timelineWidth }}>
      {isPlaying || currentStep16 > 0 ? (
        <div className="playlist-playhead-layer" style={{ width: timelineWidth + "px" }}>
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
            onStartMove={onStartMove}
            onRemoveClip={onRemoveClip}
            onOpenSampleSettings={onOpenSampleSettings}
            onOpenPattern={onOpenPattern}
            onStartResizeFromStart={onStartResizeFromStart}
            onStartResize={onStartResize}
          />
        );
      })}
    </div>
  );
}
