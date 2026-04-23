/**
 * @fileoverview getNormalizeGain — Computes a per-buffer normalization
 * factor so that the loudest peak maps to ~0.9 dBFS.
 *
 * Uses a WeakMap cache so repeated calls for the same buffer are O(1).
 */

/**
 * @param {AudioBuffer} sampleBuffer
 * @param {WeakMap<AudioBuffer, number>} cache — optional external cache
 * @returns {number}
 */
export function getNormalizeGain(sampleBuffer, cache) {
  if (cache) {
    const cached = cache.get(sampleBuffer);
    if (Number.isFinite(cached)) {
      return cached;
    }
  }

  let peak = 0;
  const channelsCount = Math.max(
    1,
    Number(sampleBuffer.numberOfChannels || 1),
  );

  for (let ch = 0; ch < channelsCount; ch += 1) {
    const channelData = sampleBuffer.getChannelData(ch);
    const step = Math.max(1, Math.floor(channelData.length / 64000));
    for (let i = 0; i < channelData.length; i += step) {
      const abs = Math.abs(channelData[i]);
      if (abs > peak) {
        peak = abs;
      }
    }
  }

  const normalizeGain =
    peak > 0.0001 ? Math.max(0.25, Math.min(4, 0.9 / peak)) : 1;

  if (cache) {
    cache.set(sampleBuffer, normalizeGain);
  }

  return normalizeGain;
}
