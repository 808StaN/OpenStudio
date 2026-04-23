// ------------------------------------------------------------------
// Mixer reducers — insert routing, faders, pan, and FX slot params.
// Every insert carries 10 FX slots; we normalize them on demand so
// legacy projects (or partial state patches) never crash the audio graph.
// ------------------------------------------------------------------

import {
  FX_SLOT_EFFECT_GRAPHIC_EQ,
  FX_SLOT_EFFECT_MAXIMIZER,
  FX_SLOT_EFFECT_NONE,
  FX_SLOT_EFFECT_REVERB,
  GRAPHIC_EQ_DEFAULT_POINT_FREQUENCIES,
} from "../constants";
import {
  clampEqBandGainDb,
  clampEqFrequencyHz,
  clampEqQ,
  clampMaximizerCeilingDb,
  clampMaximizerCharacter,
  clampMaximizerThresholdDb,
  clampReverb01,
  clampReverbInRange,
  ensureInsertFxSlots,
  getFxSlotDefaultName,
  getSafeGraphicEqParams,
  getSafeMaximizerParams,
  getSafeReverbParams,
  isObjectLike,
  makeInsertSpectrum,
  makeInsertWaveform,
  makeMaximizerStereoMeter,
  sanitizeEqBandType,
  sanitizeMaximizerMode,
} from "../utils";

