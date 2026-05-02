import { describe, it, expect } from "vitest";
import {
  FX_EFFECT_NONE,
  FX_EFFECT_GRAPHIC_EQ,
  getDefaultEqBandType,
  sanitizeEqBandType,
  getSafeGraphicEqParams,
  getSafeReverbParams,
  sanitizeMaximizerMode,
  getSafeMaximizerParams,
  buildSoftClipCurve,
} from "./fxParams";

describe("fxParams", () => {
  describe("constants", () => {
    it("exports canonical effect IDs", () => {
      expect(FX_EFFECT_NONE).toBe("none");
      expect(FX_EFFECT_GRAPHIC_EQ).toBe("graphic-eq");
    });
  });

  describe("getDefaultEqBandType", () => {
    it("returns lowshelf for first point", () => {
      expect(getDefaultEqBandType(0)).toBe("lowshelf");
    });

    it("returns highshelf for last point", () => {
      expect(getDefaultEqBandType(6)).toBe("highshelf");
    });

    it("returns peaking for middle points", () => {
      expect(getDefaultEqBandType(3)).toBe("peaking");
    });
  });

  describe("sanitizeEqBandType", () => {
    it("accepts valid types", () => {
      expect(sanitizeEqBandType("peaking", "lowshelf")).toBe("peaking");
    });

    it("falls back to provided fallback", () => {
      expect(sanitizeEqBandType("invalid", "lowshelf")).toBe("lowshelf");
    });

    it("falls back to peaking when both invalid", () => {
      expect(sanitizeEqBandType("bad", "worse")).toBe("peaking");
    });
  });

  describe("getSafeGraphicEqParams", () => {
    it("returns defaults for empty input", () => {
      const params = getSafeGraphicEqParams({});
      expect(params.points).toHaveLength(7);
      expect(params.points[0].gainDb).toBe(0);
      expect(params.points[0].bandType).toBe("lowshelf");
    });

    it("migrates legacy bands", () => {
      const params = getSafeGraphicEqParams({ bands: [3, -2, 0, 0, 0, 0, 0] });
      expect(params.points[0].gainDb).toBe(3);
      expect(params.points[1].gainDb).toBe(-2);
    });

    it("clamps frequency and gain", () => {
      const params = getSafeGraphicEqParams({
        points: [{ frequencyHz: 10, gainDb: 25, q: 10, bandType: "peaking" }],
      });
      expect(params.points[0].frequencyHz).toBe(20);
      expect(params.points[0].gainDb).toBe(18);
      expect(params.points[0].q).toBe(8);
    });
  });

  describe("getSafeReverbParams", () => {
    it("returns defaults for empty input", () => {
      const params = getSafeReverbParams({});
      expect(params.decayTime).toBe(2.8);
      expect(params.dryWet).toBe(0.34);
      expect(params.freeze).toBe(false);
    });

    it("clamps all fields", () => {
      const params = getSafeReverbParams({ decayTime: 50, size: -1, dryWet: 2 });
      expect(params.decayTime).toBe(20);
      expect(params.size).toBe(0);
      expect(params.dryWet).toBe(1);
    });
  });

  describe("sanitizeMaximizerMode", () => {
    it("returns valid mode", () => {
      expect(sanitizeMaximizerMode("irc-iii")).toBe("irc-iii");
    });

    it("falls back to irc-ii", () => {
      expect(sanitizeMaximizerMode("bad")).toBe("irc-ii");
      expect(sanitizeMaximizerMode("")).toBe("irc-ii");
    });
  });

  describe("getSafeMaximizerParams", () => {
    it("returns defaults for empty input", () => {
      const params = getSafeMaximizerParams({});
      expect(params.mode).toBe("irc-ii");
      expect(params.thresholdDb).toBe(0);
      expect(params.ceilingDb).toBe(-1);
    });

    it("clamps fields", () => {
      const params = getSafeMaximizerParams({ thresholdDb: -30, ceilingDb: -30, character: 2 });
      expect(params.thresholdDb).toBe(-24);
      expect(params.ceilingDb).toBe(-18);
      expect(params.character).toBe(1);
    });

    it("migrates legacy defaults", () => {
      const legacy = {
        thresholdDb: -6,
        ceilingDb: -0.1,
        character: 0.58,
        mode: "irc-ii",
        truePeakEnabled: true,
      };
      const params = getSafeMaximizerParams(legacy);
      expect(params.thresholdDb).toBe(0);
      expect(params.ceilingDb).toBe(-1);
      expect(params.character).toBe(0.5);
    });
  });

  describe("buildSoftClipCurve", () => {
    it("returns Float32Array of 4096 samples", () => {
      const curve = buildSoftClipCurve(0.5);
      expect(curve).toBeInstanceOf(Float32Array);
      expect(curve.length).toBe(4096);
    });

    it("curve is symmetric around zero", () => {
      const curve = buildSoftClipCurve(0.5);
      expect(curve[0]).toBeCloseTo(-1, 1);
      expect(curve[curve.length - 1]).toBeCloseTo(1, 1);
      expect(curve[Math.floor(curve.length / 2)]).toBeCloseTo(0, 2);
    });
  });
});
