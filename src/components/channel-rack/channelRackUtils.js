import { C5_PITCH } from "../../utils/patternNotes";

export const MIDI_PITCH_MIN = 0;
export const MIDI_PITCH_MAX = 127;
export const PREVIEW_TOP_MIN_PERCENT = 9;
export const PREVIEW_TOP_MAX_PERCENT = 91;
export const STEP_CELL_WIDTH_PX = 18;
export const STEP_CELL_GAP_PX = 4;
export const STEPS_PER_BEAT = 4;
export const DEFAULT_PATTERN_COLOR = "#4bef9f";

// Shared numeric clamp used by playhead animation and note preview positioning.
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// Detects whether piano preview contains non-step-like melody notes.
export function isMelodyShapeNote(note) {
  const pitch = Math.round(Number(note.pitch || C5_PITCH));
  const length = Number(note.length || 1);

  return pitch !== C5_PITCH || Math.abs(length - 1) > 0.0001;
}

// Keeps insert labels stable and user-friendly regardless of insert id format.
export function getInsertLabel(insert, index) {
  const fromName = String(insert.name || "").replace(/^insert\b/i, "Insert");
  if (fromName && fromName !== insert.name) {
    return fromName;
  }

  const numericSuffix = String(insert.id || "").match(/insert-(\d+)/i)?.[1];
  if (numericSuffix) {
    return "Insert " + numericSuffix;
  }

  return "Insert " + (index + 1);
}

// Resolves context menu position relative to rack shell with viewport-safe bounds.
export function resolveChannelMenuPosition(buttonRect, shellRect) {
  const estimatedMenuWidth = 176;
  const estimatedMenuHeight = 132;
  const preferredX = buttonRect.right - shellRect.left + 3;
  const preferredY = buttonRect.top - shellRect.top;
  const maxX = Math.max(8, shellRect.width - estimatedMenuWidth - 8);
  const maxY = Math.max(8, shellRect.height - estimatedMenuHeight - 8);
  const safeX = Math.max(8, Math.min(preferredX, maxX));
  const safeY = Math.max(8, Math.min(preferredY, maxY));

  return { x: safeX, y: safeY };
}
