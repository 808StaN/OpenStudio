import { MAX_PLAYBACK_RATE, MIN_DURATION_SEC, MIN_PLAYBACK_RATE } from "./constants";

// Resolves desired sample duration from stretch settings and current transport BPM.
export function getStretchTargetDurationSeconds(settings, sampleReadDuration, bpm) {
  const safeDuration = Math.max(MIN_DURATION_SEC, Number(sampleReadDuration || MIN_DURATION_SEC));
  const safeBpm = Math.max(1, Number(bpm || 120));
  const quarterSec = 60 / safeBpm;
  const timeMode = String(settings.stretchTimeMode || "none")
    .trim()
    .toLowerCase();
  const mul = Math.max(
    0.25,
    Math.min(MAX_PLAYBACK_RATE, Number(settings.stretchMultiplier || 1)),
  );

  if (timeMode === "set-bpm") {
    // Keep original loop BPM relationship while following project tempo.
    const sourceBpm = Math.max(
      20,
      Math.min(300, Number(settings.stretchSourceBpm || 120)),
    );
    return Math.max(MIN_DURATION_SEC, safeDuration * (sourceBpm / safeBpm) * mul);
  }

  if (timeMode === "project-tempo") {
    // Allows "locked tempo snapshot" behavior independent of current project BPM.
    const projectLockBpm = Math.max(
      20,
      Math.min(300, Number(settings.stretchProjectTempoBpm || safeBpm)),
    );
    return Math.max(MIN_DURATION_SEC, safeDuration * (projectLockBpm / safeBpm) * mul);
  }

  if (timeMode === "beat-1") {
    return quarterSec * mul;
  }
  if (timeMode === "beat-2") {
    return quarterSec * 2 * mul;
  }
  if (timeMode === "bar-1") {
    return quarterSec * 4 * mul;
  }
  if (timeMode === "bar-2") {
    return quarterSec * 8 * mul;
  }
  if (timeMode === "bar-3") {
    return quarterSec * 12 * mul;
  }
  if (timeMode === "bar-4") {
    return quarterSec * 16 * mul;
  }

  return Math.max(MIN_DURATION_SEC, safeDuration * mul);
}

// Option allows callers (offline export) to force non-granular stretching.
export function getTimeStretchProfile(
  settings,
  sampleReadDuration,
  bpm,
  baseRate,
  options = {},
) {
  // Base playback-rate envelope shared by both "resample" and "stretch" branches.
  const stretchMode = String(settings.stretchMode || "none")
    .trim()
    .toLowerCase();
  const safeBaseRate = Math.max(MIN_PLAYBACK_RATE, Math.min(MAX_PLAYBACK_RATE, Number(baseRate || 1)));
  const targetDurationSec = getStretchTargetDurationSeconds(
    settings,
    sampleReadDuration,
    bpm,
  );
  const supportsGranularStretch = options.supportsGranularStretch !== false;

  if (stretchMode === "none") {
    // No algorithmic stretching: regular playback-rate conversion only.
    return {
      playbackRate: safeBaseRate,
      targetDurationSec: Math.max(MIN_DURATION_SEC, sampleReadDuration / safeBaseRate),
      useGranularStretch: false,
    };
  }

  const pitchShiftSemitones = Math.max(
    -24,
    Math.min(24, Number(settings.stretchPitchSemitones || 0)),
  );
  const pitchShiftRate = Math.pow(2, pitchShiftSemitones / 12);

  if (stretchMode === "stretch") {
    // Pitch shift is applied, while duration is controlled by granular stretch engine.
    return {
      playbackRate: Math.max(MIN_PLAYBACK_RATE, Math.min(MAX_PLAYBACK_RATE, safeBaseRate * pitchShiftRate)),
      targetDurationSec: Math.max(MIN_DURATION_SEC, targetDurationSec),
      useGranularStretch: supportsGranularStretch,
    };
  }

  const durationRate = Math.max(
    MIN_PLAYBACK_RATE,
    Math.min(MAX_PLAYBACK_RATE, sampleReadDuration / targetDurationSec),
  );

  return {
    // "Resample" mode maps duration into playback-rate directly (no granular engine).
    playbackRate: Math.max(
      MIN_PLAYBACK_RATE,
      Math.min(MAX_PLAYBACK_RATE, safeBaseRate * pitchShiftRate * durationRate),
    ),
    targetDurationSec: Math.max(MIN_DURATION_SEC, sampleReadDuration / durationRate),
    useGranularStretch: false,
  };
}
