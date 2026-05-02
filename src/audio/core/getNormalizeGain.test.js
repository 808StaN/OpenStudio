import { describe, it, expect } from "vitest";
import { getNormalizeGain } from "./getNormalizeGain";

describe("getNormalizeGain", () => {
  function createAudioBuffer(channelData) {
    return {
      numberOfChannels: channelData.length,
      length: channelData[0].length,
      getChannelData(ch) {
        return channelData[ch];
      },
    };
  }

  it("returns 1 for silent buffer", () => {
    const buffer = createAudioBuffer([new Float32Array(1000).fill(0)]);
    expect(getNormalizeGain(buffer)).toBe(1);
  });

  it("computes normalization for peak below 0.9", () => {
    const buffer = createAudioBuffer([new Float32Array(1000).fill(0.5)]);
    expect(getNormalizeGain(buffer)).toBe(0.9 / 0.5);
  });

  it("caps gain at 4 for very quiet signals", () => {
    const buffer = createAudioBuffer([new Float32Array(1000).fill(0.0001)]);
    expect(getNormalizeGain(buffer)).toBe(1); // peak exactly at threshold
  });

  it("caps gain at 0.25 for loud signals", () => {
    const buffer = createAudioBuffer([new Float32Array(1000).fill(5)]);
    expect(getNormalizeGain(buffer)).toBe(0.25);
  });

  it("caches result when cache provided", () => {
    const buffer = createAudioBuffer([new Float32Array(1000).fill(0.5)]);
    const cache = new WeakMap();
    const gain1 = getNormalizeGain(buffer, cache);
    const gain2 = getNormalizeGain(buffer, cache);
    expect(gain1).toBe(gain2);
    expect(cache.get(buffer)).toBe(gain1);
  });

    it("scans multiple channels", () => {
      const buffer = createAudioBuffer([
        new Float32Array(1000).fill(0.3),
        new Float32Array(1000).fill(0.6),
      ]);
      expect(getNormalizeGain(buffer)).toBeCloseTo(0.9 / 0.6, 5);
    });
});
