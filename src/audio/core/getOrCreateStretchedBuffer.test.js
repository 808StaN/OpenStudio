import { beforeEach, describe, it, expect, vi } from "vitest";
import { getOrCreateStretchedBuffer } from "./getOrCreateStretchedBuffer";
import { createWsolaStretchedBufferFromSample } from "../wsolaStretch";

vi.mock("../wsolaStretch", () => ({
  createWsolaStretchedBufferFromSample: vi.fn(function () {
    return { stretched: true };
  }),
}));

function createSampleBuffer(durationSec = 2) {
  return {
    duration: durationSec,
    sampleRate: 44100,
    numberOfChannels: 2,
  };
}

describe("getOrCreateStretchedBuffer", () => {
  beforeEach(() => {
    createWsolaStretchedBufferFromSample.mockClear();
  });

  it("reuses cached stretched buffers for identical parameters", () => {
    const cache = new WeakMap();
    const audioCtx = {};
    const sampleBuffer = createSampleBuffer();

    const first = getOrCreateStretchedBuffer(audioCtx, sampleBuffer, 1, 2, cache);
    const second = getOrCreateStretchedBuffer(audioCtx, sampleBuffer, 1, 2, cache);

    expect(second).toBe(first);
    expect(createWsolaStretchedBufferFromSample).toHaveBeenCalledOnce();
  });

  it("creates separate cache entries for different read durations", () => {
    const cache = new WeakMap();
    const audioCtx = {};
    const sampleBuffer = createSampleBuffer();

    const first = getOrCreateStretchedBuffer(audioCtx, sampleBuffer, 1, 2, cache);
    const second = getOrCreateStretchedBuffer(audioCtx, sampleBuffer, 1.5, 2, cache);

    expect(second).not.toBe(first);
    expect(createWsolaStretchedBufferFromSample).toHaveBeenCalledTimes(2);
  });
});
