import { describe, it, expect } from "vitest";
import { getActiveFxState } from "./getActiveFxState";
import {
  FX_EFFECT_GRAPHIC_EQ,
  FX_EFFECT_MAXIMIZER,
  FX_EFFECT_REVERB,
} from "../domain/fxParams";

describe("getActiveFxState", () => {
  it("returns disabled defaults for missing inserts", () => {
    const state = getActiveFxState(null);
    expect(state.eqEnabled).toBe(false);
    expect(state.reverbEnabled).toBe(false);
    expect(state.maximizerEnabled).toBe(false);
    expect(state.eqParams.points).toHaveLength(7);
  });

  it("ignores disabled slots", () => {
    const state = getActiveFxState({
      fxSlots: [
        {
          enabled: false,
          effectType: FX_EFFECT_REVERB,
          params: { dryWet: 1 },
        },
      ],
    });

    expect(state.reverbEnabled).toBe(false);
    expect(state.reverbParams.dryWet).toBeCloseTo(0.34, 5);
  });

  it("enables and sanitizes supported effect slots", () => {
    const state = getActiveFxState({
      fxSlots: [
        {
          enabled: true,
          effectType: FX_EFFECT_GRAPHIC_EQ,
          params: { points: [{ frequencyHz: 5, gainDb: 999, q: 99 }] },
        },
        {
          enabled: true,
          effectType: FX_EFFECT_REVERB,
          params: { dryWet: 4, decayTime: 50 },
        },
        {
          enabled: true,
          effectType: FX_EFFECT_MAXIMIZER,
          params: { thresholdDb: -99, ceilingDb: 5, character: 3 },
        },
      ],
    });

    expect(state.eqEnabled).toBe(true);
    expect(state.eqParams.points[0].frequencyHz).toBe(20);
    expect(state.eqParams.points[0].gainDb).toBe(18);
    expect(state.eqParams.points[0].q).toBe(8);
    expect(state.reverbEnabled).toBe(true);
    expect(state.reverbParams.dryWet).toBe(1);
    expect(state.reverbParams.decayTime).toBe(20);
    expect(state.maximizerEnabled).toBe(true);
    expect(state.maximizerParams.thresholdDb).toBe(-24);
    expect(state.maximizerParams.ceilingDb).toBe(0);
    expect(state.maximizerParams.character).toBe(1);
  });
});
