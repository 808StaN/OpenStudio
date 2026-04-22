import { getSafeSampleSettings } from "../../audio/domain/sampleSettings";
import { getTimeStretchProfile } from "../../audio/domain/timeStretch";
import { C5_PITCH } from "../../utils/patternNotes";

const MIN_CLIP_BAR_LENGTH = 1 / 16;
const MIDI_PITCH_MIN = 0;
const MIDI_PITCH_MAX = 127;
const AUDIO_WAVEFORM_BINS_FALLBACK = 2048;

// Generic numeric clamp used by drag math and waveform helpers.
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// Applies timeline snapping to bars/steps while dragging clips.
export function quantizeBySnap(value, snapSize) {
  if (!snapSize) {
    return value;
  }

  return Math.round(value / snapSize) * snapSize;
}

// Computes default bar-length for dropped audio based on stretch/time settings.
export function getTargetAudioClipBarLength(durationSec, sampleSettings, bpm) {
  const safeDuration = Math.max(0.01, Number(durationSec || 0.01));
  const settings = getSafeSampleSettings(sampleSettings);
  const stretchMode = String(settings.stretchMode || "none")
    .trim()
    .toLowerCase();
  const timeMode = String(settings.stretchTimeMode || "none")
    .trim()
    .toLowerCase();
  const secondsPerBar = (60 / Math.max(1, Number(bpm || 120))) * 4;

  let targetDurationSec = safeDuration;
  if (stretchMode !== "none" && timeMode !== "none") {
    const lengthFactor = clamp(Number(settings.lengthPct || 100) / 100, 0.005, 1);
    const sampleReadDuration = Math.max(0.01, safeDuration * lengthFactor);
    const baseRate = clamp(
      Math.pow(2, Number(settings.pitchCents || 0) / 1200),
      0.125,
      8,
    );
    const stretchProfile = getTimeStretchProfile(
      settings,
      sampleReadDuration,
      bpm,
      baseRate,
    );
    const naturalPlayableDuration = Math.max(
      0.01,
      sampleReadDuration / Math.max(0.125, stretchProfile.playbackRate || 1),
    );
    targetDurationSec = Math.max(
      0.01,
      stretchProfile.useGranularStretch
        ? stretchProfile.targetDurationSec
        : naturalPlayableDuration,
    );
  }

  return clamp(
    targetDurationSec / Math.max(0.001, secondsPerBar),
    MIN_CLIP_BAR_LENGTH,
    64,
  );
}

// Maps visible clip time window (trim/stretch aware) to source waveform window.
export function getAudioClipWaveformWindow(
  sourceDurationSec,
  clipDurationSec,
  clipOffsetSec,
  sampleSettings,
  bpm,
) {
  const safeSourceDurationSec = Math.max(0.01, Number(sourceDurationSec || 0.01));
  const safeClipDurationSec = Math.max(0.01, Number(clipDurationSec || 0.01));
  const safeClipOffsetSec = Math.max(0, Number(clipOffsetSec || 0));
  const settings = getSafeSampleSettings(sampleSettings);
  const lengthFactor = clamp(Number(settings.lengthPct || 100) / 100, 0.005, 1);
  const sampleReadDurationSec = Math.max(
    0.01,
    safeSourceDurationSec * lengthFactor,
  );
  const baseRate = clamp(
    Math.pow(2, Number(settings.pitchCents || 0) / 1200),
    0.125,
    8,
  );
  const stretchMode = String(settings.stretchMode || "none")
    .trim()
    .toLowerCase();
  const timeMode = String(settings.stretchTimeMode || "none")
    .trim()
    .toLowerCase();
  const hasTimeStretch = stretchMode !== "none" && timeMode !== "none";
  const stretchProfile = getTimeStretchProfile(
    settings,
    sampleReadDurationSec,
    bpm,
    baseRate,
  );
  const naturalPlayableDurationSec = Math.max(
    0.01,
    sampleReadDurationSec / Math.max(0.125, stretchProfile.playbackRate || 1),
  );
  const playableDurationSec = Math.max(
    0.01,
    hasTimeStretch && stretchProfile.useGranularStretch
      ? stretchProfile.targetDurationSec
      : naturalPlayableDurationSec,
  );
  const remainingPlayableDurationSec = Math.max(
    0,
    playableDurationSec - safeClipOffsetSec,
  );
  const visibleClipDurationSec = Math.max(
    0,
    Math.min(safeClipDurationSec, remainingPlayableDurationSec),
  );
  const sourcePerClipSecond =
    sampleReadDurationSec / Math.max(0.01, playableDurationSec);
  const sourceStartSec = Math.min(
    sampleReadDurationSec,
    safeClipOffsetSec * sourcePerClipSecond,
  );

  return {
    sourceDurationSec: safeSourceDurationSec,
    sampleReadDurationSec,
    sourceStartSec,
    visibleClipDurationSec,
    sourcePerClipSecond,
  };
}

