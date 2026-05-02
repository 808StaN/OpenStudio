import { describe, it, expect } from "vitest";
import {
  clamp,
  quantizeBySnap,
  getTargetAudioClipBarLength,
  getAudioClipWaveformWindow,
  buildWaveformEnvelope,
  getNormalizeGainFromPeak,
  getEnvelopePeakAbs,
  sampleEnvelopeAtRatio,
  buildWaveformPathData,
} from "./playlistWaveformUtils";

describe("playlistWaveformUtils", () => {
  describe("clamp", () => {
    it("clamps between bounds", () => {
      expect(clamp(5, 0, 10)).toBe(5);
      expect(clamp(-5, 0, 10)).toBe(0);
      expect(clamp(15, 0, 10)).toBe(10);
    });
  });

  describe("quantizeBySnap", () => {
    it("quantizes to snap size", () => {
      expect(quantizeBySnap(1.13, 0.25)).toBe(1.25);
      expect(quantizeBySnap(1.12, 0.25)).toBe(1.0);
    });

    it("returns value unchanged when snap is falsy", () => {
      expect(quantizeBySnap(1.13, 0)).toBe(1.13);
    });
  });

  describe("getTargetAudioClipBarLength", () => {
    it("computes bar length without stretch", () => {
      const bpm = 120;
      const durationSec = 2; // 2 sec = 1 bar at 120 BPM
      const result = getTargetAudioClipBarLength(durationSec, {}, bpm);
      expect(result).toBeCloseTo(1, 1);
    });

    it("respects minimum clip length", () => {
      const result = getTargetAudioClipBarLength(0.001, {}, 120);
      expect(result).toBe(1 / 16);
    });
  });

  describe("getAudioClipWaveformWindow", () => {
    it("returns waveform window for clip", () => {
      const result = getAudioClipWaveformWindow(10, 5, 0, {}, 120);
      expect(result.sourceDurationSec).toBe(10);
      expect(result.visibleClipDurationSec).toBeGreaterThan(0);
      expect(result.sourcePerClipSecond).toBeGreaterThan(0);
    });

    it("handles offset within source", () => {
      const result = getAudioClipWaveformWindow(10, 2, 3, {}, 120);
      expect(result.sourceStartSec).toBeGreaterThanOrEqual(0);
    });
  });

  describe("buildWaveformEnvelope", () => {
    function createAudioBuffer(channelData) {
      return {
        length: channelData[0].length,
        numberOfChannels: channelData.length,
        getChannelData(ch) {
          return channelData[ch];
        },
      };
    }

    it("builds envelope arrays", () => {
      const buffer = createAudioBuffer([new Float32Array(1000).fill(0.5)]);
      const envelope = buildWaveformEnvelope(buffer, 64);
      expect(envelope.minValues).toHaveLength(64);
      expect(envelope.maxValues).toHaveLength(64);
      expect(envelope.peakAbs).toBeCloseTo(0.5, 1);
    });

    it("handles silent buffer", () => {
      const buffer = createAudioBuffer([new Float32Array(1000).fill(0)]);
      const envelope = buildWaveformEnvelope(buffer, 64);
      expect(envelope.peakAbs).toBe(0);
    });
  });

  describe("getNormalizeGainFromPeak", () => {
    it("returns 1 when disabled", () => {
      expect(getNormalizeGainFromPeak(0.5, false)).toBe(1);
    });

    it("returns 1 for silent peak", () => {
      expect(getNormalizeGainFromPeak(0, true)).toBe(1);
    });

    it("computes normalize gain", () => {
      expect(getNormalizeGainFromPeak(0.5, true)).toBeCloseTo(1.8, 1);
    });

    it("caps at 4", () => {
      expect(getNormalizeGainFromPeak(0.0001, true)).toBe(1);
    });
  });

  describe("getEnvelopePeakAbs", () => {
    it("returns direct peak if available", () => {
      expect(getEnvelopePeakAbs({ peakAbs: 0.8 })).toBe(0.8);
    });

    it("computes peak from min/max arrays", () => {
      const envelope = { minValues: [-0.3], maxValues: [0.5] };
      expect(getEnvelopePeakAbs(envelope)).toBe(0.5);
    });

    it("returns 0 for empty envelope", () => {
      expect(getEnvelopePeakAbs(null)).toBe(0);
      expect(getEnvelopePeakAbs({})).toBe(0);
    });
  });

  describe("sampleEnvelopeAtRatio", () => {
    it("samples at ratio 0", () => {
      const envelope = { minValues: [-0.5, -0.2], maxValues: [0.5, 0.2] };
      const sample = sampleEnvelopeAtRatio(envelope, 0);
      expect(sample.min).toBe(-0.5);
      expect(sample.max).toBe(0.5);
    });

    it("samples at ratio 1", () => {
      const envelope = { minValues: [-0.5, -0.2], maxValues: [0.5, 0.2] };
      const sample = sampleEnvelopeAtRatio(envelope, 1);
      expect(sample.min).toBe(-0.2);
      expect(sample.max).toBe(0.2);
    });

    it("interpolates between buckets", () => {
      const envelope = { minValues: [-0.5, -0.2], maxValues: [0.5, 0.2] };
      const sample = sampleEnvelopeAtRatio(envelope, 0.5);
      expect(sample.min).toBeCloseTo(-0.35, 1);
      expect(sample.max).toBeCloseTo(0.35, 1);
    });

    it("returns zeros for empty envelope", () => {
      expect(sampleEnvelopeAtRatio(null, 0.5)).toEqual({ min: 0, max: 0 });
    });
  });

  describe("buildWaveformPathData", () => {
    it("returns SVG path string", () => {
      const path = buildWaveformPathData({
        envelope: { minValues: [-0.5, -0.2], maxValues: [0.5, 0.2] },
        pointCount: 4,
        sourceStartSec: 0,
        sourceDurationSec: 10,
        sourcePerClipSecond: 1,
        visibleDurationSec: 5,
        clipDurationSec: 5,
        waveformGain: 1,
      });
      expect(path.startsWith("M ")).toBe(true);
      expect(path.endsWith(" Z")).toBe(true);
      expect(path.includes("L ")).toBe(true);
    });

    it("falls back to minimum 4 points", () => {
      const path = buildWaveformPathData({
        envelope: { minValues: [0, 0, 0, 0], maxValues: [0, 0, 0, 0] },
        pointCount: 0,
        sourceStartSec: 0,
        sourceDurationSec: 1,
        sourcePerClipSecond: 1,
        visibleDurationSec: 1,
        clipDurationSec: 1,
        waveformGain: 1,
      });
      expect(path.startsWith("M ")).toBe(true);
      expect(path.endsWith(" Z")).toBe(true);
    });
  });
});
