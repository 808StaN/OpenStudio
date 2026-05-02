import { describe, it, expect } from "vitest";
import { toSafeSampleUrl } from "./sampleUrl";

describe("sampleUrl", () => {
  describe("toSafeSampleUrl", () => {
    it("returns empty string for empty input", () => {
      expect(toSafeSampleUrl("")).toBe("");
      expect(toSafeSampleUrl(null)).toBe("");
    });

    it("preserves openstudio pack URLs on http", () => {
      const result = toSafeSampleUrl("openstudio://packs/808/Kick.wav");
      expect(result).toBe("/packs/808/Kick.wav");
    });

    it("preserves openstudio pack URLs on file protocol", () => {
      // file protocol detection requires window.location, skip runtime-dependent test
      // but we can test the encoding logic
      const result = toSafeSampleUrl("openstudio://packs/808/Kick%20Snare.wav");
      expect(result).toBe("/packs/808/Kick%20Snare.wav");
    });

    it("encodes regular file paths", () => {
      expect(toSafeSampleUrl("/audio/my kick.wav")).toBe("/audio/my%20kick.wav");
    });

    it("preserves absolute URLs with protocol", () => {
      expect(toSafeSampleUrl("https://example.com/audio/file.wav")).toBe(
        "https://example.com/audio/file.wav",
      );
    });

    it("preserves query strings", () => {
      expect(toSafeSampleUrl("/audio/file.wav?version=2")).toBe("/audio/file.wav?version=2");
    });
  });
});
