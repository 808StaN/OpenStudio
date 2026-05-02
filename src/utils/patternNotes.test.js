import { describe, it, expect } from "vitest";
import { getChannelMergedNotes, C5_PITCH } from "./patternNotes";

describe("patternNotes", () => {
  describe("getChannelMergedNotes", () => {
    it("returns empty array for missing pattern", () => {
      expect(getChannelMergedNotes(null, "ch-1")).toEqual([]);
    });

    it("converts step row to notes", () => {
      const pattern = {
        lengthSteps: 16,
        stepGrid: {
          "ch-1": [true, false, true, false],
        },
        pianoPreview: {},
      };
      const notes = getChannelMergedNotes(pattern, "ch-1");
      expect(notes).toHaveLength(2);
      expect(notes[0]).toMatchObject({ start: 0, length: 1, pitch: C5_PITCH, source: "step" });
      expect(notes[1]).toMatchObject({ start: 2, length: 1, pitch: C5_PITCH, source: "step" });
    });

    it("merges piano notes", () => {
      const pattern = {
        lengthSteps: 16,
        stepGrid: { "ch-1": [] },
        pianoPreview: {
          "ch-1": [
            { start: 0, length: 2, pitch: 60, velocity: 100 },
            { start: 1, length: 1, pitch: 64, velocity: 80 },
          ],
        },
      };
      const notes = getChannelMergedNotes(pattern, "ch-1");
      expect(notes).toHaveLength(2);
      expect(notes[0].source).toBe("piano");
    });

    it("sorts notes by start then pitch desc", () => {
      const pattern = {
        lengthSteps: 16,
        stepGrid: { "ch-1": [false, false, true] },
        pianoPreview: {
          "ch-1": [{ start: 0, length: 1, pitch: 80 }],
        },
      };
      const notes = getChannelMergedNotes(pattern, "ch-1");
      expect(notes[0].source).toBe("piano");
      expect(notes[1].source).toBe("step");
    });

    it("clamps piano note length to pattern bounds", () => {
      const pattern = {
        lengthSteps: 4,
        stepGrid: {},
        pianoPreview: {
          "ch-1": [{ start: 3, length: 4, pitch: 60 }],
        },
      };
      const notes = getChannelMergedNotes(pattern, "ch-1");
      expect(notes[0].start).toBe(3);
      expect(notes[0].length).toBe(1); // clamped to pattern length
    });
  });
});
