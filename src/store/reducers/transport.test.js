import { describe, it, expect } from "vitest";
import { transportReducers } from "./transport";

function createTransportState() {
  return {
    transport: {
      bpm: 140,
      isPlaying: false,
      isRecording: false,
      mode: "pattern",
      songLoopEnabled: false,
      currentStep16: 0,
    },
  };
}

describe("transportReducers", () => {
  describe("setBpm", () => {
    it("updates bpm within range", () => {
      const state = createTransportState();
      transportReducers.setBpm(state, { payload: 128 });
      expect(state.transport.bpm).toBe(128);
    });

    it("clamps bpm to minimum 40", () => {
      const state = createTransportState();
      transportReducers.setBpm(state, { payload: 20 });
      expect(state.transport.bpm).toBe(40);
    });

    it("clamps bpm to maximum 300", () => {
      const state = createTransportState();
      transportReducers.setBpm(state, { payload: 400 });
      expect(state.transport.bpm).toBe(300);
    });

    it("rounds fractional bpm", () => {
      const state = createTransportState();
      transportReducers.setBpm(state, { payload: 140.7 });
      expect(state.transport.bpm).toBe(141);
    });
  });

  describe("setPlaying", () => {
    it("sets playing to true", () => {
      const state = createTransportState();
      transportReducers.setPlaying(state, { payload: true });
      expect(state.transport.isPlaying).toBe(true);
    });

    it("resets currentStep16 when stopping", () => {
      const state = createTransportState();
      state.transport.currentStep16 = 8;
      transportReducers.setPlaying(state, { payload: false });
      expect(state.transport.isPlaying).toBe(false);
      expect(state.transport.currentStep16).toBe(0);
    });
  });

  describe("setRecording", () => {
    it("toggles recording state", () => {
      const state = createTransportState();
      transportReducers.setRecording(state, { payload: true });
      expect(state.transport.isRecording).toBe(true);
    });
  });

  describe("setTransportMode", () => {
    it("changes mode to song", () => {
      const state = createTransportState();
      transportReducers.setTransportMode(state, { payload: "song" });
      expect(state.transport.mode).toBe("song");
    });
  });

  describe("setSongLoopEnabled", () => {
    it("enables loop", () => {
      const state = createTransportState();
      transportReducers.setSongLoopEnabled(state, { payload: 1 });
      expect(state.transport.songLoopEnabled).toBe(true);
    });

    it("disables loop with falsy value", () => {
      const state = createTransportState();
      transportReducers.setSongLoopEnabled(state, { payload: false });
      expect(state.transport.songLoopEnabled).toBe(false);
    });
  });

  describe("setPlayheadStep", () => {
    it("sets step to requested value", () => {
      const state = createTransportState();
      transportReducers.setPlayheadStep(state, { payload: 16 });
      expect(state.transport.currentStep16).toBe(16);
    });

    it("clamps negative step to 0", () => {
      const state = createTransportState();
      transportReducers.setPlayheadStep(state, { payload: -5 });
      expect(state.transport.currentStep16).toBe(0);
    });

    it("rounds fractional steps", () => {
      const state = createTransportState();
      transportReducers.setPlayheadStep(state, { payload: 7.8 });
      expect(state.transport.currentStep16).toBe(8);
    });
  });
});
