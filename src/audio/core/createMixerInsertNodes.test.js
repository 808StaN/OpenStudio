import { describe, it, expect, vi } from "vitest";
import { startMixerInsertModulators } from "./createMixerInsertNodes";

function createModulator(startImpl = vi.fn()) {
  return {
    lfo: {
      start: startImpl,
    },
    isStarted: false,
  };
}

describe("startMixerInsertModulators", function () {
  it("starts reverb modulators from a realtime mixer graph", function () {
    const modulator = createModulator();
    const graph = {
      inserts: new Map([["master", { reverbModulators: [modulator] }]]),
    };
    const audioCtx = { currentTime: 1.25 };

    startMixerInsertModulators(graph, audioCtx);

    expect(modulator.lfo.start).toHaveBeenCalledWith(1.25);
    expect(modulator.isStarted).toBe(true);
  });

  it("starts reverb modulators from an offline insert map", function () {
    const modulator = createModulator();
    const insertMap = new Map([["master", { reverbModulators: [modulator] }]]);
    const audioCtx = { currentTime: 0 };

    startMixerInsertModulators(insertMap, audioCtx);

    expect(modulator.lfo.start).toHaveBeenCalledWith(0);
    expect(modulator.isStarted).toBe(true);
  });

  it("does not start a modulator twice", function () {
    const modulator = createModulator();
    const graph = {
      inserts: new Map([["master", { reverbModulators: [modulator] }]]),
    };
    const audioCtx = { currentTime: 3 };

    startMixerInsertModulators(graph, audioCtx);
    startMixerInsertModulators(graph, audioCtx);

    expect(modulator.lfo.start).toHaveBeenCalledTimes(1);
  });

  it("marks a modulator started when start throws", function () {
    const modulator = createModulator(vi.fn(function () {
      throw new Error("already started");
    }));
    const graph = {
      inserts: new Map([["master", { reverbModulators: [modulator] }]]),
    };
    const audioCtx = { currentTime: 4 };

    expect(function () {
      startMixerInsertModulators(graph, audioCtx);
    }).not.toThrow();
    expect(modulator.isStarted).toBe(true);
  });
});
