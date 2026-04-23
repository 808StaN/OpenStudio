import {
  FX_EFFECT_GRAPHIC_EQ,
  FX_EFFECT_MAXIMIZER,
  FX_EFFECT_REVERB,
  getSafeGraphicEqParams,
  getSafeMaximizerParams,
  getSafeReverbParams,
} from "../domain/fxParams";

/**
 * Resolves enabled insert effects into a compact, sanitized snapshot.
 *
 * This is used by both the real-time scheduler and the offline exporter so
 * that both paths see the same normalized effect state and default values.
 *
 * @param {object} insert – mixer insert descriptor (may contain fxSlots).
 * @returns {{eqEnabled:boolean,eqParams:object,reverbEnabled:boolean,reverbParams:object,maximizerEnabled:boolean,maximizerParams:object}}
 */
export function getActiveFxState(insert) {
  const fxSlots = Array.isArray(insert?.fxSlots) ? insert.fxSlots : [];
  const state = {
    eqEnabled: false,
    eqParams: getSafeGraphicEqParams(null),
    reverbEnabled: false,
    reverbParams: getSafeReverbParams(null),
    maximizerEnabled: false,
    maximizerParams: getSafeMaximizerParams(null),
  };

  fxSlots.forEach(function (slot) {
    if (!slot?.enabled) {
      return;
    }

    const effectType = String(slot.effectType || "none");
    if (effectType === FX_EFFECT_GRAPHIC_EQ) {
      state.eqEnabled = true;
      state.eqParams = getSafeGraphicEqParams(slot.params);
      return;
    }

    if (effectType === FX_EFFECT_REVERB) {
      state.reverbEnabled = true;
      state.reverbParams = getSafeReverbParams(slot.params);
      return;
    }

    if (effectType === FX_EFFECT_MAXIMIZER) {
      state.maximizerEnabled = true;
      state.maximizerParams = getSafeMaximizerParams(slot.params);
    }
  });

  return state;
}
