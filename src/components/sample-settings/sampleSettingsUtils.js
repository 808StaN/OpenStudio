// Shared decoder context for static waveform analysis in Sample Settings UI.
// We keep one context instance to avoid repeatedly creating AudioContext objects.
let waveformDecodeContext = null;

// Returns (and lazily creates) a decode-only audio context used for waveform data.
export function getWaveformDecodeContext() {
  if (!waveformDecodeContext) {
    waveformDecodeContext = new AudioContext();
  }
  return waveformDecodeContext;
}

// Down-samples raw PCM data into bucket peaks for lightweight waveform rendering.
export function computeWaveformPeaks(channelData, bucketCount) {
  if (!channelData || channelData.length === 0 || bucketCount <= 0) {
    return [];
  }

  const samplesPerBucket = Math.max(
    1,
    Math.floor(channelData.length / bucketCount),
  );
  const peaks = [];

  for (let i = 0; i < bucketCount; i += 1) {
    const start = i * samplesPerBucket;
    const end =
      i === bucketCount - 1
        ? channelData.length
        : Math.min(channelData.length, start + samplesPerBucket);

    let peak = 0;
    for (let p = start; p < end; p += 1) {
      const value = Math.abs(channelData[p]);
      if (value > peak) {
        peak = value;
      }
    }

    peaks.push(peak);
  }

  return peaks;
}

// Finds absolute waveform peak with sparse stepping for better performance.
export function computePeakAbs(channelData) {
  if (!channelData || channelData.length === 0) {
    return 0;
  }

  let peak = 0;
  const step = Math.max(1, Math.floor(channelData.length / 64000));
  for (let index = 0; index < channelData.length; index += step) {
    const abs = Math.abs(Number(channelData[index] || 0));
    if (abs > peak) {
      peak = abs;
    }
  }

  return Math.max(0, Math.min(1, peak));
}

// Computes normalization gain that targets ~-1 dBFS headroom.
export function getNormalizeGainFromPeakAbs(peakAbs, enabled) {
  if (!enabled) {
    return 1;
  }

  const safePeak = Math.max(0, Number(peakAbs || 0));
  if (safePeak <= 0.0001) {
    return 1;
  }

  return Math.max(0.25, Math.min(4, 0.9 / safePeak));
}

// Generic settings clamp + optional stepping helper used by inline editors.
export function clampSettingValue(rawValue, min, max, step) {
  if (!Number.isFinite(rawValue)) {
    return min;
  }

  const clamped = Math.max(min, Math.min(max, rawValue));
  if (!Number.isFinite(step) || step <= 0) {
    return clamped;
  }

  const snapped = Math.round((clamped - min) / step) * step + min;
  return Number(snapped.toFixed(4));
}

// Builds a tiny ADSHR preview path for the envelope tab.
export function buildEnvelopePath(settings) {
  const width = 276;
  const height = 92;
  const padX = 8;
  const padY = 8;
  const plotW = width - padX * 2;
  const plotH = height - padY * 2;
  const sustain = settings.envEnabled
    ? Math.max(0, Math.min(1, Number(settings.envSustainPct ?? 100) / 100))
    : 1;

  const delay = settings.envEnabled
    ? Math.max(0, Number(settings.envDelayMs ?? 0))
    : 0;
  const attack = settings.envEnabled
    ? Math.max(0, Number(settings.envAttackMs ?? 0))
    : 0;
  const hold = settings.envEnabled
    ? Math.max(0, Number(settings.envHoldMs ?? 0))
    : 0;
  const decay = settings.envEnabled
    ? Math.max(0, Number(settings.envDecayMs ?? 0))
    : 0;
  const release = settings.envEnabled
    ? Math.max(0, Number(settings.envReleaseMs ?? 0))
    : 0;

  const sustainSlot = 280;
  const total = Math.max(
    1,
    delay + attack + hold + decay + sustainSlot + release,
  );

  const x0 = 0;
  const x1 = delay / total;
  const x2 = (delay + attack) / total;
  const x3 = (delay + attack + hold) / total;
  const x4 = (delay + attack + hold + decay) / total;
  const x5 = (delay + attack + hold + decay + sustainSlot) / total;
  const x6 = 1;

  const yBottom = 1;
  const yTop = 0;
  const ySustain = 1 - sustain;

  const points = [
    [x0, yBottom],
    [x1, yBottom],
    [x2, yTop],
    [x3, yTop],
    [x4, ySustain],
    [x5, ySustain],
    [x6, yBottom],
  ];

  return points
    .map(function (point, index) {
      const px = padX + point[0] * plotW;
      const py = padY + point[1] * plotH;
      return (index === 0 ? "M " : "L ") + px.toFixed(2) + " " + py.toFixed(2);
    })
    .join(" ");
}

// Resolves human-friendly file label from sample path/url.
export function getSampleFileNameWithExtension(sampleRef) {
  const raw = String(sampleRef || "").trim();
  if (!raw) {
    return "No sample loaded";
  }

  const leaf = raw.split("/").pop() || raw;

  try {
    return decodeURIComponent(leaf);
  } catch {
    return leaf;
  }
}

// Formats integer settings with optional explicit sign prefix.
export function formatSettingValue(value, suffix, isSigned) {
  const rounded = Math.round(Number(value) || 0);
  if (isSigned) {
    return (rounded > 0 ? "+" : "") + rounded + suffix;
  }

  return rounded + suffix;
}
