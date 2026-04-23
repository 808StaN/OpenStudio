import { clamp } from "../../store/utils";
import { createWsolaStretchedBufferFromSample } from "../wsolaStretch";

/**
 * Returns a WSOLA-stretched buffer for the given sample, using a WeakMap cache
 * keyed by source buffer + readFrames + stretchFactor + channelCount.
 *
 * @param {BaseAudioContext} audioCtx
 * @param {AudioBuffer} sampleBuffer
 * @param {number} sampleReadDuration – seconds of source audio to read.
 * @param {number} desiredDuration – seconds the stretched result should cover.
 * @param {WeakMap<AudioBuffer, Map<string, AudioBuffer>>} cache
 * @returns {AudioBuffer}
 */
export function getOrCreateStretchedBuffer(
  audioCtx,
  sampleBuffer,
  sampleReadDuration,
  desiredDuration,
  cache,
) {
  const desiredBufferedDuration = Math.max(0.01, Number(desiredDuration || 0));
  const stretchFactor = clamp(
    sampleReadDuration / desiredBufferedDuration,
    0.25,
    4,
  );
  const readFrames = Math.max(
    16,
    Math.floor(sampleReadDuration * sampleBuffer.sampleRate),
  );
  const cacheKey =
    readFrames +
    "|" +
    stretchFactor.toFixed(4) +
    "|" +
    sampleBuffer.numberOfChannels;

  let perSampleCache = cache.get(sampleBuffer);
  if (!perSampleCache) {
    perSampleCache = new Map();
    cache.set(sampleBuffer, perSampleCache);
  }

  const cached = perSampleCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const stretched = createWsolaStretchedBufferFromSample(
    audioCtx,
    sampleBuffer,
    sampleReadDuration,
    stretchFactor,
    false,
  );
  perSampleCache.set(cacheKey, stretched);
  return stretched;
}
