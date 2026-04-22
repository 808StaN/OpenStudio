// Resolves desired sample duration from stretch settings and current transport BPM.
export function getStretchTargetDurationSeconds(settings, sampleReadDuration, bpm) {
  const safeDuration = Math.max(0.01, Number(sampleReadDuration || 0.01));
  const safeBpm = Math.max(1, Number(bpm || 120));
  const quarterSec = 60 / safeBpm;
  const timeMode = String(settings.stretchTimeMode || "none")
    .trim()
    .toLowerCase();
  const mul = Math.max(
    0.25,
    Math.min(8, Number(settings.stretchMultiplier || 1)),
  );

  if (timeMode === "set-bpm") {
    // Keep original loop BPM relationship while following project tempo.
    const sourceBpm = Math.max(
      20,
      Math.min(300, Number(settings.stretchSourceBpm || 120)),
    );
    return Math.max(0.01, safeDuration * (sourceBpm / safeBpm) * mul);
  }

  if (timeMode === "project-tempo") {
    // Allows "locked tempo snapshot" behavior independent of current project BPM.
    const projectLockBpm = Math.max(
      20,
      Math.min(300, Number(settings.stretchProjectTempoBpm || safeBpm)),
    );
    return Math.max(0.01, safeDuration * (projectLockBpm / safeBpm) * mul);
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

  return Math.max(0.01, safeDuration * mul);
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
  const safeBaseRate = Math.max(0.125, Math.min(8, Number(baseRate || 1)));
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
      targetDurationSec: Math.max(0.01, sampleReadDuration / safeBaseRate),
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
      playbackRate: Math.max(0.125, Math.min(8, safeBaseRate * pitchShiftRate)),
      targetDurationSec: Math.max(0.01, targetDurationSec),
      useGranularStretch: supportsGranularStretch,
    };
  }

  const durationRate = Math.max(
    0.125,
    Math.min(8, sampleReadDuration / targetDurationSec),
  );

  return {
    // "Resample" mode maps duration into playback-rate directly (no granular engine).
    playbackRate: Math.max(
      0.125,
      Math.min(8, safeBaseRate * pitchShiftRate * durationRate),
    ),
    targetDurationSec: Math.max(0.01, sampleReadDuration / durationRate),
    useGranularStretch: false,
  };
}
