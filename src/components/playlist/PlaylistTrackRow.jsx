import { PlaylistClipItem } from "./PlaylistClipItem";
import { clamp, withAlpha } from "./playlistUtils";

const DEFAULT_PATTERN_COLOR = "#4bef9f";
const MIN_CLIP_BAR_LENGTH = 1 / 16;

// Renders one playlist track row with drop preview overlays and its clips.
export function PlaylistTrackRow(props) {
  const {
    track,
    timelineWidth,
    playlistBarCount,
    dropPlacementsOnTrack,
    onTrackGridMouseDown,
    onTrackGridMouseMove,
    onTrackGridDragOver,
    onTrackGridDragLeave,
    onTrackGridDrop,
    patternsById,
    clipsOnTrack,
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
  } = props;

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
        className={"track-grid" + (dropPlacementsOnTrack.length > 0 ? " is-drop-target" : "")}
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
            placement.clipType === "audio" ? "#69b5ff" : previewPattern?.color || DEFAULT_PATTERN_COLOR;
          const previewBarLength = clamp(
            placement.barLength,
            MIN_CLIP_BAR_LENGTH,
            Math.max(MIN_CLIP_BAR_LENGTH, playlistBarCount - placement.barStart + 1),
          );

          return (
            <div
              key={"drop-" + placement.trackId + "-" + placement.patternId}
              className="track-drop-preview"
              style={{
                left: "calc(" + ((placement.barStart - 1) / playlistBarCount) * 100 + "% + 0.5px)",
                width: "calc(" + (previewBarLength / playlistBarCount) * 100 + "% - 1px)",
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
          return (
            <PlaylistClipItem
              key={clip.id}
              clip={clip}
              activePatternId={activePatternId}
              patternsById={patternsById}
              channelsById={channelsById}
              audioAnalysisCache={audioAnalysisCache}
              previewNotesByPatternId={previewNotesByPatternId}
              bpm={bpm}
              barWidth={barWidth}
              playlistBarCount={playlistBarCount}
              onStartMove={onStartMove}
              onRemove={onRemoveClip}
              onOpenSampleSettings={onOpenSampleSettings}
              onOpenPattern={onOpenPattern}
              onStartResizeFromStart={onStartResizeFromStart}
              onStartResize={onStartResize}
              trackId={track.id}
            />
          );
        })}
      </div>
    </article>
  );
}
