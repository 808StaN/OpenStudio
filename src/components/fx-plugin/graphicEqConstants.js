// Dropdown options used by the EQ band-type selector.
export const GRAPHIC_EQ_BAND_TYPES = [
  { value: "peaking", label: "Bell" },
  { value: "lowshelf", label: "Low Shelf" },
  { value: "highshelf", label: "High Shelf" },
  { value: "lowpass", label: "Low Pass" },
  { value: "highpass", label: "High Pass" },
];

// Graph bounds and tuning constants for the EQ/analyzer visualizations.
export const GRAPH_WIDTH = 420;
export const GRAPH_HEIGHT = 204;
export const GRAPH_MIN_FREQ = 20;
export const GRAPH_MAX_FREQ = 20000;
export const GRAPH_MAX_DB = 18;
export const GRAPH_GRID_ROWS_PER_SIDE = 4;
export const GRAPH_FREQUENCY_GUIDES = [
  20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000,
];
export const WHEEL_SHAPE_STEP_PERCENT = 2;
export const PEAKING_Q_MIN = 0.35;
export const PEAKING_Q_MAX = 8;
export const SHELF_Q_MIN = 0.25;
export const SHELF_Q_MAX = 3.5;
export const GRAPH_PADDING = {
  left: 10,
  right: 10,
  top: 10,
  bottom: 26,
};
