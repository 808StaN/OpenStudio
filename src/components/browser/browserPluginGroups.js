import { PLUGIN_EFFECTS } from "../../data/pluginEffects";
import { PLUGIN_INSTRUMENTS } from "../../data/pluginInstruments";

// Static plugin tree groups rendered in BrowserPanel -> Plugins tab.
export const BROWSER_PLUGIN_GROUPS = [
  {
    folder: "Instruments",
    type: "instrument",
    items: PLUGIN_INSTRUMENTS,
  },
  {
    folder: "Effects",
    type: "effect",
    items: PLUGIN_EFFECTS,
  },
];
