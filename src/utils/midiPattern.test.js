import { describe, it, expect } from "vitest";
import {
  extractMidiPatternNotes,
  buildMidiPatternDragPayload,
  parseMidiPatternDragPayload,
  writeMidiPatternToDataTransfer,
  readMidiPatternFromDataTransfer,
  dataTransferHasMidiPatternPayload,
} from "./midiPattern";

describe("midiPattern", () => {
  describe("extractMidiPatternNotes", () => {
    it("extracts and sanitizes notes from pattern", () => {
      const pattern = {
        lengthSteps: 16,
        stepGrid: { "ch-1": [true, false, true] },
        pianoPreview: {
          "ch-1": [
            { start: 0, length: 1, pitch: 60, velocity: 100, source: "piano" },
          ],
        },
      };
      const notes = extractMidiPatternNotes(pattern, "ch-1");
      expect(notes.length).toBeGreaterThanOrEqual(1);
      // merged notes sort descending by pitch when start is equal
      expect(notes.some((n) => n.pitch === 60)).toBe(true);
      expect(notes.some((n) => n.pitch === 72)).toBe(true);
    });

    it("filters out invalid notes", () => {
      const pattern = {
        lengthSteps: 16,
        stepGrid: { "ch-1": [] },
        pianoPreview: { "ch-1": [] },
      };
      const notes = extractMidiPatternNotes(pattern, "ch-1");
      expect(notes).toEqual([]);
    });
  });

  describe("buildMidiPatternDragPayload", () => {
    it("builds payload with sanitized notes", () => {
      const payload = buildMidiPatternDragPayload({
        patternId: "pat-1",
        channelId: "ch-1",
        notes: [{ start: 0, length: 1, pitch: 60, velocity: 100 }],
      });
      expect(payload.type).toBe("openstudio-midi-pattern");
      expect(payload.notes).toHaveLength(1);
    });

    it("returns empty notes for missing input", () => {
      const payload = buildMidiPatternDragPayload({});
      expect(payload.notes).toEqual([]);
    });
  });

  describe("parseMidiPatternDragPayload", () => {
    it("parses valid JSON payload", () => {
      const raw = JSON.stringify({
        type: "openstudio-midi-pattern",
        version: 1,
        patternId: "pat-1",
        channelId: "ch-1",
        channelName: "Kick",
        notes: [{ start: 0, length: 1, pitch: 60, velocity: 100 }],
      });
      const parsed = parseMidiPatternDragPayload(raw);
      expect(parsed.patternId).toBe("pat-1");
      expect(parsed.notes).toHaveLength(1);
    });

    it("returns null for invalid type", () => {
      const raw = JSON.stringify({ type: "other", notes: [] });
      expect(parseMidiPatternDragPayload(raw)).toBeNull();
    });

    it("returns null for empty notes", () => {
      const raw = JSON.stringify({ type: "openstudio-midi-pattern", notes: [] });
      expect(parseMidiPatternDragPayload(raw)).toBeNull();
    });

    it("returns null for invalid JSON", () => {
      expect(parseMidiPatternDragPayload("bad")).toBeNull();
    });
  });

  describe("write / read round-trip", () => {
    it("writes and reads from DataTransfer", () => {
      const payload = buildMidiPatternDragPayload({
        patternId: "pat-1",
        channelId: "ch-1",
        notes: [{ start: 0, length: 1, pitch: 60, velocity: 100 }],
      });
      const dt = new DataTransfer();
      writeMidiPatternToDataTransfer(dt, payload);
      const read = readMidiPatternFromDataTransfer(dt);
      expect(read.patternId).toBe("pat-1");
      expect(read.notes).toHaveLength(1);
    });
  });

  describe("dataTransferHasMidiPatternPayload", () => {
    it("detects MIDI pattern MIME type", () => {
      const dt = new DataTransfer();
      dt.setData("application/x-openstudio-midi-pattern", "{}");
      expect(dataTransferHasMidiPatternPayload(dt)).toBe(true);
    });

    it("returns false for empty DataTransfer", () => {
      expect(dataTransferHasMidiPatternPayload(null)).toBe(false);
      expect(dataTransferHasMidiPatternPayload(new DataTransfer())).toBe(false);
    });
  });
});
