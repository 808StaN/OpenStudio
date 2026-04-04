export const PLUGIN_INSTRUMENTS = [
  {
    pluginRef: "openstudio-piano",
    name: "Piano",
    soundfont: "acoustic_grand_piano",
    description: "Grand piano",
  },
  {
    pluginRef: "openstudio-epiano",
    name: "E-Piano",
    soundfont: "electric_piano_1",
    description: "Electric piano",
  },
  {
    pluginRef: "openstudio-organ",
    name: "Organ",
    soundfont: "drawbar_organ",
    description: "Drawbar organ",
  },
  {
    pluginRef: "openstudio-bass",
    name: "Synth Bass",
    soundfont: "synth_bass_1",
    description: "Synth bass",
  },
  {
    pluginRef: "openstudio-strings",
    name: "Strings",
    soundfont: "string_ensemble_1",
    description: "String ensemble",
  },
  {
    pluginRef: "openstudio-flute",
    name: "Flute",
    soundfont: "flute",
    description: "Concert flute",
  },
];

const pluginByRef = PLUGIN_INSTRUMENTS.reduce(function (acc, instrument) {
  acc[instrument.pluginRef] = instrument;
  return acc;
}, {});

export function getPluginInstrument(pluginRef) {
  const key = String(pluginRef || "").trim();
  return pluginByRef[key] || null;
}
