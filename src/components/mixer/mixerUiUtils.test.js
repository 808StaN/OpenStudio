import { describe, it, expect } from "vitest";
import {
  isSupportedEffectType,
  getFxSlotName,
  getInsertLabel,
  formatPercentValue,
  formatSignedPercentValue,
} from "./mixerUiUtils";

describe("mixerUiUtils", () => {
  describe("isSupportedEffectType", () => {
    it("returns true for supported effects", () => {
      expect(isSupportedEffectType("graphic-eq")).toBe(true);
      expect(isSupportedEffectType("reverb")).toBe(true);
      expect(isSupportedEffectType("maximizer")).toBe(true);
    });

    it("returns false for unsupported effects", () => {
      expect(isSupportedEffectType("none")).toBe(false);
      expect(isSupportedEffectType("delay")).toBe(false);
      expect(isSupportedEffectType("")).toBe(false);
    });
  });

  describe("getFxSlotName", () => {
    it("returns effect names", () => {
      expect(getFxSlotName({ effectType: "graphic-eq" }, 0)).toBe("Graphic EQ");
      expect(getFxSlotName({ effectType: "reverb" }, 0)).toBe("Reverb");
      expect(getFxSlotName({ effectType: "maximizer" }, 0)).toBe("Limiter");
    });

    it("falls back to slot name or index", () => {
      expect(getFxSlotName({ name: "Custom" }, 0)).toBe("Custom");
      expect(getFxSlotName({}, 2)).toBe("Slot 3");
    });
  });

  describe("getInsertLabel", () => {
    it("returns Master for master insert", () => {
      expect(getInsertLabel({ isMaster: true, name: "Master Out" })).toBe("Master Out");
      expect(getInsertLabel({ isMaster: true })).toBe("Master");
    });

    it("capitalizes insert prefix", () => {
      expect(getInsertLabel({ name: "insert 3", id: "insert-3" })).toBe("Insert 3");
    });

    it("extracts numeric suffix from id", () => {
      expect(getInsertLabel({ id: "insert-7", name: "" })).toBe("Insert 7");
    });

    it("falls back to name or generic Insert", () => {
      expect(getInsertLabel({ name: "Kick" })).toBe("Kick");
      expect(getInsertLabel({})).toBe("Insert");
    });
  });

  describe("formatPercentValue", () => {
    it("formats as percent", () => {
      expect(formatPercentValue(0.5)).toBe("50%");
      expect(formatPercentValue(1)).toBe("100%");
      expect(formatPercentValue(0)).toBe("0%");
    });
  });

  describe("formatSignedPercentValue", () => {
    it("adds plus sign for positive values", () => {
      expect(formatSignedPercentValue(0.25)).toBe("+25%");
    });

    it("omits plus for zero or negative", () => {
      expect(formatSignedPercentValue(0)).toBe("0%");
      expect(formatSignedPercentValue(-0.25)).toBe("-25%");
    });
  });
});
