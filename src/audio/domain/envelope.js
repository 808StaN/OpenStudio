// Applies ADSHR-style envelope automation on a gain node.
export function applyVolumeEnvelopeToGain(
  gainParam,
  startTime,
  gateDuration,
  settings,
) {
  // WebAudio GainParam values should never hit exact zero when ramping envelopes.
  const minGain = 0.0001;
  const envDelay = Math.max(0, Number(settings.envDelayMs ?? 0) / 1000);
  const envAttack = Math.max(0, Number(settings.envAttackMs ?? 0) / 1000);
  const envHold = Math.max(0, Number(settings.envHoldMs ?? 0) / 1000);
  const envDecay = Math.max(0, Number(settings.envDecayMs ?? 0) / 1000);
  const envRelease = Math.max(0, Number(settings.envReleaseMs ?? 0) / 1000);
  const envSustain = Math.max(
    minGain,
    Math.min(1, Number(settings.envSustainPct ?? 100) / 100),
  );
  const noteOffTime = startTime + Math.max(0.001, Number(gateDuration || 0));

  let cursor = startTime;

  gainParam.cancelScheduledValues(startTime);
  gainParam.setValueAtTime(minGain, startTime);

  const advanceWithHold = function (seconds, value) {
    const endTime = Math.min(noteOffTime, cursor + Math.max(0, seconds));
    gainParam.setValueAtTime(value, endTime);
    cursor = endTime;
  };

  const advanceWithRamp = function (seconds, targetValue) {
    const endTime = Math.min(noteOffTime, cursor + Math.max(0, seconds));
    if (endTime <= cursor) {
      gainParam.setValueAtTime(targetValue, cursor);
      return;
    }

    if (seconds > 0.0005) {
      gainParam.linearRampToValueAtTime(targetValue, endTime);
    } else {
      gainParam.setValueAtTime(targetValue, endTime);
    }

    cursor = endTime;
  };

  if (envDelay > 0) {
    advanceWithHold(envDelay, minGain);
  }
  // Attack/Hold/Decay only progress while we are still before note-off.
  if (cursor < noteOffTime) {
    advanceWithRamp(envAttack, 1);
  }
  if (cursor < noteOffTime) {
    advanceWithHold(envHold, 1);
  }
  if (cursor < noteOffTime) {
    advanceWithRamp(envDecay, envSustain);
  }

  // Sustain point is guaranteed at note-off for deterministic release handling.
  gainParam.setValueAtTime(envSustain, noteOffTime);

  if (envRelease > 0.0005) {
    gainParam.linearRampToValueAtTime(minGain, noteOffTime + envRelease);
  } else {
    gainParam.setValueAtTime(minGain, noteOffTime);
  }
}
