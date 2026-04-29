import { toSafeSampleUrl } from "../../utils/sampleUrl";
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

// Builds a stable view model for rendering one playlist clip.
// Keeping these calculations outside JSX keeps the component slim and easier to test.
export function usePlaylistClipVisualModel({
  clip,
  activePatternId,
  patternsById,
  channelsById,
  audioAnalysisCache,
  previewNotesByPatternId,
  bpm,
  barWidth,
  playlistBarCount,
}) {
  const isAudioClip = clip.clipType === "audio";
  const pattern = isAudioClip ? null : patternsById[clip.patternId];
  const clipChannel = isAudioClip
    ? channelsById[String(clip.channelId || "").trim()]
    : null;

  const audioAnalysis = isAudioClip
    ? audioAnalysisCache.get(toSafeSampleUrl(clip.samplePath))
    : null;
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
  const clipOffsetSec = Math.max(
    0,
    Number(clipOffsetSteps || 0) * (60 / Math.max(1, bpm) / 4),
  );

  const waveformWindow = getAudioClipWaveformWindow(
    Number(audioAnalysis?.durationSec || 0.01),
    clipDurationSec,
    clipOffsetSec,
    clipChannel?.sampleSettings,
    bpm,
  );

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
          sourceStartSec: waveformWindow.sourceStartSec,
          sourceDurationSec: waveformWindow.sourceDurationSec,
          sourcePerClipSecond: waveformWindow.sourcePerClipSecond,
          visibleDurationSec: waveformWindow.visibleClipDurationSec,
          clipDurationSec,
          waveformGain: waveformNormalizeGain,
        })
      : "";

  const clipClassName =
    "clip" + (isActivePattern ? " is-active" : "") + (isAudioClip ? " is-audio" : "");
  const clipStyle = {
    borderColor: withAlpha(clipColor, 0.9),
    background: isAudioClip
      ? undefined
      : "linear-gradient(180deg, " +
        withAlpha(clipColor, isActivePattern ? 0.24 : 0.21) +
        " 0%, " +
        withAlpha(clipColor, isActivePattern ? 0.15 : 0.13) +
        " 100%)",
    boxShadow: isActivePattern
      ? "inset 0 0 0 1px " +
        withAlpha(clipColor, 0.8) +
        ", inset 0 1px 0 rgba(255, 255, 255, 0.22), inset 0 0 0 999px rgba(0, 0, 0, 0.06), 0 0 10px " +
        withAlpha(clipColor, 0.34)
      : "inset 0 1px 0 rgba(255, 255, 255, 0.14), inset 0 0 0 999px rgba(0, 0, 0, 0.08), 0 0 8px " +
        withAlpha(clipColor, 0.24),
    left: "calc(" + ((clip.barStart - 1) / playlistBarCount) * 100 + "% + 0.5px)",
    width: "calc(" + (clip.barLength / playlistBarCount) * 100 + "% - 1px)",
  };

  const clipLabel = isAudioClip ? clip.audioName || "Audio" : pattern?.name || "Pattern";
  const clipLabelStyle = isAudioClip
    ? null
    : { color: pattern?.color || DEFAULT_PATTERN_COLOR };

  return {
    isAudioClip,
    pattern,
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
  };
}
