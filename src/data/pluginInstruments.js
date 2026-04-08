export const PLUGIN_INSTRUMENTS = [
  {
    pluginRef: "openstudio-piano",
    name: "Piano",
    soundfont: "acoustic_grand_piano",
    description: "Grand piano",
  },
  {
    pluginRef: "openstudio-bright-piano",
    name: "Bright Piano",
    soundfont: "bright_acoustic_piano",
    description: "Bright acoustic piano",
  },
  {
    pluginRef: "openstudio-epiano",
    name: "E-Piano",
    soundfont: "electric_piano_1",
    description: "Classic electric piano",
  },
  {
    pluginRef: "openstudio-epiano-2",
    name: "E-Piano 2",
    soundfont: "electric_piano_2",
    description: "Alternative electric piano",
  },
  {
    pluginRef: "openstudio-organ",
    name: "Organ",
    soundfont: "drawbar_organ",
    description: "Drawbar organ",
  },
  {
    pluginRef: "openstudio-rock-organ",
    name: "Rock Organ",
    soundfont: "rock_organ",
    description: "Rock organ tone",
  },
  {
    pluginRef: "openstudio-guitar-nylon",
    name: "Nylon Guitar",
    soundfont: "acoustic_guitar_nylon",
    description: "Acoustic nylon guitar",
  },
  {
    pluginRef: "openstudio-guitar-steel",
    name: "Steel Guitar",
    soundfont: "acoustic_guitar_steel",
    description: "Acoustic steel guitar",
  },
  {
    pluginRef: "openstudio-guitar-clean",
    name: "Clean Guitar",
    soundfont: "electric_guitar_clean",
    description: "Clean electric guitar",
  },
  {
    pluginRef: "openstudio-bass-electric",
    name: "Electric Bass",
    soundfont: "electric_bass_finger",
    description: "Finger electric bass",
  },
  {
    pluginRef: "openstudio-bass",
    name: "Synth Bass 1",
    soundfont: "synth_bass_1",
    description: "Classic synth bass",
  },
  {
    pluginRef: "openstudio-bass-synth-2",
    name: "Synth Bass 2",
    soundfont: "synth_bass_2",
    description: "Deep synth bass",
  },
  {
    pluginRef: "openstudio-strings",
    name: "Strings",
    soundfont: "string_ensemble_1",
    description: "String ensemble",
  },
  {
    pluginRef: "openstudio-violin",
    name: "Violin",
    soundfont: "violin",
    description: "Solo violin",
  },
  {
    pluginRef: "openstudio-cello",
    name: "Cello",
    soundfont: "cello",
    description: "Solo cello",
  },
  {
    pluginRef: "openstudio-brass-section",
    name: "Brass Section",
    soundfont: "brass_section",
    description: "Layered brass section",
  },
  {
    pluginRef: "openstudio-trumpet",
    name: "Trumpet",
    soundfont: "trumpet",
    description: "Solo trumpet",
  },
  {
    pluginRef: "openstudio-alto-sax",
    name: "Alto Sax",
    soundfont: "alto_sax",
    description: "Alto saxophone",
  },
  {
    pluginRef: "openstudio-lead-saw",
    name: "Lead Saw",
    soundfont: "lead_2_sawtooth",
    description: "Sawtooth synth lead",
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
