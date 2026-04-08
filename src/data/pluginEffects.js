export const PLUGIN_EFFECTS = [
  {
    effectType: "graphic-eq",
    name: "Graphic EQ",
    description: "7-point draggable parametric equalizer",
  },
  {
    effectType: "reverb",
    name: "Reverb",
    description: "Algorithmic stereo reverb with freeze and modulation",
  },
  {
    effectType: "maximizer",
    name: "Limiter",
    description: "Mastering limiter with threshold, ceiling and character",
  },
];

const effectByType = PLUGIN_EFFECTS.reduce(function (acc, effect) {
  acc[effect.effectType] = effect;
  return acc;
}, {});

export function getPluginEffect(effectType) {
  const key = String(effectType || "").trim();
  return effectByType[key] || null;
}
