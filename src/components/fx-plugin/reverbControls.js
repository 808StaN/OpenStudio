import { formatMs, formatPercent, formatSeconds } from "./fxPluginUtils";

// Static reverb control configuration used by the Reverb editor view.
export const REVERB_CONTROLS = [
  {
    param: "decayTime",
    label: "Decay",
    min: 0.2,
    max: 20,
    step: 0.01,
    defaultValue: 2.8,
    format: formatSeconds,
  },
  {
    param: "preDelayMs",
    label: "PreDelay",
    min: 0,
    max: 250,
    step: 1,
    defaultValue: 24,
    format: formatMs,
  },
  {
    param: "size",
    label: "Size",
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: 0.62,
    format: formatPercent,
  },
  {
    param: "damping",
    label: "Damping",
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: 0.45,
    format: formatPercent,
  },
  {
    param: "hiCutHz",
    label: "HiCut",
    min: 1200,
    max: 18000,
    step: 10,
    defaultValue: 9000,
    format: function (value) {
      return Math.round(Number(value || 0)) + " Hz";
    },
  },
  {
    param: "loCutHz",
    label: "LoCut",
    min: 20,
    max: 1200,
    step: 1,
    defaultValue: 130,
    format: function (value) {
      return Math.round(Number(value || 0)) + " Hz";
    },
  },
  {
    param: "earlyReflections",
    label: "Early",
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: 0.38,
    format: formatPercent,
  },
  {
    param: "diffusion",
    label: "Diffusion",
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: 0.72,
    format: formatPercent,
  },
  {
    param: "modulationDepth",
    label: "Mod Depth",
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: 0.22,
    format: formatPercent,
  },
  {
    param: "modulationRateHz",
    label: "Mod Rate",
    min: 0,
    max: 8,
    step: 0.01,
    defaultValue: 0.35,
    format: function (value) {
      return Number(value || 0).toFixed(2) + " Hz";
    },
  },
  {
    param: "width",
    label: "Width",
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: 0.9,
    format: formatPercent,
  },
  {
    param: "dryWet",
    label: "Mix",
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: 0.34,
    format: formatPercent,
  },
];
