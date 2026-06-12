import { describe, it, expect, vi } from "vitest";
import { applyInsertSettings } from "./applyInsertSettings";

function createParam(value = 0) {
  return {
    value,
    setValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
  };
}

function createGainNode(value = 1) {
  return { gain: createParam(value) };
}

function createFilterNode() {
  return {
    type: "peaking",
    frequency: createParam(1000),
    Q: createParam(1),
    gain: createParam(0),
  };
}

function createDelayNode() {
  return { delayTime: createParam(0) };
}

function createInsertNode() {
  return {
    leftToLeft: createGainNode(),
    rightToRight: createGainNode(),
    rightToLeft: createGainNode(),
    leftToRight: createGainNode(),
    panner: { pan: createParam(0) },
    fxDryGain: createGainNode(),
    fxWetGain: createGainNode(),
    eqInput: createGainNode(),
    eqLowCut: createFilterNode(),
    eqBands: [],
    reverbInput: createGainNode(),
    reverbPreDelay: createDelayNode(),
    reverbLoCut: createFilterNode(),
    reverbHiCut: createFilterNode(),
    reverbLateLeftDelay: createDelayNode(),
    reverbLateRightDelay: createDelayNode(),
    reverbLeftFeedback: createGainNode(),
    reverbRightFeedback: createGainNode(),
    reverbLeftDamping: createFilterNode(),
    reverbRightDamping: createFilterNode(),
    reverbEarlyGain: createGainNode(),
    reverbEarlyTaps: [],
    reverbLeftToLeft: createGainNode(),
    reverbRightToRight: createGainNode(),
    reverbRightToLeft: createGainNode(),
    reverbLeftToRight: createGainNode(),
    reverbWetGain: createGainNode(),
    reverbModulators: [],
    maximizerInput: createGainNode(),
    maximizerPreGain: createGainNode(),
    maximizerCompressor: {
      threshold: createParam(-24),
      ratio: createParam(12),
      knee: createParam(30),
      attack: createParam(0.003),
      release: createParam(0.25),
    },
    maximizerSoftClip: {},
    maximizerCeilingGain: createGainNode(),
    outputGain: createGainNode(),
  };
}

describe("applyInsertSettings", () => {
  it("clamps maximizer compressor ratio to Web Audio range", () => {
    const node = createInsertNode();
    const insert = {
      active: true,
      pan: 0,
      stereoSeparation: 0,
      fader: 1,
      fxSlots: [
        {
          enabled: true,
          effectType: "maximizer",
          params: {
            mode: "irc-iv",
            thresholdDb: -24,
            ceilingDb: -1,
            character: 0,
            truePeakEnabled: true,
          },
        },
      ],
    };

    applyInsertSettings(node, insert, 0);

    expect(node.maximizerCompressor.ratio.setValueAtTime).toHaveBeenCalledWith(20, 0);
  });
});
