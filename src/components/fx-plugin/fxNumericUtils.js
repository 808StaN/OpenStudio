import { GRAPH_MAX_DB } from "./graphicEqConstants";

// Shared numeric clamp used by all curve/slider calculations.
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// Snaps a value to control.step precision.
export function roundToStep(value, step) {
  const safeStep = Math.max(0.000001, Number(step || 0.01));
  return Math.round(Number(value || 0) / safeStep) * safeStep;
}

// Parses user-entered numeric text (accepting comma decimal separators).
export function parseNumericInput(raw) {
  if (raw === null || raw === undefined) {
    return null;
  }

  const normalized = String(raw)
    .trim()
    .replace(/,/g, ".")
    .replace(/[^0-9+\-.]/g, "");

  if (!normalized) {
    return null;
  }

  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  return numeric;
}

// Human-readable dB formatting used by multiple FX readouts.
export function toDbLabel(value) {
  const rounded = Number(value || 0).toFixed(1);
  return (Number(rounded) > 0 ? "+" : "") + rounded + " dB";
}

// Parses gain text input and clamps it to the visible EQ range.
export function parseDbInput(raw) {
  if (raw === null || raw === undefined) {
    return null;
  }

  const normalized = String(raw).trim().replace(/,/g, ".");
  if (!normalized) {
    return null;
  }

  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  return clamp(numeric, -GRAPH_MAX_DB, GRAPH_MAX_DB);
}