// Converts `#rrggbb` to RGB channels; returns theme-safe default on bad input.
export function hexToRgb(hexColor) {
  const safe = String(hexColor || "")
    .trim()
    .replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(safe)) {
    return { r: 75, g: 239, b: 159 };
  }

  return {
    r: Number.parseInt(safe.slice(0, 2), 16),
    g: Number.parseInt(safe.slice(2, 4), 16),
    b: Number.parseInt(safe.slice(4, 6), 16),
  };
}

// Convenience helper for alpha color variants used by clip preview styles.
export function withAlpha(hexColor, alpha) {
  const rgb = hexToRgb(hexColor);
  return "rgba(" + rgb.r + ", " + rgb.g + ", " + rgb.b + ", " + alpha + ")";
}

// Reduces raw PCM to min/max envelope arrays for efficient clip waveform previews.
export function buildWaveformEnvelope(audioBuffer, bins) {
  const minValues = [];
  const maxValues = [];
  let peakAbs = 0;
  const sampleCount = Math.max(1, Number(audioBuffer?.length || 0));
  const channels = Math.max(1, Number(audioBuffer?.numberOfChannels || 1));
  const bucketCount = Math.max(
    64,
    Math.round(Number(bins || AUDIO_WAVEFORM_BINS_FALLBACK)),
  );
  const bucketSize = Math.max(1, Math.floor(sampleCount / bucketCount));
  const channelDataByIndex = Array.from({ length: channels }).map(function (
    _,
    index,
  ) {
    return audioBuffer.getChannelData(index);
  });

  for (let bucketIndex = 0; bucketIndex < bucketCount; bucketIndex += 1) {
    const start = bucketIndex * bucketSize;
    const end = Math.min(sampleCount, start + bucketSize);
    let minValue = 1;
    let maxValue = -1;

    for (let i = start; i < end; i += 1) {
      let mono = 0;
      for (let ch = 0; ch < channels; ch += 1) {
        const sample = Number(channelDataByIndex[ch][i] || 0);
        mono += sample;
        const abs = Math.abs(sample);
        if (abs > peakAbs) {
          peakAbs = abs;
        }
      }
      mono /= channels;

      if (mono < minValue) {
        minValue = mono;
      }
      if (mono > maxValue) {
        maxValue = mono;
      }
    }

    if (minValue > 0) {
      minValue = 0;
    }
    if (maxValue < 0) {
      maxValue = 0;
    }

    minValues.push(clamp(minValue, -1, 1));
    maxValues.push(clamp(maxValue, -1, 1));
  }

  return {
    minValues,
    maxValues,
    peakAbs: clamp(peakAbs, 0, 1),
  };
}

// Computes normalization gain based on waveform envelope peak.
export function getNormalizeGainFromPeak(peakAbs, enabled) {
  if (!enabled) {
    return 1;
  }
  const safePeak = Math.max(0, Number(peakAbs || 0));
  if (safePeak <= 0.0001) {
    return 1;
  }
  return clamp(0.9 / safePeak, 0.25, 4);
}

// Returns peak value from envelope arrays if direct peak is missing.
export function getEnvelopePeakAbs(envelope) {
  const directPeak = Number(envelope?.peakAbs);
  if (Number.isFinite(directPeak) && directPeak > 0) {
    return clamp(directPeak, 0, 1);
  }

  const minValues = Array.isArray(envelope?.minValues) ? envelope.minValues : [];
  const maxValues = Array.isArray(envelope?.maxValues) ? envelope.maxValues : [];
  const sampleCount = Math.min(minValues.length, maxValues.length);
  if (sampleCount <= 0) {
    return 0;
  }

  let peak = 0;
  for (let index = 0; index < sampleCount; index += 1) {
    const minAbs = Math.abs(Number(minValues[index] || 0));
    const maxAbs = Math.abs(Number(maxValues[index] || 0));
    if (minAbs > peak) {
      peak = minAbs;
    }
    if (maxAbs > peak) {
      peak = maxAbs;
    }
  }

  return clamp(peak, 0, 1);
}

