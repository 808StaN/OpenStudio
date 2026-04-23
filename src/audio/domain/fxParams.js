// Canonical effect IDs shared by store, scheduler and UI editors.
export const FX_EFFECT_NONE = "none";
export const FX_EFFECT_GRAPHIC_EQ = "graphic-eq";
export const FX_EFFECT_REVERB = "reverb";
export const FX_EFFECT_MAXIMIZER = "maximizer";

// Fixed 7-point EQ layout used by the built-in EQ editor.
export const GRAPHIC_EQ_DEFAULT_POINT_FREQUENCIES = [
  50, 100, 250, 500, 1000, 3000, 8000,
];

// Supported biquad families for per-point EQ shaping.
export const GRAPHIC_EQ_BAND_TYPES = [
  "peaking",
  "lowshelf",
  "highshelf",
  "lowpass",
  "highpass",
];

import { clamp } from "../../store/utils";

const MAXIMIZER_MODES = ["irc-ll", "irc-i", "irc-ii", "irc-iii", "irc-iv"];

export function getDefaultEqBandType(index) {
  // Outer points default to shelves, middle points to bell filters.
  if (index === 0) {
    return "lowshelf";
  }
  if (index === GRAPHIC_EQ_DEFAULT_POINT_FREQUENCIES.length - 1) {
    return "highshelf";
  }
  return "peaking";
}

export function sanitizeEqBandType(raw, fallback) {
  const requested = String(raw || "")
    .trim()
    .toLowerCase();
  if (GRAPHIC_EQ_BAND_TYPES.includes(requested)) {
    return requested;
  }

  const safeFallback = String(fallback || "")
    .trim()
    .toLowerCase();
  if (GRAPHIC_EQ_BAND_TYPES.includes(safeFallback)) {
    return safeFallback;
  }

  return "peaking";
}

export function getSafeGraphicEqParams(raw) {
  // Supports both modern "points" shape and legacy "bands" gain-only shape.
  const requestedPoints = Array.isArray(raw?.points) ? raw.points : [];
  const legacyBands = Array.isArray(raw?.bands) ? raw.bands : [];

  return {
    points: GRAPHIC_EQ_DEFAULT_POINT_FREQUENCIES.map(function (defaultFreq, index) {
      const requestedPoint = requestedPoints[index];
      const legacyGain = legacyBands[index];
      return {
        frequencyHz: clamp(Number(requestedPoint?.frequencyHz || defaultFreq), 20, 20000),
        gainDb: clamp(
          Number(requestedPoint?.gainDb ?? (Number.isFinite(legacyGain) ? legacyGain : 0)),
          -18,
          18,
        ),
        q: clamp(Number(requestedPoint?.q || 1.2), 0.25, 8),
        bandType: sanitizeEqBandType(
          requestedPoint?.bandType,
          getDefaultEqBandType(index),
        ),
      };
    }),
  };
}

export function getSafeReverbParams(raw) {
  // Defaults are tuned for musical but neutral small-room behavior.
  const base = {
    decayTime: 2.8,
    preDelayMs: 24,
    size: 0.62,
    damping: 0.45,
    hiCutHz: 9000,
    loCutHz: 130,
    earlyReflections: 0.38,
    diffusion: 0.72,
    modulationDepth: 0.22,
    modulationRateHz: 0.35,
    width: 0.9,
    dryWet: 0.34,
    freeze: false,
    ...(raw || {}),
  };

  return {
    decayTime: clamp(Number(base.decayTime ?? 2.8), 0.2, 20),
    preDelayMs: clamp(Number(base.preDelayMs ?? 24), 0, 250),
    size: clamp(Number(base.size ?? 0.62), 0, 1),
    damping: clamp(Number(base.damping ?? 0.45), 0, 1),
    hiCutHz: clamp(Number(base.hiCutHz ?? 9000), 1200, 18000),
    loCutHz: clamp(Number(base.loCutHz ?? 130), 20, 1200),
    earlyReflections: clamp(Number(base.earlyReflections ?? 0.38), 0, 1),
    diffusion: clamp(Number(base.diffusion ?? 0.72), 0, 1),
    modulationDepth: clamp(Number(base.modulationDepth ?? 0.22), 0, 1),
    modulationRateHz: clamp(Number(base.modulationRateHz ?? 0.35), 0, 8),
    width: clamp(Number(base.width ?? 0.9), 0, 1),
    dryWet: clamp(Number(base.dryWet ?? 0.34), 0, 1),
    freeze: Boolean(base.freeze),
  };
}

export function sanitizeMaximizerMode(rawMode) {
  const requested = String(rawMode || "")
    .trim()
    .toLowerCase();
  if (MAXIMIZER_MODES.includes(requested)) {
    return requested;
  }
  return "irc-ii";
}

export function getSafeMaximizerParams(raw) {
  // Migrates old preset-like defaults to current neutral defaults.
  const legacyThreshold = Number(raw?.thresholdDb);
  const legacyCeiling = Number(raw?.ceilingDb);
  const legacyCharacter = Number(raw?.character);
  const legacyMode = sanitizeMaximizerMode(raw?.mode);
  const isLegacyDefault =
    Number.isFinite(legacyThreshold) &&
    Number.isFinite(legacyCeiling) &&
    Number.isFinite(legacyCharacter) &&
    Math.abs(legacyThreshold + 6) < 0.001 &&
    Math.abs(legacyCeiling + 0.1) < 0.001 &&
    Math.abs(legacyCharacter - 0.58) < 0.001 &&
    legacyMode === "irc-ii" &&
    Boolean(raw?.truePeakEnabled ?? true);

  const base = {
    mode: "irc-ii",
    truePeakEnabled: true,
    thresholdDb: 0,
    ceilingDb: -1,
    character: 0.5,
    ...(raw || {}),
  };

  if (isLegacyDefault) {
    base.thresholdDb = 0;
    base.ceilingDb = -1;
    base.character = 0.5;
  }

  return {
    mode: sanitizeMaximizerMode(base.mode),
    truePeakEnabled: Boolean(base.truePeakEnabled),
    thresholdDb: clamp(Number(base.thresholdDb ?? 0), -24, 0),
    ceilingDb: clamp(Number(base.ceilingDb ?? -1), -18, 0),
    character: clamp(Number(base.character ?? 0.5), 0, 1),
  };
}

export function buildSoftClipCurve(strength) {
  // Generates transfer curve used by maximizer soft clipping path.
  const safeStrength = clamp(Number(strength || 0), 0, 1);
  const samples = 4096;
  const curve = new Float32Array(samples);
  const drive = 1 + safeStrength * 6;

  for (let index = 0; index < samples; index += 1) {
    const x = (index / (samples - 1)) * 2 - 1;
    curve[index] = Math.tanh(x * drive) / Math.tanh(drive);
  }

  return curve;
}
