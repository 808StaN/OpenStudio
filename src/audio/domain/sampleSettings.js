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
  const base = {
    ...DEFAULT_SAMPLE_SETTINGS,
    pitchCents: hasPitchCents
      ? Number(raw?.pitchCents)
      : Number(raw?.pitchSemitones || 0) * 100,
    ...(raw || {}),
  };

  const next = {
    cutItself: Boolean(base.cutItself),
    normalize: Boolean(base.normalize),
    lengthPct: Math.max(5, Math.min(100, Number(base.lengthPct ?? 100))),
    fadeInPct: Math.max(0, Math.min(95, Number(base.fadeInPct ?? 0))),
    fadeOutPct: Math.max(0, Math.min(95, Number(base.fadeOutPct ?? 0))),
    envEnabled: Boolean(base.envEnabled),
    envDelayMs: Math.max(0, Math.min(3000, Number(base.envDelayMs ?? 0))),
    envAttackMs: Math.max(0, Math.min(3000, Number(base.envAttackMs ?? 0))),
    envHoldMs: Math.max(0, Math.min(3000, Number(base.envHoldMs ?? 0))),
    envDecayMs: Math.max(0, Math.min(3000, Number(base.envDecayMs ?? 0))),
    envSustainPct: Math.max(
      0,
      Math.min(100, Number(base.envSustainPct ?? 100)),
    ),
    envReleaseMs: Math.max(0, Math.min(3000, Number(base.envReleaseMs ?? 0))),
    attackMs: Math.max(0, Math.min(400, Number(base.attackMs ?? 8))),
    releaseMs: Math.max(0, Math.min(1000, Number(base.releaseMs ?? 420))),
    pitchCents: Math.max(
      -100,
      Math.min(100, Math.round(Number(base.pitchCents ?? 0))),
    ),
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
    stretchPitchSemitones: Math.max(
      -24,
      Math.min(24, Number(base.stretchPitchSemitones ?? 0)),
    ),
    stretchMultiplier: Math.max(
      0.25,
      Math.min(8, Number(base.stretchMultiplier ?? 1)),
    ),
    stretchSourceBpm: Math.max(
      20,
      Math.min(300, Number(base.stretchSourceBpm ?? 120)),
    ),
    stretchProjectTempoBpm: Math.max(
      20,
      Math.min(300, Number(base.stretchProjectTempoBpm ?? 120)),
    ),
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
