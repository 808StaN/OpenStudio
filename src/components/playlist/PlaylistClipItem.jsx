import { toSafeSampleUrl } from "../../utils/sampleUrl";
import { ClipPreviewNotes } from "./ClipPreviewNotes";
import {
  buildWaveformPathData,
  getAudioClipWaveformWindow,
  getEnvelopePeakAbs,
  getNormalizeGainFromPeak,
  withAlpha,
} from "./playlistUtils";

const DEFAULT_PATTERN_COLOR = "#4bef9f";
const AUDIO_WAVEFORM_DETAIL_DENSITY = 1.15;
const AUDIO_WAVEFORM_MAX_BARS = 520;

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

  const isAudioClip = clip.clipType === "audio";
  const pattern = isAudioClip ? null : patternsById[clip.patternId];
  const clipChannel = isAudioClip ? channelsById[String(clip.channelId || "").trim()] : null;
  const audioAnalysis = isAudioClip ? audioAnalysisCache.get(toSafeSampleUrl(clip.samplePath)) : null;
  const waveformEnvelope = audioAnalysis?.waveformEnvelope || null;
  const waveformNormalizeGain = getNormalizeGainFromPeak(
    getEnvelopePeakAbs(waveformEnvelope),
    Boolean(clipChannel?.sampleSettings?.normalize),
  );
  const clipColor = isAudioClip ? "#69b5ff" : pattern?.color || DEFAULT_PATTERN_COLOR;
  const isActivePattern = !isAudioClip && activePatternId === clip.patternId;
  const patternLength = Math.max(1, pattern?.lengthSteps || 16);
  const clipLengthSteps = Math.max(1, Math.round(Number(clip.barLength || 1) * 16));
  const clipOffsetSteps = Math.max(0, Number(clip.sourceOffsetSteps || 0));
  const previewNotes = previewNotesByPatternId[clip.patternId] || [];
  const secondsPerBar = (60 / Math.max(1, bpm)) * 4;
  const clipDurationSec = Math.max(0.01, Number(clip.barLength || 1) * secondsPerBar);
  const clipOffsetSec = Math.max(0, Number(clipOffsetSteps || 0) * (60 / Math.max(1, bpm) / 4));
  const waveformWindow = getAudioClipWaveformWindow(
    Number(audioAnalysis?.durationSec || 0.01),
    clipDurationSec,
    clipOffsetSec,
    clipChannel?.sampleSettings,
    bpm,
  );
  const sourceDurationSec = waveformWindow.sourceDurationSec;
  const sourceStartSec = waveformWindow.sourceStartSec;
  const visibleDurationSec = waveformWindow.visibleClipDurationSec;
  const sourcePerClipSecond = waveformWindow.sourcePerClipSecond;
  const clipWidthPx = Math.max(1, Number(clip.barLength || 1) * barWidth);
  const waveformPointCount = isAudioClip
    ? Math.max(
        32,
        Math.min(
          AUDIO_WAVEFORM_MAX_BARS * 3,
          Math.round(clipWidthPx * AUDIO_WAVEFORM_DETAIL_DENSITY),
        ),
      )
    : 0;
  const waveformPathData =
    isAudioClip && waveformEnvelope
      ? buildWaveformPathData({
          envelope: waveformEnvelope,
          pointCount: waveformPointCount,
          sourceStartSec,
          sourceDurationSec,
          sourcePerClipSecond,
          visibleDurationSec,
          clipDurationSec,
          waveformGain: waveformNormalizeGain,
        })
      : "";

  return (
    <div
      key={clip.id}
      className={
        "clip" + (isActivePattern ? " is-active" : "") + (isAudioClip ? " is-audio" : "")
      }
      style={{
        borderColor: withAlpha(clipColor, 0.9),
        boxShadow: isActivePattern
          ? "inset 0 0 0 1px " +
            withAlpha(clipColor, 0.8) +
            ", inset 0 1px 0 rgba(255, 255, 255, 0.32), 0 0 10px " +
            withAlpha(clipColor, 0.34)
          : "inset 0 1px 0 rgba(255, 255, 255, 0.2), 0 0 8px " +
            withAlpha(clipColor, 0.24),
        left: "calc(" + ((clip.barStart - 1) / playlistBarCount) * 100 + "% + 0.5px)",
        width: "calc(" + (clip.barLength / playlistBarCount) * 100 + "% - 1px)",
      }}
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
        <span style={isAudioClip ? null : { color: pattern?.color || DEFAULT_PATTERN_COLOR }}>
          {isAudioClip ? clip.audioName || "Audio" : pattern?.name || "Pattern"}
        </span>
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
