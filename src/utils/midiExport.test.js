import { describe, it, expect } from "vitest";
import { createMidiFileData } from "./midiExport";

function toHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" ");
}

describe("midiExport", () => {
  describe("createMidiFileData", () => {
    it("returns a Uint8Array", () => {
      const data = createMidiFileData([], 120);
      expect(data).toBeInstanceOf(Uint8Array);
    });

    it("contains valid MIDI header", () => {
      const data = createMidiFileData([], 120);
      // MThd
      expect(data[0]).toBe(0x4d);
      expect(data[1]).toBe(0x54);
      expect(data[2]).toBe(0x68);
      expect(data[3]).toBe(0x64);
      // header length = 6
      expect(data[4]).toBe(0x00);
      expect(data[5]).toBe(0x00);
      expect(data[6]).toBe(0x00);
      expect(data[7]).toBe(0x06);
      // format 0, 1 track
      expect(data[8]).toBe(0x00);
      expect(data[9]).toBe(0x00);
      expect(data[10]).toBe(0x00);
      expect(data[11]).toBe(0x01);
      // 480 ticks per quarter
      expect(data[12]).toBe(0x01);
      expect(data[13]).toBe(0xe0);
    });

    it("contains valid track chunk", () => {
      const data = createMidiFileData([], 120);
      const trackOffset = 14; // after header
      // MTrk
      expect(data[trackOffset]).toBe(0x4d);
      expect(data[trackOffset + 1]).toBe(0x54);
      expect(data[trackOffset + 2]).toBe(0x72);
      expect(data[trackOffset + 3]).toBe(0x6b);
    });

    it("embeds tempo meta event for given BPM", () => {
      const data = createMidiFileData([], 120);
      const trackOffset = 14;
      const trackLen =
        (data[trackOffset + 4] << 24) |
        (data[trackOffset + 5] << 16) |
        (data[trackOffset + 6] << 8) |
        data[trackOffset + 7];
      expect(trackLen).toBeGreaterThan(0);

      // After track length (4 bytes), first event should be tempo meta
      const eventStart = trackOffset + 8;
      expect(data[eventStart]).toBe(0x00); // delta 0
      expect(data[eventStart + 1]).toBe(0xff); // meta
      expect(data[eventStart + 2]).toBe(0x51); // tempo
      expect(data[eventStart + 3]).toBe(0x03); // 3 bytes
      // 120 BPM = 500000 microseconds per quarter = 0x07 0xa1 0x20
      expect(data[eventStart + 4]).toBe(0x07);
      expect(data[eventStart + 5]).toBe(0xa1);
      expect(data[eventStart + 6]).toBe(0x20);
    });

    it("writes note on and note off events", () => {
      const notes = [{ pitch: 60, velocity: 100, start: 0, length: 1 }];
      const data = createMidiFileData(notes, 120);
      const hex = toHex(data);

      // 0x90 = note on channel 1, 0x80 = note off channel 1
      expect(hex).toContain("90 3c 64"); // pitch 60 (0x3c), velocity 100 (0x64)
      expect(hex).toContain("80 3c 00"); // note off, pitch 60, velocity 0
    });

    it("clamps pitch to [0, 127]", () => {
      const notes = [{ pitch: 200, velocity: 100, start: 0, length: 1 }];
      const data = createMidiFileData(notes, 120);
      const hex = toHex(data);
      expect(hex).toContain("90 7f 64"); // pitch clamped to 127 (0x7f)
    });

    it("clamps velocity to [1, 127]", () => {
      const notes = [{ pitch: 60, velocity: 0.5, start: 0, length: 1 }];
      const data = createMidiFileData(notes, 120);
      const hex = toHex(data);
      expect(hex).toContain("90 3c 01"); // velocity clamped to 1
    });

    it("clamps BPM to [20, 300]", () => {
      const dataSlow = createMidiFileData([], 10);
      const dataFast = createMidiFileData([], 500);

      // 20 BPM = 3000000 us/q = 0x2d c6 c0
      const trackOffset = 14 + 8; // header + track header + delta
      expect(dataSlow[trackOffset + 4]).toBe(0x2d);
      expect(dataSlow[trackOffset + 5]).toBe(0xc6);
      expect(dataSlow[trackOffset + 6]).toBe(0xc0);

      // 300 BPM = 200000 us/q = 0x03 0x0d 0x40
      expect(dataFast[trackOffset + 4]).toBe(0x03);
      expect(dataFast[trackOffset + 5]).toBe(0x0d);
      expect(dataFast[trackOffset + 6]).toBe(0x40);
    });

    it("handles multiple notes sorted by tick", () => {
      const notes = [
        { pitch: 60, velocity: 100, start: 2, length: 1 },
        { pitch: 64, velocity: 100, start: 0, length: 1 },
      ];
      const data = createMidiFileData(notes, 120);
      const hex = toHex(data);

      // Note 64 should appear before note 60 in the binary
      const idx64 = hex.indexOf("90 40 64");
      const idx60 = hex.indexOf("90 3c 64");
      expect(idx64).toBeGreaterThan(0);
      expect(idx60).toBeGreaterThan(idx64);
    });

    it("ignores invalid notes array", () => {
      const data = createMidiFileData(null, 120);
      expect(data).toBeInstanceOf(Uint8Array);
      expect(data.length).toBeGreaterThan(0);
    });
  });
});
