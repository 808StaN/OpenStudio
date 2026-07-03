import { describe, it, expect } from "vitest";
import { buildAiProjectSummary } from "./aiProjectSummary";

describe("buildAiProjectSummary", function () {
  it("includes available plugin instruments and effects", function () {
    const summary = buildAiProjectSummary({
      transport: { bpm: 140, mode: "pattern" },
      project: {
        activePatternId: "pat-1",
        activeChannelId: "ch-1",
        patterns: [],
        channels: [],
        playlistTracks: [],
        playlistClips: [],
      },
      mixer: { inserts: [] },
    });

    expect(summary.availableInstruments).toContainEqual(
      expect.objectContaining({
        pluginRef: "openstudio-piano",
        name: "Piano",
      }),
    );
    expect(summary.availableEffects).toContainEqual(
      expect.objectContaining({
        effectType: "reverb",
        name: "Reverb",
      }),
    );
  });
});
