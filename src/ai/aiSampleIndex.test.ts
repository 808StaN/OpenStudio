import { describe, it, expect } from "vitest";
import { searchAiSamples } from "./aiSampleIndex";

describe("searchAiSamples", function () {
  it("prioritizes samples matching the user prompt", function () {
    const samples = [
      { name: "Soft Piano.wav", folder: "Keys", path: "/packs/keys/piano.wav" },
      { name: "Trap Kick.wav", folder: "Drums", path: "/packs/drums/kick.wav" },
      { name: "Open Hat.wav", folder: "Drums", path: "/packs/drums/hat.wav" },
    ];

    const result = searchAiSamples(samples, "make a trap kick pattern", 2);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Trap Kick.wav");
  });
});
