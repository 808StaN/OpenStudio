import { clamp, midiPitchToPlaybackRate } from "./pianoRollUtils";

/**
 * Builds plugin preview options (pitch, envelope, gain, pan) from channel state.
 */
export function resolvePluginPreviewParams({
  normalizedPitch,
  settings,
  activeChannel,
}) {
  return {
    transposedPitch: clamp(
      normalizedPitch + Number(settings.pitchCents || 0) / 100,
      0,
      127,
    ),
    attackSec: Math.max(0, Math.min(0.4, Number(settings.attackMs || 0) / 1000)),
    releaseSec: Math.max(0.01, Math.min(1, Number(settings.releaseMs ?? 420) / 1000)),
    gain: Math.max(0.04, Number(activeChannel.volume ?? 0.7) * 0.24),
    pan: clamp(Number(activeChannel.pan || 0), -1, 1),
  };
}

/**
 * Builds sample preview synthesis parameters from channel/sample settings.
 */
export function resolveSamplePreviewParams({
  normalizedPitch,
  settings,
  activeChannel,
  sampleBuffer,
  getNormalizeGainForBuffer,
}) {
  const playbackRate = clamp(
    midiPitchToPlaybackRate(normalizedPitch) *
      Math.pow(2, Number(settings.pitchCents || 0) / 1200),
    0.125,
    8,
  );
  const readDuration = Math.max(
    0.01,
    sampleBuffer.duration *
      (Math.max(5, Math.min(100, Number(settings.lengthPct ?? 100))) / 100),
  );
  const normalizeGain = settings.normalize
    ? getNormalizeGainForBuffer(sampleBuffer)
    : 1;
  const targetGain = Math.max(
    0.03,
    Math.min(1.4, Number(activeChannel.volume ?? 0.7) * 0.58 * normalizeGain),
  );
  const attackSec = Math.max(0, Math.min(0.4, Number(settings.attackMs ?? 8) / 1000));
  // Keep preview release short to avoid overlap "echo" on quick clicks.
  const releaseSec = Math.max(0.01, Math.min(0.08, Number(settings.releaseMs ?? 420) / 1000));
  const pan = clamp(Number(activeChannel.pan || 0), -1, 1);

  return {
    playbackRate,
    readDuration,
    targetGain,
    attackSec,
    releaseSec,
    pan,
  };
}

/**
 * Creates and starts one-shot sample preview voice graph.
 */
export function createSamplePreviewVoice({
  context,
  sampleBuffer,
  playbackRate,
  readDuration,
  targetGain,
  attackSec,
  pan,
}) {
  const source = context.createBufferSource();
  const gain = context.createGain();
  const panner = context.createStereoPanner();

  source.buffer = sampleBuffer;
  source.playbackRate.setValueAtTime(playbackRate, context.currentTime);
  source.loop = false;

  if (attackSec > 0.001) {
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.linearRampToValueAtTime(targetGain, context.currentTime + attackSec);
  } else {
    gain.gain.setValueAtTime(targetGain, context.currentTime);
  }

  panner.pan.setValueAtTime(pan, context.currentTime);
  source.connect(gain);
  gain.connect(panner);
  panner.connect(context.destination);

  source.start(
    context.currentTime,
    0,
    Math.min(readDuration, sampleBuffer.duration),
  );

  return {
    source,
    gain,
  };
}
