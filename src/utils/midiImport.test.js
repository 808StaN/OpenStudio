import { describe, it, expect } from "vitest";
import {
  isMidiFileName,
  parseMidiArrayBufferToStepNotes,
  buildMidiFileDragPayload,
  writeMidiFileToDataTransfer,
  readMidiFilePayloadFromDataTransfer,
  dataTransferHasMidiFilePayload,
} from "./midiImport";
import { createMidiFileData } from "./midiExport";

describe("midiImport", () => {
  describe("isMidiFileName", () => {
    it("detects .mid and .midi extensions", () => {
      expect(isMidiFileName("beat.mid")).toBe(true);
      expect(isMidiFileName("beat.midi")).toBe(true);
      expect(isMidiFileName("beat.wav")).toBe(false);
      expect(isMidiFileName("")).toBe(false);
    });
  });

  describe("parseMidiArrayBufferToStepNotes", () => {
    it("parses exported MIDI back to step notes", () => {
      const notes = [{ pitch: 60, velocity: 100, start: 0, length: 1 }];
      const midiData = createMidiFileData(notes, 120);
      const parsed = parseMidiArrayBufferToStepNotes(midiData.buffer);
      expect(parsed.length).toBeGreaterThanOrEqual(1);
      expect(parsed[0].pitch).toBe(60);
      expect(parsed[0].velocity).toBe(100);
      expect(parsed[0].source).toBe("piano");
    });

    it("returns empty array for invalid input", () => {
      expect(parseMidiArrayBufferToStepNotes(null)).toEqual([]);
      expect(parseMidiArrayBufferToStepNotes(new ArrayBuffer(0))).toEqual([]);
    });

    it("returns empty array for non-MIDI bytes", () => {
      const buffer = new Uint8Array([0x00, 0x01, 0x02]).buffer;
      expect(parseMidiArrayBufferToStepNotes(buffer)).toEqual([]);
    });
  });

  describe("buildMidiFileDragPayload", () => {
    it("builds payload with trimmed strings", () => {
      const payload = buildMidiFileDragPayload({ fileName: " beat.mid ", midiPath: "/packs/beat.mid" });
      expect(payload.fileName).toBe("beat.mid");
      expect(payload.midiPath).toBe("/packs/beat.mid");
    });
  });

  describe("write / read round-trip", () => {
    it("writes and reads payload from DataTransfer", () => {
      const payload = buildMidiFileDragPayload({ fileName: "beat.mid", midiPath: "/packs/beat.mid" });
      const dt = new DataTransfer();
      writeMidiFileToDataTransfer(dt, payload);
      const read = readMidiFilePayloadFromDataTransfer(dt);
      expect(read.fileName).toBe("beat.mid");
      expect(read.midiPath).toBe("/packs/beat.mid");
    });

    it("returns null for missing midiPath", () => {
      const dt = new DataTransfer();
      dt.setData("application/x-openstudio-midi-file", JSON.stringify({ type: "openstudio-midi-file", midiPath: "" }));
      expect(readMidiFilePayloadFromDataTransfer(dt)).toBeNull();
    });
  });

  describe("dataTransferHasMidiFilePayload", () => {
    it("detects MIDI file MIME type", () => {
      const dt = new DataTransfer();
      dt.setData("application/x-openstudio-midi-file", "{}");
      expect(dataTransferHasMidiFilePayload(dt)).toBe(true);
    });

    it("detects dropped .mid file", () => {
      const dt = new DataTransfer();
      dt.setData("Files", "beat.mid");
      expect(dataTransferHasMidiFilePayload(dt)).toBe(true);
    });

    it("returns false for empty transfer", () => {
      expect(dataTransferHasMidiFilePayload(null)).toBe(false);
      expect(dataTransferHasMidiFilePayload(new DataTransfer())).toBe(false);
    });
  });
});
