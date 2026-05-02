import { describe, it, expect } from "vitest";
import {
  clamp,
  midiVelocityToPercent,
  percentToMidiVelocity,
  quantizeBySnap,
  isNearlyEqual,
  getNoteName,
  getPitchClassName,
  toPitchClass,
  makeGeneratedNoteId,
  midiPitchToPlaybackRate,
  getNoteSelectionId,
  moveByScaleStep,
} from "./pianoRollUtils";

describe("pianoRollUtils", () => {
  describe("clamp", () => {
    it("clamps between bounds", () => {
      expect(clamp(5, 0, 10)).toBe(5);
      expect(clamp(-5, 0, 10)).toBe(0);
      expect(clamp(15, 0, 10)).toBe(10);
    });
  });

  describe("midiVelocityToPercent", () => {
    it("converts MIDI velocity to percent", () => {
      expect(midiVelocityToPercent(127)).toBe(100);
      expect(midiVelocityToPercent(64)).toBe(50);
      expect(midiVelocityToPercent(1)).toBe(1);
    });

    it("clamps out-of-range values", () => {
      expect(midiVelocityToPercent(200)).toBe(100);
      expect(midiVelocityToPercent(-5)).toBe(1);
    });
  });

  describe("percentToMidiVelocity", () => {
    it("converts percent to MIDI velocity", () => {
      expect(percentToMidiVelocity(100)).toBe(127);
      expect(percentToMidiVelocity(0)).toBe(1);
    });
  });

  describe("quantizeBySnap", () => {
    it("quantizes to snap size", () => {
      expect(quantizeBySnap(1.13, 0.25)).toBe(1.25);
      expect(quantizeBySnap(1.12, 0.25)).toBe(1.0);
    });

    it("returns rounded value when snap is falsy", () => {
      expect(quantizeBySnap(1.12345, 0)).toBe(1.123);
    });
  });

  describe("isNearlyEqual", () => {
    it("compares with default epsilon", () => {
      expect(isNearlyEqual(1.0, 1.00005)).toBe(true);
      expect(isNearlyEqual(1.0, 1.001)).toBe(false);
    });

    it("uses custom epsilon", () => {
      expect(isNearlyEqual(1.0, 1.5, 1)).toBe(true);
    });
  });

  describe("getNoteName", () => {
    it("returns correct note names", () => {
      expect(getNoteName(60)).toBe("C4");
      expect(getNoteName(61)).toBe("C#4");
      expect(getNoteName(72)).toBe("C5");
    });
  });

  describe("getPitchClassName", () => {
    it("returns pitch class name", () => {
      expect(getPitchClassName(60)).toBe("C");
      expect(getPitchClassName(61)).toBe("C#");
    });
  });

  describe("toPitchClass", () => {
    it("normalizes pitch class to 0-11", () => {
      expect(toPitchClass(60)).toBe(0);
      expect(toPitchClass(61)).toBe(1);
      expect(toPitchClass(-1)).toBe(11);
      expect(toPitchClass(12)).toBe(0);
    });
  });

  describe("makeGeneratedNoteId", () => {
    it("generates string with prefix", () => {
      const id = makeGeneratedNoteId("note");
      expect(id.startsWith("note-")).toBe(true);
      expect(id.length).toBeGreaterThan(10);
    });
  });

  describe("midiPitchToPlaybackRate", () => {
    it("returns 1.0 at default pitch", () => {
      expect(midiPitchToPlaybackRate(72)).toBe(1);
    });

    it("shifts by semitones", () => {
      expect(midiPitchToPlaybackRate(84)).toBe(2); // +12 semitones
      expect(midiPitchToPlaybackRate(60)).toBe(0.5); // -12 semitones
    });

    it("clamps to [0.125, 8]", () => {
      expect(midiPitchToPlaybackRate(1)).toBeCloseTo(0.125, 2);
      expect(midiPitchToPlaybackRate(200)).toBe(8);
    });
  });

  describe("getNoteSelectionId", () => {
    it("returns step key for step notes", () => {
      expect(getNoteSelectionId({ source: "step", start: 4 })).toBe("step:4");
    });

    it("returns piano key for piano notes", () => {
      expect(getNoteSelectionId({ source: "piano", id: "n-1" })).toBe("piano:n-1");
    });
  });

  describe("moveByScaleStep", () => {
    it("moves to next pitch class in set", () => {
      const set = new Set([0, 4, 7]); // C major triad
      expect(moveByScaleStep(60, 1, set, 0, 127)).toBe(64); // C -> E
      expect(moveByScaleStep(64, 1, set, 0, 127)).toBe(67); // E -> G
    });

    it("falls back to clamped step if no scale match in narrow range", () => {
      const set = new Set([5]); // no match within [61, 62]
      expect(moveByScaleStep(61, 1, set, 61, 62)).toBe(62);
    });

    it("respects min/max bounds", () => {
      const set = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
      expect(moveByScaleStep(0, -1, set, 0, 127)).toBe(0);
    });
  });
});
