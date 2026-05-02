import { describe, it, expect } from "vitest";
import {
  clamp,
  sanitizeUiTheme,
  getDefaultEqBandType,
  sanitizeEqBandType,
  clampEqBandGainDb,
  clampEqFrequencyHz,
  clampEqQ,
  makeGraphicEqParams,
  getSafeGraphicEqParams,
  clampReverb01,
  clampReverbInRange,
  makeReverbParams,
  getSafeReverbParams,
  sanitizeMaximizerMode,
  clampMaximizerThresholdDb,
  clampMaximizerCeilingDb,
  clampMaximizerCharacter,
  makeMaximizerParams,
  getSafeMaximizerParams,
  makeInsertSpectrum,
  makeInsertWaveform,
  makeMaximizerStereoMeter,
  getFxSlotDefaultName,
  normalizeFxSlot,
  ensureInsertFxSlots,
  makeFxSlots,
  makeSampleSettings,
  sanitizeLoadedSampleSettings,
  nearlyEqual,
  makeStepRow,
  makePlaylistTracks,
  makePatternStepGrid,
  normalizeBarValue,
  getSafePatternColor,
  makeEmptyPattern,
  getNextPatternNumber,
  clonePatternForCopy,
  isObjectLike,
  cloneSerializable,
} from "./utils";

