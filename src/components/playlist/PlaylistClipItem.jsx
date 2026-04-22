import { ClipPreviewNotes } from "./ClipPreviewNotes";
import { withAlpha } from "./playlistUtils";
import { usePlaylistClipVisualModel } from "./usePlaylistClipVisualModel";

// Renders a single playlist clip (pattern or audio) with resize/move interactions.
export function PlaylistClipItem(props) {
  const {
    clip,
    activePatternId,
    patternsById,
    channelsById,
    audioAnalysisCache,
    previewNotesByPatternId,
    bpm,
    barWidth,
    playlistBarCount,
    onStartMove,
    onRemove,
    onOpenSampleSettings,
    onOpenPattern,
    onStartResizeFromStart,
    onStartResize,
    trackId,
  } = props;

  // Visual model is separated from JSX rendering so this component stays focused
  // on event wiring and DOM structure.
  const {
    isAudioClip,
    clipColor,
    clipClassName,
    clipStyle,
    clipLabel,
    clipLabelStyle,
    previewNotes,
    clipLengthSteps,
    patternLength,
    clipOffsetSteps,
    waveformPathData,
  } = usePlaylistClipVisualModel({
    clip,
    activePatternId,
    patternsById,
    channelsById,
    audioAnalysisCache,
    previewNotesByPatternId,
    bpm,
    barWidth,
    playlistBarCount,
  });

  return (
    <div
      key={clip.id}
      className={clipClassName}
      style={clipStyle}
      onMouseDown={function (event) {
        onStartMove(event, clip);
      }}
      onContextMenu={function (event) {
        event.preventDefault();
        event.stopPropagation();
        onRemove(clip.id);
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

          onOpenSampleSettings(clip.channelId);
          return;
        }

        if (!clip.patternId) {
          return;
        }

        onOpenPattern(clip.patternId);
      }}
    >
      {isAudioClip ? (
        <div className="clip-audio-preview">
          <svg className="clip-wave-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
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
        <span style={clipLabelStyle}>{clipLabel}</span>
      </span>
      <button
        type="button"
        className="clip-resize-handle-start"
        title={isAudioClip ? "Trim audio clip start" : "Trim pattern clip start"}
        aria-label={isAudioClip ? "Trim audio clip start" : "Trim pattern clip start"}
        onMouseDown={function (event) {
          onStartResizeFromStart(event, clip);
        }}
      />
      <button
        type="button"
        className="clip-resize-handle"
        title={isAudioClip ? "Resize audio clip" : "Resize pattern clip"}
        aria-label={isAudioClip ? "Resize audio clip" : "Resize pattern clip"}
        onMouseDown={function (event) {
          onStartResize(event, clip, trackId);
        }}
      />
    </div>
  );
}
