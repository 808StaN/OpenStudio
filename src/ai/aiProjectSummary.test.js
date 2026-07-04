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

  it("includes notes and steps for the active pattern", function () {
    const summary = buildAiProjectSummary({
      transport: { bpm: 140, mode: "pattern" },
      project: {
        activePatternId: "pat-1",
        activeChannelId: "ch-1",
        patterns: [
          {
            id: "pat-1",
            name: "Pattern 1",
            lengthSteps: 16,
            pianoPreview: {
              "ch-1": [
                { id: "n-1", start: 0, length: 4, pitch: 60, velocity: 95 },
                { id: "n-2", start: 4, length: 4, pitch: 64, velocity: 100 },
              ],
            },
            stepGrid: {
              "ch-1": [true, false, false, false],
            },
          },
        ],
        channels: [{ id: "ch-1", name: "Piano" }],
        playlistTracks: [],
        playlistClips: [],
      },
      mixer: { inserts: [] },
    });

    expect(summary.patterns[0].notes).toEqual({
      "ch-1": [
        { start: 0, length: 4, pitch: 60, velocity: 95 },
        { start: 4, length: 4, pitch: 64, velocity: 100 },
      ],
    });
    expect(summary.patterns[0].steps).toEqual({
      "ch-1": [true, false, false, false],
    });
    expect(summary.patterns[0].noteCount).toBeNull();
  });

  it("sends only noteCount for inactive patterns", function () {
    const summary = buildAiProjectSummary({
      transport: { bpm: 140, mode: "pattern" },
      project: {
        activePatternId: "pat-1",
        activeChannelId: "ch-1",
        patterns: [
          {
            id: "pat-1",
            name: "Active",
            lengthSteps: 16,
            pianoPreview: {},
            stepGrid: {},
          },
          {
            id: "pat-2",
            name: "Inactive",
            lengthSteps: 32,
            pianoPreview: {
              "ch-1": [
                { id: "n-1", start: 0, length: 4, pitch: 60, velocity: 95 },
              ],
            },
            stepGrid: { "ch-1": [true] },
          },
        ],
        channels: [{ id: "ch-1", name: "Piano" }],
        playlistTracks: [],
        playlistClips: [],
      },
      mixer: { inserts: [] },
    });

    const activePattern = summary.patterns.find(function (p) {
      return p.id === "pat-1";
    });
    const inactivePattern = summary.patterns.find(function (p) {
      return p.id === "pat-2";
    });

    expect(activePattern.notes).toEqual({});
    expect(activePattern.steps).toEqual({});
    expect(activePattern.noteCount).toBeNull();

    expect(inactivePattern.notes).toBeNull();
    expect(inactivePattern.steps).toBeNull();
    expect(inactivePattern.noteCount).toBe(1);
  });
});
