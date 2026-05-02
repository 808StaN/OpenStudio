import { describe, it, expect } from "vitest";
import { mixerReducers } from "./mixer";

function createMixerState(inserts = []) {
  return {
    mixer: {
      inserts,
      selectedInsertId: inserts[0]?.id || null,
    },
  };
}

function makeInsert(id) {
  return {
    id,
    name: "Insert " + id,
    isMaster: false,
    active: true,
    pan: 0,
    stereoSeparation: 0,
    fader: 1,
    meter: 0,
    meterSpectrum: [],
    meterWaveform: [],
    maximizerReduction: 0,
    maximizerOutputDb: -96,
    maximizerStereoMeter: {},
    routesTo: ["master"],
    fxSlots: Array.from({ length: 10 }, (_, i) => ({
      id: `slot-${i + 1}`,
      name: `Slot ${i + 1}`,
      enabled: false,
      effectType: "none",
      params: null,
    })),
  };
}

describe("mixerReducers", () => {
  describe("selectInsert", () => {
    it("sets selected insert", () => {
      const state = createMixerState([makeInsert("insert-1")]);
      mixerReducers.selectInsert(state, { payload: "insert-1" });
      expect(state.mixer.selectedInsertId).toBe("insert-1");
    });
  });

  describe("addMixerTrack", () => {
    it("adds a new insert with incremented number", () => {
      const state = createMixerState([makeInsert("insert-1")]);
      mixerReducers.addMixerTrack(state);
      expect(state.mixer.inserts.length).toBe(2);
      expect(state.mixer.inserts[1].id).toBe("insert-2");
      expect(state.mixer.inserts[1].fxSlots.length).toBe(10);
      expect(state.mixer.selectedInsertId).toBe("insert-2");
    });

    it("creates insert-1 when list is empty", () => {
      const state = createMixerState([]);
      mixerReducers.addMixerTrack(state);
      expect(state.mixer.inserts[0].id).toBe("insert-1");
    });
  });

  describe("setInsertActive", () => {
    it("toggles insert active state", () => {
      const state = createMixerState([makeInsert("insert-1")]);
      mixerReducers.setInsertActive(state, { payload: { insertId: "insert-1", value: false } });
      expect(state.mixer.inserts[0].active).toBe(false);
    });

    it("ignores missing insert", () => {
      const state = createMixerState([makeInsert("insert-1")]);
      mixerReducers.setInsertActive(state, { payload: { insertId: "missing", value: false } });
      expect(state.mixer.inserts[0].active).toBe(true);
    });
  });

  describe("setInsertPan", () => {
    it("sets pan within [-1, 1]", () => {
      const state = createMixerState([makeInsert("insert-1")]);
      mixerReducers.setInsertPan(state, { payload: { insertId: "insert-1", value: 0.5 } });
      expect(state.mixer.inserts[0].pan).toBe(0.5);
    });

    it("clamps pan to [-1, 1]", () => {
      const state = createMixerState([makeInsert("insert-1")]);
      mixerReducers.setInsertPan(state, { payload: { insertId: "insert-1", value: 2 } });
      expect(state.mixer.inserts[0].pan).toBe(1);
    });
  });

  describe("setInsertStereo", () => {
    it("sets stereo separation", () => {
      const state = createMixerState([makeInsert("insert-1")]);
      mixerReducers.setInsertStereo(state, { payload: { insertId: "insert-1", value: -0.5 } });
      expect(state.mixer.inserts[0].stereoSeparation).toBe(-0.5);
    });
  });

  describe("setInsertFader", () => {
    it("sets fader within [0, 1.25]", () => {
      const state = createMixerState([makeInsert("insert-1")]);
      mixerReducers.setInsertFader(state, { payload: { insertId: "insert-1", value: 0.8 } });
      expect(state.mixer.inserts[0].fader).toBe(0.8);
    });

    it("clamps fader to max 1.25", () => {
      const state = createMixerState([makeInsert("insert-1")]);
      mixerReducers.setInsertFader(state, { payload: { insertId: "insert-1", value: 2 } });
      expect(state.mixer.inserts[0].fader).toBe(1.25);
    });
  });

  describe("toggleFxSlot", () => {
    it("does nothing for empty slot", () => {
      const state = createMixerState([makeInsert("insert-1")]);
      mixerReducers.toggleFxSlot(state, { payload: { insertId: "insert-1", slotId: "slot-1" } });
      expect(state.mixer.inserts[0].fxSlots[0].enabled).toBe(false);
    });

    it("toggles enabled for loaded effect", () => {
      const state = createMixerState([makeInsert("insert-1")]);
      state.mixer.inserts[0].fxSlots[0].effectType = "graphic-eq";
      mixerReducers.toggleFxSlot(state, { payload: { insertId: "insert-1", slotId: "slot-1" } });
      expect(state.mixer.inserts[0].fxSlots[0].enabled).toBe(true);
      mixerReducers.toggleFxSlot(state, { payload: { insertId: "insert-1", slotId: "slot-1" } });
      expect(state.mixer.inserts[0].fxSlots[0].enabled).toBe(false);
    });
  });

  describe("setFxSlotEffectType", () => {
    it("sets effect type and name for Graphic EQ", () => {
      const state = createMixerState([makeInsert("insert-1")]);
      mixerReducers.setFxSlotEffectType(state, {
        payload: { insertId: "insert-1", slotId: "slot-1", effectType: "graphic-eq" },
      });
      expect(state.mixer.inserts[0].fxSlots[0].effectType).toBe("graphic-eq");
      expect(state.mixer.inserts[0].fxSlots[0].name).toBe("Graphic EQ");
    });

    it("clears effect when type is none", () => {
      const state = createMixerState([makeInsert("insert-1")]);
      state.mixer.inserts[0].fxSlots[0].effectType = "reverb";
      mixerReducers.setFxSlotEffectType(state, {
        payload: { insertId: "insert-1", slotId: "slot-1", effectType: "none" },
      });
      expect(state.mixer.inserts[0].fxSlots[0].effectType).toBe("none");
      expect(state.mixer.inserts[0].fxSlots[0].enabled).toBe(false);
    });
  });

  describe("setInsertMeter", () => {
    it("sets meter value clamped to [0, 1]", () => {
      const state = createMixerState([makeInsert("insert-1")]);
      mixerReducers.setInsertMeter(state, { payload: { insertId: "insert-1", meter: 1.5 } });
      expect(state.mixer.inserts[0].meter).toBe(1);
    });

    it("updates spectrum and waveform arrays", () => {
      const state = createMixerState([makeInsert("insert-1")]);
      mixerReducers.setInsertMeter(state, {
        payload: { insertId: "insert-1", meter: 0.5, spectrum: [0.2, 1.5], waveform: [-1.2, 0.8] },
      });
      expect(state.mixer.inserts[0].meterSpectrum).toEqual([0.2, 1]);
      expect(state.mixer.inserts[0].meterWaveform).toEqual([-1, 0.8]);
    });

    it("clamps maximizerReduction", () => {
      const state = createMixerState([makeInsert("insert-1")]);
      mixerReducers.setInsertMeter(state, {
        payload: { insertId: "insert-1", meter: 0, maximizerReduction: 50 },
      });
      expect(state.mixer.inserts[0].maximizerReduction).toBe(36);
    });
  });
});
