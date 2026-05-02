import { describe, it, expect } from "vitest";
import { projectReducers } from "./project";

function createMinimalState() {
  return {
    project: {
      patterns: [
        {
          id: "pat-1",
          name: "Pattern 1",
          lengthSteps: 16,
          stepGrid: { "ch-1": Array(16).fill(false) },
          pianoPreview: {},
          color: null,
        },
      ],
      activePatternId: "pat-1",
      channels: [{ id: "ch-1", name: "Channel 1" }],
      playlistTracks: [{ id: "tr-1", name: "Track 1" }],
      playlistClips: [],
    },
    transport: { bpm: 140, currentStep16: 0 },
  };
}

describe("projectReducers", () => {
  describe("createPattern", () => {
    it("adds a new pattern and sets it active", () => {
      const state = createMinimalState();
      const beforeCount = state.project.patterns.length;
      projectReducers.createPattern(state, { payload: {} });
      expect(state.project.patterns.length).toBe(beforeCount + 1);
      expect(state.project.activePatternId).not.toBe("pat-1");
    });

    it("uses requested length clamped to [4, 128]", () => {
      const state = createMinimalState();
      projectReducers.createPattern(state, { payload: { lengthSteps: 32 } });
      const newPattern = state.project.patterns[state.project.patterns.length - 1];
      expect(newPattern.lengthSteps).toBe(32);
    });

    it("clamps length below minimum to 4", () => {
      const state = createMinimalState();
      projectReducers.createPattern(state, { payload: { lengthSteps: 2 } });
      const newPattern = state.project.patterns[state.project.patterns.length - 1];
      expect(newPattern.lengthSteps).toBe(4);
    });
  });

  describe("toggleStep", () => {
    it("toggles a step on and off", () => {
      const state = createMinimalState();
      const payload = { patternId: "pat-1", channelId: "ch-1", stepIndex: 3 };

      projectReducers.toggleStep(state, { payload });
      expect(state.project.patterns[0].stepGrid["ch-1"][3]).toBe(true);

      projectReducers.toggleStep(state, { payload });
      expect(state.project.patterns[0].stepGrid["ch-1"][3]).toBe(false);
    });

    it("ignores invalid patternId", () => {
      const state = createMinimalState();
      const original = [...state.project.patterns[0].stepGrid["ch-1"]];
      projectReducers.toggleStep(state, { payload: { patternId: "missing", channelId: "ch-1", stepIndex: 0 } });
      expect(state.project.patterns[0].stepGrid["ch-1"]).toEqual(original);
    });
  });

  describe("addPlaylistPatternClip", () => {
    it("adds a pattern clip to a track", () => {
      const state = createMinimalState();
      projectReducers.addPlaylistPatternClip(state, {
        payload: { patternId: "pat-1", trackId: "tr-1", barStart: 1, barLength: 2 },
      });
      expect(state.project.playlistClips.length).toBe(1);
      expect(state.project.playlistClips[0].clipType).toBe("pattern");
      expect(state.project.playlistClips[0].patternId).toBe("pat-1");
    });

    it("ignores missing track", () => {
      const state = createMinimalState();
      projectReducers.addPlaylistPatternClip(state, {
        payload: { patternId: "pat-1", trackId: "missing", barStart: 1 },
      });
      expect(state.project.playlistClips.length).toBe(0);
    });

    it("ignores missing pattern", () => {
      const state = createMinimalState();
      projectReducers.addPlaylistPatternClip(state, {
        payload: { patternId: "missing", trackId: "tr-1", barStart: 1 },
      });
      expect(state.project.playlistClips.length).toBe(0);
    });
  });

  describe("setPatternLength", () => {
    it("extends step grid when length increases", () => {
      const state = createMinimalState();
      projectReducers.setPatternLength(state, { payload: { patternId: "pat-1", length: 32 } });
      expect(state.project.patterns[0].lengthSteps).toBe(32);
      expect(state.project.patterns[0].stepGrid["ch-1"].length).toBe(32);
    });

    it("truncates step grid when length decreases", () => {
      const state = createMinimalState();
      projectReducers.setPatternLength(state, { payload: { patternId: "pat-1", length: 8 } });
      expect(state.project.patterns[0].lengthSteps).toBe(8);
      expect(state.project.patterns[0].stepGrid["ch-1"].length).toBe(8);
    });
  });

  describe("renamePattern", () => {
    it("renames an existing pattern", () => {
      const state = createMinimalState();
      projectReducers.renamePattern(state, { payload: { patternId: "pat-1", name: "Kick Pattern" } });
      expect(state.project.patterns[0].name).toBe("Kick Pattern");
    });

    it("ignores empty names", () => {
      const state = createMinimalState();
      projectReducers.renamePattern(state, { payload: { patternId: "pat-1", name: "   " } });
      expect(state.project.patterns[0].name).toBe("Pattern 1");
    });
  });

  describe("setActivePattern", () => {
    it("switches active pattern when it exists", () => {
      const state = createMinimalState();
      state.project.patterns.push({
        id: "pat-2",
        name: "Pattern 2",
        lengthSteps: 16,
        stepGrid: {},
        pianoPreview: {},
        color: null,
      });
      projectReducers.setActivePattern(state, { payload: "pat-2" });
      expect(state.project.activePatternId).toBe("pat-2");
    });

    it("ignores non-existent patternId", () => {
      const state = createMinimalState();
      projectReducers.setActivePattern(state, { payload: "missing" });
      expect(state.project.activePatternId).toBe("pat-1");
    });
  });
});