// Samples min/max waveform envelope at a normalized [0..1] position.
export function sampleEnvelopeAtRatio(envelope, ratio) {
  const minValues = Array.isArray(envelope?.minValues) ? envelope.minValues : [];
  const maxValues = Array.isArray(envelope?.maxValues) ? envelope.maxValues : [];
  const sampleCount = Math.min(minValues.length, maxValues.length);
  if (sampleCount <= 0) {
    return { min: 0, max: 0 };
  }

  const safeRatio = clamp(Number(ratio || 0), 0, 1);
  const indexFloat = safeRatio * Math.max(0, sampleCount - 1);
  const indexA = Math.max(0, Math.min(sampleCount - 1, Math.floor(indexFloat)));
  const indexB = Math.max(0, Math.min(sampleCount - 1, indexA + 1));
  const mix = clamp(indexFloat - indexA, 0, 1);
  const minA = Number(minValues[indexA] || 0);
  const minB = Number(minValues[indexB] || 0);
  const maxA = Number(maxValues[indexA] || 0);
  const maxB = Number(maxValues[indexB] || 0);

  return {
    min: minA + (minB - minA) * mix,
    max: maxA + (maxB - maxA) * mix,
  };
}

// Builds SVG area path for an audio clip waveform preview window.
export function buildWaveformPathData(params) {
  const {
    envelope,
    pointCount,
    sourceStartSec,
    sourceDurationSec,
    sourcePerClipSecond,
    visibleDurationSec,
    clipDurationSec,
    waveformGain,
  } = params;
  const safePointCount = Math.max(4, Math.round(Number(pointCount || 0)));
  const topPoints = [];
  const bottomPoints = [];
  const usableVisibleDurationSec = Math.max(0.0001, Number(visibleDurationSec || 0));
  const safeClipDurationSec = Math.max(0.0001, Number(clipDurationSec || 0));
  const safeSourceDurationSec = Math.max(0.0001, Number(sourceDurationSec || 0));
  const safeSourceStartSec = Math.max(0, Number(sourceStartSec || 0));
  const safeSourcePerClipSecond = Math.max(0.0001, Number(sourcePerClipSecond || 0));
  const safeWaveformGain = Math.max(0.25, Number(waveformGain || 1));
  const amplitudeScale = 0.49;

  for (let index = 0; index < safePointCount; index += 1) {
    const progress = safePointCount > 1 ? index / (safePointCount - 1) : 0;
    const timeSec = progress * usableVisibleDurationSec;
    const sourceTimeSec = safeSourceStartSec + timeSec * safeSourcePerClipSecond;
    const sourceRatio = clamp(sourceTimeSec / safeSourceDurationSec, 0, 1);
    const sample = sampleEnvelopeAtRatio(envelope, sourceRatio);
    const scaledMax = clamp(sample.max * safeWaveformGain, -1, 1);
    const scaledMin = clamp(sample.min * safeWaveformGain, -1, 1);
    const x = clamp((timeSec / safeClipDurationSec) * 100, 0, 100);
    const topY = clamp((0.5 - scaledMax * amplitudeScale) * 100, 1, 99);
    const bottomY = clamp((0.5 - scaledMin * amplitudeScale) * 100, 1, 99);
    topPoints.push({ x, y: topY });
    bottomPoints.push({ x, y: bottomY });
  }

  if (topPoints.length === 0) {
    return "";
  }

  const topPath = topPoints
    .map(function (point, index) {
      return (
        (index === 0 ? "M " : "L ") +
        point.x.toFixed(3) +
        " " +
        point.y.toFixed(3)
      );
    })
    .join(" ");
  const bottomPath = bottomPoints
    .slice()
    .reverse()
    .map(function (point) {
      return "L " + point.x.toFixed(3) + " " + point.y.toFixed(3);
    })
    .join(" ");

  return topPath + " " + bottomPath + " Z";
}

// Merges step-grid and piano-preview notes into one compact preview list.
export function getPatternPreviewNotes(pattern) {
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

  Object.entries(pattern.pianoPreview || {}).forEach(function ([
    channelId,
    notes,
  ]) {
    (notes || []).forEach(function (note) {
      const start = Math.max(
        0,
        Math.min(patternLength - 0.0625, Number(note.start || 0)),
      );
      const maxLen = Math.max(0.0625, patternLength - start);
      merged.push({
        id:
          note.id ||
          "piano-" +
            channelId +
            "-" +
            String(note.start) +
            "-" +
            String(note.pitch),
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

  return merged.map(function (note) {
    return {
      ...note,
      pitch: Math.max(
        MIDI_PITCH_MIN,
        Math.min(MIDI_PITCH_MAX, Math.round(note.pitch || C5_PITCH)),
      ),
    };
  });
}
