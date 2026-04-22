// Window-level events used to coordinate preview state between UI and scheduler.
export const SAMPLE_SETTINGS_PREVIEW_PLAY_EVENT =
  "openstudio:sample-settings-preview-play";
export const SAMPLE_SETTINGS_PREVIEW_STOP_EVENT =
  "openstudio:sample-settings-preview-stop";

// Supported UI modes for stretch time targeting.
export const STRETCH_TIME_MODE_OPTIONS = [
  { value: "none", label: "(none)" },
  { value: "set-bpm", label: "Set BPM" },
  { value: "project-tempo", label: "Project tempo" },
  { value: "beat-1", label: "1 beat" },
  { value: "beat-2", label: "2 beats" },
  { value: "bar-1", label: "1 bar" },
  { value: "bar-2", label: "2 bars" },
  { value: "bar-3", label: "3 bars" },
  { value: "bar-4", label: "4 bars" },
];

// Supported algorithm modes exposed in the stretch tab.
export const STRETCH_MODE_OPTIONS = [
  { value: "resample", label: "Resample" },
  { value: "stretch", label: "Stretch" },
];