export const mixerReducers = {
  selectInsert(state, action) {
    state.mixer.selectedInsertId = action.payload;
  },

  addMixerTrack(state) {
    const nextInsertNumber =
      state.mixer.inserts.reduce(function (maxValue, insert) {
        const match = String(insert.id || "").match(/insert-(\d+)/i);
        if (!match) {
          return maxValue;
        }
        return Math.max(maxValue, Number(match[1] || 0));
      }, 0) + 1;

    const newInsertId = "insert-" + nextInsertNumber;

    state.mixer.inserts.push({
      id: newInsertId,
      name: "Insert " + nextInsertNumber,
      isMaster: false,
      active: true,
      pan: 0,
      stereoSeparation: 0,
      fader: 1,
      meter: 0,
      meterSpectrum: makeInsertSpectrum(),
      meterWaveform: makeInsertWaveform(),
      maximizerReduction: 0,
      maximizerOutputDb: -96,
      maximizerStereoMeter: makeMaximizerStereoMeter(),
      routesTo: ["master"],
      fxSlots: [
        // Create 10 empty slots inline so we don't need to import makeFxSlots here.
        { id: "slot-1", name: "Slot 1", enabled: false, effectType: FX_SLOT_EFFECT_NONE, params: null },
        { id: "slot-2", name: "Slot 2", enabled: false, effectType: FX_SLOT_EFFECT_NONE, params: null },
        { id: "slot-3", name: "Slot 3", enabled: false, effectType: FX_SLOT_EFFECT_NONE, params: null },
        { id: "slot-4", name: "Slot 4", enabled: false, effectType: FX_SLOT_EFFECT_NONE, params: null },
        { id: "slot-5", name: "Slot 5", enabled: false, effectType: FX_SLOT_EFFECT_NONE, params: null },
        { id: "slot-6", name: "Slot 6", enabled: false, effectType: FX_SLOT_EFFECT_NONE, params: null },
        { id: "slot-7", name: "Slot 7", enabled: false, effectType: FX_SLOT_EFFECT_NONE, params: null },
        { id: "slot-8", name: "Slot 8", enabled: false, effectType: FX_SLOT_EFFECT_NONE, params: null },
        { id: "slot-9", name: "Slot 9", enabled: false, effectType: FX_SLOT_EFFECT_NONE, params: null },
        { id: "slot-10", name: "Slot 10", enabled: false, effectType: FX_SLOT_EFFECT_NONE, params: null },
      ],
    });

    state.mixer.selectedInsertId = newInsertId;
  },

  setInsertActive(state, action) {
    const insert = state.mixer.inserts.find(function (item) {
      return item.id === action.payload.insertId;
    });
    if (!insert) {
      return;
    }
    insert.active = action.payload.value;
  },

  setInsertPan(state, action) {
    const insert = state.mixer.inserts.find(function (item) {
      return item.id === action.payload.insertId;
    });
    if (!insert) {
      return;
    }
    insert.pan = Math.max(-1, Math.min(1, action.payload.value));
  },

  setInsertStereo(state, action) {
    const insert = state.mixer.inserts.find(function (item) {
      return item.id === action.payload.insertId;
    });
    if (!insert) {
      return;
    }
    insert.stereoSeparation = Math.max(-1, Math.min(1, action.payload.value));
  },

  setInsertFader(state, action) {
    const insert = state.mixer.inserts.find(function (item) {
      return item.id === action.payload.insertId;
    });
    if (!insert) {
      return;
    }
    insert.fader = Math.max(0, Math.min(1.25, action.payload.value));
  },

  toggleFxSlot(state, action) {
    const insert = state.mixer.inserts.find(function (item) {
      return item.id === action.payload.insertId;
    });
    if (!insert) {
      return;
    }

    ensureInsertFxSlots(insert);

    const slot = insert.fxSlots.find(function (item) {
      return item.id === action.payload.slotId;
    });
    if (!slot) {
      return;
    }

    if (slot.effectType === FX_SLOT_EFFECT_NONE) {
      slot.enabled = false;
      return;
    }

    slot.enabled = !slot.enabled;
  },

  setFxSlotEffectType(state, action) {
    const insert = state.mixer.inserts.find(function (item) {
      return item.id === action.payload.insertId;
    });
    if (!insert) {
      return;
    }

    ensureInsertFxSlots(insert);

    const slotIndex = insert.fxSlots.findIndex(function (item) {
      return item.id === action.payload.slotId;
    });
    if (slotIndex < 0) {
      return;
    }

    const slot = insert.fxSlots[slotIndex];
    const requestedType = String(action.payload.effectType || "")
      .trim()
      .toLowerCase();

    if (requestedType === FX_SLOT_EFFECT_GRAPHIC_EQ) {
      slot.effectType = FX_SLOT_EFFECT_GRAPHIC_EQ;
      slot.name = "Graphic EQ";
      slot.params = getSafeGraphicEqParams(slot.params);
      return;
    }

    if (requestedType === FX_SLOT_EFFECT_REVERB) {
      slot.effectType = FX_SLOT_EFFECT_REVERB;
      slot.name = "Reverb";
      slot.params = getSafeReverbParams(slot.params);
      return;
    }

    if (requestedType === FX_SLOT_EFFECT_MAXIMIZER) {
      slot.effectType = FX_SLOT_EFFECT_MAXIMIZER;
      slot.name = "Limiter";
      slot.params = getSafeMaximizerParams(slot.params);
      return;
    }

    slot.effectType = FX_SLOT_EFFECT_NONE;
    slot.enabled = false;
    slot.name = getFxSlotDefaultName(slotIndex);
    slot.params = null;
  },

  setFxSlotGraphicEqBandGain(state, action) {
    const insert = state.mixer.inserts.find(function (item) {
      return item.id === action.payload.insertId;
    });
    if (!insert) {
      return;
    }

    ensureInsertFxSlots(insert);

    const slot = insert.fxSlots.find(function (item) {
      return item.id === action.payload.slotId;
    });
    if (!slot || slot.effectType !== FX_SLOT_EFFECT_GRAPHIC_EQ) {
      return;
    }

    slot.params = getSafeGraphicEqParams(slot.params);
    const bandIndex = Math.max(
      0,
      Math.min(
        GRAPHIC_EQ_DEFAULT_POINT_FREQUENCIES.length - 1,
        Number(action.payload.bandIndex || 0),
      ),
    );
    slot.params.points[bandIndex].gainDb = clampEqBandGainDb(
      action.payload.gainDb,
    );
  },

  setFxSlotGraphicEqLowCut(state, action) {
    const insert = state.mixer.inserts.find(function (item) {
      return item.id === action.payload.insertId;
    });
    if (!insert) {
      return;
    }

    ensureInsertFxSlots(insert);

    const slot = insert.fxSlots.find(function (item) {
      return item.id === action.payload.slotId;
    });
    if (!slot || slot.effectType !== FX_SLOT_EFFECT_GRAPHIC_EQ) {
      return;
    }

    slot.params = getSafeGraphicEqParams(slot.params);
    const pointIndex = 0;
    slot.params.points[pointIndex].frequencyHz = clampEqFrequencyHz(
      action.payload.frequencyHz,
    );
  },

  setFxSlotGraphicEqPoint(state, action) {
    const insert = state.mixer.inserts.find(function (item) {
      return item.id === action.payload.insertId;
    });
    if (!insert) {
      return;
    }

    ensureInsertFxSlots(insert);

    const slot = insert.fxSlots.find(function (item) {
      return item.id === action.payload.slotId;
    });
    if (!slot || slot.effectType !== FX_SLOT_EFFECT_GRAPHIC_EQ) {
      return;
    }

    slot.params = getSafeGraphicEqParams(slot.params);

    const pointIndex = Math.max(
      0,
      Math.min(
        GRAPHIC_EQ_DEFAULT_POINT_FREQUENCIES.length - 1,
        Number(action.payload.pointIndex || 0),
      ),
    );

    const point = slot.params.points[pointIndex];
    point.frequencyHz = clampEqFrequencyHz(
      action.payload.frequencyHz ?? point.frequencyHz,
    );
    point.gainDb = clampEqBandGainDb(action.payload.gainDb ?? point.gainDb);
    point.q = clampEqQ(action.payload.q ?? point.q);

    if (Object.hasOwn(action.payload, "bandType")) {
      point.bandType = sanitizeEqBandType(
        action.payload.bandType,
        point.bandType,
      );
    }
  },

  setFxSlotReverbParam(state, action) {
    const insert = state.mixer.inserts.find(function (item) {
      return item.id === action.payload.insertId;
    });
    if (!insert) {
      return;
    }

    ensureInsertFxSlots(insert);

    const slot = insert.fxSlots.find(function (item) {
      return item.id === action.payload.slotId;
    });
    if (!slot || slot.effectType !== FX_SLOT_EFFECT_REVERB) {
      return;
    }

    slot.params = getSafeReverbParams(slot.params);

    const param = String(action.payload.param || "").trim();
    const value = action.payload.value;

    if (param === "freeze") {
      slot.params.freeze = Boolean(value);
      return;
    }

    if (param === "decayTime") {
      slot.params.decayTime = clampReverbInRange(value, 0.2, 20, 2.8);
      return;
    }

    if (param === "preDelayMs") {
      slot.params.preDelayMs = clampReverbInRange(value, 0, 250, 24);
      return;
    }

    if (param === "hiCutHz") {
      slot.params.hiCutHz = clampReverbInRange(value, 1200, 18000, 9000);
      return;
    }

    if (param === "loCutHz") {
      slot.params.loCutHz = clampReverbInRange(value, 20, 1200, 130);
      return;
    }

    if (param === "modulationRateHz") {
      slot.params.modulationRateHz = clampReverbInRange(value, 0, 8, 0.35);
      return;
    }

    if (
      param === "size" ||
      param === "damping" ||
      param === "earlyReflections" ||
      param === "diffusion" ||
      param === "modulationDepth" ||
      param === "width" ||
      param === "dryWet"
    ) {
      slot.params[param] = clampReverb01(value, slot.params[param]);
    }
  },

  setFxSlotMaximizerParam(state, action) {
    const insert = state.mixer.inserts.find(function (item) {
      return item.id === action.payload.insertId;
    });
    if (!insert) {
      return;
    }

    ensureInsertFxSlots(insert);

    const slot = insert.fxSlots.find(function (item) {
      return item.id === action.payload.slotId;
    });
    if (!slot || slot.effectType !== FX_SLOT_EFFECT_MAXIMIZER) {
      return;
    }

    slot.params = getSafeMaximizerParams(slot.params);

    const param = String(action.payload.param || "").trim();
    const value = action.payload.value;

    if (param === "mode") {
      slot.params.mode = sanitizeMaximizerMode(value);
      return;
    }

    if (param === "truePeakEnabled") {
      slot.params.truePeakEnabled = Boolean(value);
      return;
    }

    if (param === "thresholdDb") {
      slot.params.thresholdDb = clampMaximizerThresholdDb(value);
      return;
    }

    if (param === "ceilingDb") {
      slot.params.ceilingDb = clampMaximizerCeilingDb(value);
      return;
    }

    if (param === "character") {
      slot.params.character = clampMaximizerCharacter(value);
    }
  },

  setInsertMeter(state, action) {
    const insert = state.mixer.inserts.find(function (item) {
      return item.id === action.payload.insertId;
    });
    if (!insert) {
      return;
    }
    insert.meter = Math.max(0, Math.min(1, action.payload.meter));

    if (Array.isArray(action.payload.spectrum)) {
      const nextSpectrum = action.payload.spectrum
        .slice(0, 256)
        .map(function (value) {
          const numeric = Number(value || 0);
          return Math.max(0, Math.min(1, numeric));
        });

      if (nextSpectrum.length > 0) {
        insert.meterSpectrum = nextSpectrum;
      }
    } else if (!Array.isArray(insert.meterSpectrum)) {
      insert.meterSpectrum = makeInsertSpectrum();
    }

    if (Array.isArray(action.payload.waveform)) {
      const nextWaveform = action.payload.waveform
        .slice(0, 220)
        .map(function (value) {
          const numeric = Number(value || 0);
          return Math.max(-1, Math.min(1, numeric));
        });

      if (nextWaveform.length > 0) {
        insert.meterWaveform = nextWaveform;
      }
    } else if (!Array.isArray(insert.meterWaveform)) {
      insert.meterWaveform = makeInsertWaveform();
    }

    if (Object.hasOwn(action.payload, "maximizerReduction")) {
      const numericReduction = Number(action.payload.maximizerReduction || 0);
      insert.maximizerReduction = Math.max(0, Math.min(36, numericReduction));
    } else if (!Number.isFinite(Number(insert.maximizerReduction))) {
      insert.maximizerReduction = 0;
    }

    if (Object.hasOwn(action.payload, "maximizerOutputDb")) {
      const numericOutput = Number(action.payload.maximizerOutputDb ?? -96);
      insert.maximizerOutputDb = Math.max(-96, Math.min(6, numericOutput));
    } else if (!Number.isFinite(Number(insert.maximizerOutputDb))) {
      insert.maximizerOutputDb = -96;
    }

    if (isObjectLike(action.payload.maximizerStereoMeter)) {
      const meter = action.payload.maximizerStereoMeter;
      insert.maximizerStereoMeter = {
        leftVolumeDb: Math.max(
          -96,
          Math.min(6, Number(meter.leftVolumeDb ?? -96)),
        ),
        leftReductionDb: Math.max(
          0,
          Math.min(36, Number(meter.leftReductionDb ?? 0)),
        ),
        rightReductionDb: Math.max(
          0,
          Math.min(36, Number(meter.rightReductionDb ?? 0)),
        ),
        rightVolumeDb: Math.max(
          -96,
          Math.min(6, Number(meter.rightVolumeDb ?? -96)),
        ),
      };
    } else if (!isObjectLike(insert.maximizerStereoMeter)) {
      insert.maximizerStereoMeter = makeMaximizerStereoMeter();
    }
  },
};