describe("store/utils", () => {
  describe("clamp", () => {
    it("clamps value between min and max", () => {
      expect(clamp(5, 0, 10)).toBe(5);
      expect(clamp(-5, 0, 10)).toBe(0);
      expect(clamp(15, 0, 10)).toBe(10);
    });
  });

  describe("sanitizeUiTheme", () => {
    it("returns valid theme", () => {
      expect(sanitizeUiTheme("tealslate")).toBe("tealslate");
      expect(sanitizeUiTheme("studio95")).toBe("studio95");
    });

    it("falls back to default for invalid theme", () => {
      expect(sanitizeUiTheme("unknown")).toBe("default");
      expect(sanitizeUiTheme("")).toBe("default");
      expect(sanitizeUiTheme(null)).toBe("default");
    });
  });

  describe("EQ helpers", () => {
    it("getDefaultEqBandType returns correct types", () => {
      expect(getDefaultEqBandType(0)).toBe("lowshelf");
      expect(getDefaultEqBandType(6)).toBe("highshelf");
      expect(getDefaultEqBandType(3)).toBe("peaking");
    });

    it("sanitizeEqBandType accepts valid types", () => {
      expect(sanitizeEqBandType("peaking", "lowshelf")).toBe("peaking");
      expect(sanitizeEqBandType("invalid", "lowshelf")).toBe("lowshelf");
      expect(sanitizeEqBandType("invalid", "bad")).toBe("peaking");
    });

    it("clampEqBandGainDb clamps to [-18, 18]", () => {
      expect(clampEqBandGainDb(10)).toBe(10);
      expect(clampEqBandGainDb(25)).toBe(18);
      expect(clampEqBandGainDb(-25)).toBe(-18);
    });

    it("clampEqFrequencyHz clamps to [20, 20000]", () => {
      expect(clampEqFrequencyHz(1000)).toBe(1000);
      expect(clampEqFrequencyHz(10)).toBe(20);
      expect(clampEqFrequencyHz(30000)).toBe(20000);
    });

    it("clampEqQ clamps to [0.25, 8]", () => {
      expect(clampEqQ(1.5)).toBe(1.5);
      expect(clampEqQ(0.1)).toBe(0.25);
      expect(clampEqQ(10)).toBe(8);
    });

    it("makeGraphicEqParams returns 7 points", () => {
      const params = makeGraphicEqParams();
      expect(params.points).toHaveLength(7);
      expect(params.points[0]).toMatchObject({
        frequencyHz: 50,
        gainDb: 0,
        bandType: "lowshelf",
      });
    });

    it("getSafeGraphicEqParams migrates legacy bands", () => {
      const legacy = { bands: [3, -2, 0, 0, 0, 0, 0] };
      const result = getSafeGraphicEqParams(legacy);
      expect(result.points[0].gainDb).toBe(3);
      expect(result.points[1].gainDb).toBe(-2);
    });
  });

  describe("Reverb helpers", () => {
    it("clampReverb01 clamps to [0, 1]", () => {
      expect(clampReverb01(0.5, 0)).toBe(0.5);
      expect(clampReverb01(-0.2, 0)).toBe(0);
      expect(clampReverb01(1.5, 0)).toBe(1);
      expect(clampReverb01(NaN, 0.5)).toBe(0.5);
    });

    it("clampReverbInRange clamps to given range", () => {
      expect(clampReverbInRange(5, 0, 10, 0)).toBe(5);
      expect(clampReverbInRange(15, 0, 10, 0)).toBe(10);
      expect(clampReverbInRange(NaN, 0, 10, 3)).toBe(3);
    });

    it("makeReverbParams returns defaults", () => {
      const params = makeReverbParams();
      expect(params.decayTime).toBe(2.8);
      expect(params.dryWet).toBe(0.34);
      expect(params.freeze).toBe(false);
    });

    it("getSafeReverbParams clamps all fields", () => {
      const raw = { decayTime: 50, size: -1, dryWet: 2 };
      const safe = getSafeReverbParams(raw);
      expect(safe.decayTime).toBe(20);
      expect(safe.size).toBe(0);
      expect(safe.dryWet).toBe(1);
    });
  });

  describe("Maximizer helpers", () => {
    it("sanitizeMaximizerMode falls back to irc-ii", () => {
      expect(sanitizeMaximizerMode("irc-iii")).toBe("irc-iii");
      expect(sanitizeMaximizerMode("bad")).toBe("irc-ii");
    });

    it("clampMaximizerThresholdDb clamps to [-24, 0]", () => {
      expect(clampMaximizerThresholdDb(-12)).toBe(-12);
      expect(clampMaximizerThresholdDb(-30)).toBe(-24);
      expect(clampMaximizerThresholdDb(5)).toBe(0);
    });

    it("clampMaximizerCeilingDb clamps to [-18, 0]", () => {
      expect(clampMaximizerCeilingDb(-3)).toBe(-3);
      expect(clampMaximizerCeilingDb(-30)).toBe(-18);
    });

    it("clampMaximizerCharacter clamps to [0, 1]", () => {
      expect(clampMaximizerCharacter(0.5)).toBe(0.5);
      expect(clampMaximizerCharacter(2)).toBe(1);
    });

    it("makeMaximizerParams returns defaults", () => {
      const params = makeMaximizerParams();
      expect(params.mode).toBe("irc-ii");
      expect(params.truePeakEnabled).toBe(true);
    });

    it("getSafeMaximizerParams migrates legacy defaults", () => {
      const legacy = {
        thresholdDb: -6,
        ceilingDb: -0.1,
        character: 0.58,
        mode: "irc-ii",
        truePeakEnabled: true,
      };
      const safe = getSafeMaximizerParams(legacy);
      expect(safe.thresholdDb).toBe(0);
      expect(safe.ceilingDb).toBe(-1);
      expect(safe.character).toBe(0.5);
    });
  });

  describe("Insert / FX helpers", () => {
    it("makeInsertSpectrum returns array of zeros", () => {
      const spec = makeInsertSpectrum();
      expect(spec).toHaveLength(112);
      expect(spec.every((v) => v === 0)).toBe(true);
    });

    it("makeInsertWaveform returns array of zeros", () => {
      const wf = makeInsertWaveform();
      expect(wf).toHaveLength(220);
    });

    it("makeMaximizerStereoMeter returns default meters", () => {
      const meter = makeMaximizerStereoMeter();
      expect(meter.leftVolumeDb).toBe(-96);
      expect(meter.rightReductionDb).toBe(0);
    });

    it("getFxSlotDefaultName formats correctly", () => {
      expect(getFxSlotDefaultName(0)).toBe("Slot 1");
      expect(getFxSlotDefaultName(9)).toBe("Slot 10");
    });

    it("normalizeFxSlot normalizes empty slot", () => {
      const slot = normalizeFxSlot({}, 0);
      expect(slot.effectType).toBe("none");
      expect(slot.enabled).toBe(false);
    });

    it("normalizeFxSlot normalizes graphic-eq", () => {
      const slot = normalizeFxSlot({ effectType: "graphic-eq", enabled: true }, 0);
      expect(slot.effectType).toBe("graphic-eq");
      expect(slot.enabled).toBe(true);
      expect(slot.params.points).toHaveLength(7);
    });

    it("ensureInsertFxSlots ensures 10 slots", () => {
      const insert = {};
      ensureInsertFxSlots(insert);
      expect(insert.fxSlots).toHaveLength(10);
      expect(insert.fxSlots[0].id).toBe("slot-1");
    });

    it("makeFxSlots returns 10 disabled slots", () => {
      const slots = makeFxSlots();
      expect(slots).toHaveLength(10);
      expect(slots[5].enabled).toBe(false);
    });
  });

  describe("Sample settings helpers", () => {
    it("makeSampleSettings returns defaults", () => {
      const settings = makeSampleSettings();
      expect(settings.stretchMode).toBe("resample");
      expect(settings.pitchCents).toBe(0);
    });

    it("sanitizeLoadedSampleSettings fixes invalid stretch mode", () => {
      const raw = { stretchMode: "invalid", stretchTimeMode: "invalid" };
      const safe = sanitizeLoadedSampleSettings(raw);
      expect(safe.stretchMode).toBe("resample");
      expect(safe.stretchTimeMode).toBe("none");
    });

    it("sanitizeLoadedSampleSettings preserves valid modes", () => {
      const raw = { stretchMode: "stretch", stretchTimeMode: "set-bpm" };
      const safe = sanitizeLoadedSampleSettings(raw);
      expect(safe.stretchMode).toBe("stretch");
      expect(safe.stretchTimeMode).toBe("set-bpm");
    });
  });

  describe("Pattern / project helpers", () => {
    it("nearlyEqual compares with epsilon", () => {
      expect(nearlyEqual(1.0, 1.00005)).toBe(true);
      expect(nearlyEqual(1.0, 1.001)).toBe(false);
    });

    it("makeStepRow creates correct row", () => {
      const row = makeStepRow(8, [0, 3, 7]);
      expect(row).toEqual([true, false, false, true, false, false, false, true]);
    });

    it("makePlaylistTracks returns numbered tracks", () => {
      const tracks = makePlaylistTracks(3);
      expect(tracks).toHaveLength(3);
      expect(tracks[0].name).toBe("Track 1");
    });

    it("makePatternStepGrid builds empty grid", () => {
      const channels = [{ id: "ch-1" }, { id: "ch-2" }];
      const grid = makePatternStepGrid(channels, 16);
      expect(Object.keys(grid)).toHaveLength(2);
      expect(grid["ch-1"]).toHaveLength(16);
    });

    it("normalizeBarValue rounds to 1/16", () => {
      expect(normalizeBarValue(1.125, 0, 512)).toBe(1.125);
      expect(normalizeBarValue(1.13, 0, 512)).toBe(1.125);
    });

    it("getSafePatternColor validates hex", () => {
      expect(getSafePatternColor("#ff0000")).toBe("#ff0000");
      expect(getSafePatternColor("bad")).toBe("#4bef9f");
    });

    it("makeEmptyPattern creates pattern with stepGrid", () => {
      const pattern = makeEmptyPattern({
        id: "p1",
        name: "Test",
        lengthSteps: 16,
        channels: [{ id: "ch-1" }],
      });
      expect(pattern.lengthSteps).toBe(16);
      expect(pattern.stepGrid["ch-1"]).toHaveLength(16);
    });

    it("getNextPatternNumber extracts from names and ids", () => {
      const patterns = [
        { name: "Pattern 3", id: "pat-1" },
        { name: "Melody", id: "pat-5" },
      ];
      expect(getNextPatternNumber(patterns)).toBe(6);
    });

    it("clonePatternForCopy clones safely", () => {
      const source = {
        id: "p1",
        name: "Original",
        color: "#ff0000",
        lengthSteps: 16,
        stepGrid: { "ch-1": [true, false] },
        pianoPreview: {},
      };
      const clone = clonePatternForCopy(source, "p2", "Copy");
      expect(clone.id).toBe("p2");
      expect(clone.name).toBe("Copy");
      expect(clone.stepGrid["ch-1"]).toHaveLength(16);
    });
  });

  describe("Serialization helpers", () => {
    it("isObjectLike detects plain objects", () => {
      expect(isObjectLike({})).toBe(true);
      expect(isObjectLike([])).toBe(false);
      expect(isObjectLike(null)).toBe(false);
      expect(isObjectLike("string")).toBe(false);
    });

    it("cloneSerializable deep clones", () => {
      const obj = { a: 1, b: { c: 2 } };
      const clone = cloneSerializable(obj);
      expect(clone).toEqual(obj);
      expect(clone).not.toBe(obj);
      expect(clone.b).not.toBe(obj.b);
    });

    it("cloneSerializable returns null on circular ref", () => {
      const obj = {};
      obj.self = obj;
      expect(cloneSerializable(obj)).toBeNull();
    });
  });
});
