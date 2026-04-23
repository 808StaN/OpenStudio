import { applyVolumeEnvelopeToGain } from "../domain/envelope";

const MIN_AUDIO_GAIN = 0.0001;

/**
 * Creates the Web Audio node chain for a single sample voice, schedules the
 * gain automation (fade-in / fade-out) and optional ADSR envelope, and
 * returns the created nodes so the caller can start/stop them and manage
 * voice lifecycle.
 *
 * This is shared between the real-time scheduler and the offline exporter so
 * both paths produce identical gain curves.
 *
 * @param {BaseAudioContext} audioCtx
 * @param {AudioBuffer} buffer
 * @param {object} params – result of computeSamplePlaybackParams(...).
 * @param {AudioNode} destination – final node to connect the panner to.
 * @param {number} time – audio-context time at which the note starts.
 * @param {number} panValue – stereo pan in the range [-1, 1].
 * @param {number} finalGain – target gain for the voice (already includes
 *   velocity, channel volume and normalisation).
 * @param {object} settings – sample settings (needed for envelope shape).
 * @param {object} [options]
 * @param {number} [options.retriggerFadeInSec] – when > 0, overrides the
 *   calculated fade-in with a longer cross-fade to avoid clicks after a
 *   cut-itself stop.
 * @returns {{source:AudioBufferSourceNode,gain:GainNode,envelopeGain:GainNode,panner:StereoPannerNode}}
 */
export function createSamplePlaybackNodes(
  audioCtx,
  buffer,
  params,
  destination,
  time,
  panValue,
  finalGain,
  settings,
  options = {},
) {
  const source = audioCtx.createBufferSource();
  const gain = audioCtx.createGain();
  const envelopeGain = audioCtx.createGain();
  const panner = audioCtx.createStereoPanner();

  const {
    playbackRate,
    sourcePlayDuration,
    envelopeGateDuration,
    finalFadeIn,
    finalFadeOut,
    shouldApplyEnvelope,
  } = params;

  const sampleStopAt = time + sourcePlayDuration;
  const fadeOutStart = Math.max(time, sampleStopAt - finalFadeOut);

  source.buffer = buffer;
  source.playbackRate.setValueAtTime(playbackRate, time);

  const fadeIn =
    options.retriggerFadeInSec > 0.001
      ? Math.max(finalFadeIn, options.retriggerFadeInSec)
      : finalFadeIn;

  if (fadeIn > 0.001) {
    gain.gain.setValueAtTime(MIN_AUDIO_GAIN, time);
    gain.gain.linearRampToValueAtTime(finalGain, time + fadeIn);
  } else {
    gain.gain.setValueAtTime(finalGain, time);
  }

  gain.gain.setValueAtTime(finalGain, fadeOutStart);
  if (finalFadeOut > 0.001) {
    gain.gain.exponentialRampToValueAtTime(MIN_AUDIO_GAIN, sampleStopAt);
  } else {
    gain.gain.setValueAtTime(MIN_AUDIO_GAIN, sampleStopAt);
  }

  panner.pan.setValueAtTime(Math.max(-1, Math.min(1, panValue)), time);

  source.connect(gain);
  gain.connect(envelopeGain);

  if (shouldApplyEnvelope) {
    applyVolumeEnvelopeToGain(
      envelopeGain.gain,
      time,
      envelopeGateDuration,
      settings,
    );
  } else {
    envelopeGain.gain.setValueAtTime(1, time);
  }

  envelopeGain.connect(panner);
  panner.connect(destination);

  return { source, gain, envelopeGain, panner };
}
