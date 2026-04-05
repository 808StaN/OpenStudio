export const PLUGIN_EFFECTS = [
  {
    effectType: "graphic-eq",
    name: "Parametric EQ 2",
    description: "7-point draggable parametric equalizer",
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
