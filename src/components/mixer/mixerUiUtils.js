// Supported built-in FX plugin identifiers.
export const FX_EFFECT_GRAPHIC_EQ = "graphic-eq";
export const FX_EFFECT_REVERB = "reverb";
export const FX_EFFECT_MAXIMIZER = "maximizer";
export const FX_EFFECT_NONE = "none";

// Restricts drag/drop + power toggle flows to effects with editor support.
export function isSupportedEffectType(effectType) {
  return (
    effectType === FX_EFFECT_GRAPHIC_EQ ||
    effectType === FX_EFFECT_REVERB ||
    effectType === FX_EFFECT_MAXIMIZER
  );
}

// Maps internal effect type to user-facing row name.
export function getFxSlotName(slot, fallbackIndex) {
  if (slot?.effectType === FX_EFFECT_GRAPHIC_EQ) {
    return "Graphic EQ";
  }
  if (slot?.effectType === FX_EFFECT_REVERB) {
    return "Reverb";
  }
  if (slot?.effectType === FX_EFFECT_MAXIMIZER) {
    return "Limiter";
  }
  return String(slot?.name || "").trim() || "Slot " + (fallbackIndex + 1);
}

// Builds a stable insert label for readouts and UI.
export function getInsertLabel(insert) {
  if (insert.isMaster) {
    return insert.name || "Master";
  }

  const sourceName = String(insert.name || "");
  const renamed = sourceName.replace(/^insert\b/i, "Insert");
  if (renamed && renamed !== sourceName) {
    return renamed;
  }

  const numericSuffix = String(insert.id || "").match(/insert-(\d+)/i)?.[1];
  if (numericSuffix) {
    return "Insert " + numericSuffix;
  }

  return sourceName || "Insert";
}

// Human-readable percent format used in mixer readout HUD.
export function formatPercentValue(value) {
  return Math.round(value * 100) + "%";
}

// Signed percent format used for pan/stereo controls.
export function formatSignedPercentValue(value) {
  const intValue = Math.round(value * 100);
  if (intValue > 0) {
    return "+" + intValue + "%";
  }
  return intValue + "%";
}
