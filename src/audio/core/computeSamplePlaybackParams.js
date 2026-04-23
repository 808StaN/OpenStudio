/**
 * Pure helper that computes every timing / level value needed to schedule a
 * single sample voice.  Both the real-time scheduler and the offline exporter
 * run through the exact same arithmetic so the render is sample-accurate.
 *
 * @param {AudioBuffer} sampleBuffer
 * @param {object} settings – sanitized sample settings
 * @param {number} midiPitch
 * @param {number} noteLengthSteps
 * @param {number} sixteenth – duration of one step in seconds
 * @param {number|null} [normalizeGain] – pre-computed normalisation factor
 *   (null / omitted when normalisation is disabled).
 * @param {object} [overrides] – optional values that bypass internal
 *   calculations.  Used by the real-time path when time-stretching has
 *   already computed a custom playbackRate and target duration.
 * @param {number} [overrides.playbackRate]
 * @param {number} [overrides.samplePlayableDuration]
 * @returns {object}
 */
export function computeSamplePlaybackParams(
  sampleBuffer,
  settings,
  midiPitch,
  noteLengthSteps,
  sixteenth,
  normalizeGain,
  overrides = {},
) {
  const DEFAULT_SAMPLE_MIDI_PITCH = 60;
  const safeMidiPitch = Number.isFinite(midiPitch)
    ? midiPitch
    : DEFAULT_SAMPLE_MIDI_PITCH;
  const pitchRate = Math.pow(2, Number(settings.pitchCents || 0) / 1200);
  const computedPlaybackRate = Math.max(
    0.125,
    Math.min(8, Math.pow(2, (safeMidiPitch - 60) / 12) * pitchRate),
  );
  const playbackRate =
    Number.isFinite(overrides.playbackRate)
      ? overrides.playbackRate
      : computedPlaybackRate;

  const sampleReadDuration = Math.max(
    0.01,
    sampleBuffer.duration * (settings.lengthPct / 100),
  );
  const naturalPlayableDuration = Math.max(
    0.01,
    sampleReadDuration / playbackRate,
  );
  const samplePlayableDuration = Number.isFinite(
    overrides.samplePlayableDuration,
  )
    ? overrides.samplePlayableDuration
    : naturalPlayableDuration;
  const noteGateDuration = Math.max(
    0.01,
    Number(noteLengthSteps || 1) * sixteenth,
  );
  const shouldApplyEnvelope = Boolean(settings.envEnabled);
  const envReleaseSec = shouldApplyEnvelope
    ? Math.max(0, Number(settings.envReleaseMs ?? 0) / 1000)
    : 0;
  const sourcePlayDuration = shouldApplyEnvelope
    ? Math.max(
        0.01,
        Math.min(samplePlayableDuration, noteGateDuration + envReleaseSec),
      )
    : samplePlayableDuration;
  const envelopeGateDuration = shouldApplyEnvelope
    ? Math.max(0.01, Math.min(noteGateDuration, sourcePlayDuration))
    : sourcePlayDuration;

  const fadeInSec = sourcePlayDuration * (settings.fadeInPct / 100);
  const shapedFadeOutPct =
    Math.pow(settings.fadeOutPct / 100, 0.7) * 100;
  const fadeOutSec = sourcePlayDuration * (shapedFadeOutPct / 100);
  const fadeTotal = fadeInSec + fadeOutSec;
  const fadeScale =
    fadeTotal > sourcePlayDuration * 0.98
      ? (sourcePlayDuration * 0.98) / Math.max(0.0001, fadeTotal)
      : 1;
  const finalFadeIn = fadeInSec * fadeScale;
  const finalFadeOut = fadeOutSec * fadeScale;

  return {
    playbackRate,
    sampleReadDuration,
    naturalPlayableDuration,
    samplePlayableDuration,
    noteGateDuration,
    shouldApplyEnvelope,
    envReleaseSec,
    sourcePlayDuration,
    envelopeGateDuration,
    fadeInSec,
    shapedFadeOutPct,
    fadeOutSec,
    fadeTotal,
    fadeScale,
    finalFadeIn,
    finalFadeOut,
  };
}
