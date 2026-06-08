// Accepted time-stretch algorithm modes for channel/sample settings.
const SAMPLE_STRETCH_MODES = new Set(["none", "resample", "stretch", "realtime"]);
// Accepted time target modes that convert musical intent to target duration.
const SAMPLE_STRETCH_TIME_MODES = new Set([
  "none",
  "set-bpm",
  "project-tempo",
  "beat-1",
  "beat-2",
  "bar-1",
  "bar-2",
  "bar-3",
  "bar-4",
]);

function getFiniteNumber(value, fallback) {
  if (value === null || value === undefined) {
    return fallback;
  }

  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : fallback;
}

function clampNumber(value, min, max, fallback) {
  const normalized = getFiniteNumber(value, fallback);
  return Math.max(min, Math.min(max, normalized));
}

// Canonical default shape for sample settings across app/editor/export paths.
export const DEFAULT_SAMPLE_SETTINGS = {
  cutItself: false,
  normalize: false,
  lengthPct: 100,
  fadeInPct: 0,
  fadeOutPct: 0,
  envEnabled: false,
  envDelayMs: 0,
  envAttackMs: 0,
  envHoldMs: 0,
  envDecayMs: 0,
  envSustainPct: 100,
  envReleaseMs: 0,
  attackMs: 8,
  releaseMs: 420,
  pitchCents: 0,
  monoMode: false,
  stretchMode: "resample",
  stretchPitchSemitones: 0,
  stretchMultiplier: 1,
  stretchSourceBpm: 120,
  stretchProjectTempoBpm: 120,
  stretchTimeMode: "none",
};

// Centralized sanitizer for sample settings used by playback, preview and render paths.
export function getSafeSampleSettings(raw) {
  // Backward compatibility: older projects may still store semitone-based pitch.
  const hasPitchCents = Object.hasOwn(raw || {}, "pitchCents");
  const migratedPitchCents = hasPitchCents
    ? getFiniteNumber(raw?.pitchCents, 0)
    : getFiniteNumber(raw?.pitchSemitones, 0) * 100;
  const base = {
    ...DEFAULT_SAMPLE_SETTINGS,
    ...(raw || {}),
    pitchCents: migratedPitchCents,
  };

  const next = {
    cutItself: Boolean(base.cutItself),
    normalize: Boolean(base.normalize),
    lengthPct: clampNumber(base.lengthPct, 5, 100, 100),
    fadeInPct: clampNumber(base.fadeInPct, 0, 95, 0),
    fadeOutPct: clampNumber(base.fadeOutPct, 0, 95, 0),
    envEnabled: Boolean(base.envEnabled),
    envDelayMs: clampNumber(base.envDelayMs, 0, 3000, 0),
    envAttackMs: clampNumber(base.envAttackMs, 0, 3000, 0),
    envHoldMs: clampNumber(base.envHoldMs, 0, 3000, 0),
    envDecayMs: clampNumber(base.envDecayMs, 0, 3000, 0),
    envSustainPct: clampNumber(base.envSustainPct, 0, 100, 100),
    envReleaseMs: clampNumber(base.envReleaseMs, 0, 3000, 0),
    attackMs: clampNumber(base.attackMs, 0, 400, 8),
    releaseMs: clampNumber(base.releaseMs, 0, 1000, 420),
    pitchCents: Math.round(clampNumber(base.pitchCents, -100, 100, 0)),
    monoMode: Boolean(base.monoMode),
    stretchMode: SAMPLE_STRETCH_MODES.has(
      String(base.stretchMode || "")
        .trim()
        .toLowerCase(),
    )
      ? String(base.stretchMode || "none")
          .trim()
          .toLowerCase()
      : "none",
    stretchPitchSemitones: clampNumber(base.stretchPitchSemitones, -24, 24, 0),
    stretchMultiplier: clampNumber(base.stretchMultiplier, 0.25, 8, 1),
    stretchSourceBpm: clampNumber(base.stretchSourceBpm, 20, 300, 120),
    stretchProjectTempoBpm: clampNumber(base.stretchProjectTempoBpm, 20, 300, 120),
    stretchTimeMode: SAMPLE_STRETCH_TIME_MODES.has(
      String(base.stretchTimeMode || "")
        .trim()
        .toLowerCase(),
    )
      ? String(base.stretchTimeMode || "none")
          .trim()
          .toLowerCase()
      : "none",
  };

  // Keep combined fade shape sane so fade-in + fade-out never consumes whole sample.
  const fadeTotal = next.fadeInPct + next.fadeOutPct;
  if (fadeTotal > 98) {
    const scale = 98 / fadeTotal;
    next.fadeInPct = Math.max(0, Math.round(next.fadeInPct * scale));
    next.fadeOutPct = Math.max(0, Math.round(next.fadeOutPct * scale));
  }

  return next;
}
