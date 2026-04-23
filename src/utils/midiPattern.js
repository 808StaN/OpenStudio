import { C5_PITCH, getChannelMergedNotes } from "./patternNotes";
import { clamp } from "../store/utils";

export const MIDI_PATTERN_DND_MIME = "application/x-openstudio-midi-pattern";

const MIDI_PATTERN_TYPE = "openstudio-midi-pattern";
const MIDI_PATTERN_VERSION = 1;
const DEFAULT_NOTE_VELOCITY = 95;

function sanitizeNote(note) {
  if (!note) {
    return null;
  }

  const start = Number(note.start);
  const length = Number(note.length);
  const pitch = Number(note.pitch);
  const velocity = Number(note.velocity);

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(length) ||
    !Number.isFinite(pitch)
  ) {
    return null;
  }

  return {
    start: clamp(start, 0, 9999),
    length: clamp(length, 0.0625, 9999),
    pitch: Math.round(clamp(pitch, 0, 127)),
    velocity: Math.round(
      clamp(Number.isFinite(velocity) ? velocity : 100, 1, 127),
    ),
    source:
      String(note.source || "piano").toLowerCase() === "step"
        ? "step"
        : "piano",
  };
}

export function extractMidiPatternNotes(pattern, channelId) {
  const merged = getChannelMergedNotes(pattern, channelId);

  return merged
    .map(function (note) {
      return sanitizeNote({
        start: note.start,
        length: note.length,
        pitch: note.pitch,
        velocity: Math.round(Number(note.velocity || DEFAULT_NOTE_VELOCITY)),
        source: note.source,
      });
    })
    .filter(Boolean);
}

export function buildMidiPatternDragPayload(options) {
  const notes = Array.isArray(options?.notes) ? options.notes : [];

  return {
    type: MIDI_PATTERN_TYPE,
    version: MIDI_PATTERN_VERSION,
    patternId: String(options?.patternId || "").trim(),
    channelId: String(options?.channelId || "").trim(),
    channelName: String(options?.channelName || "").trim(),
    notes: notes.map(sanitizeNote).filter(Boolean),
  };
}

export function parseMidiPatternDragPayload(rawText) {
  if (!rawText) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawText);

    if (!parsed || parsed.type !== MIDI_PATTERN_TYPE) {
      return null;
    }

    const notes = Array.isArray(parsed.notes)
      ? parsed.notes.map(sanitizeNote).filter(Boolean)
      : [];

    if (notes.length === 0) {
      return null;
    }

    return {
      type: MIDI_PATTERN_TYPE,
      version: Number(parsed.version || MIDI_PATTERN_VERSION),
      patternId: String(parsed.patternId || "").trim(),
      channelId: String(parsed.channelId || "").trim(),
      channelName: String(parsed.channelName || "").trim(),
      notes,
    };
  } catch {
    return null;
  }
}

export function writeMidiPatternToDataTransfer(dataTransfer, payload) {
  if (!dataTransfer || !payload) {
    return;
  }

  const serialized = JSON.stringify(payload);
  dataTransfer.setData(MIDI_PATTERN_DND_MIME, serialized);
  dataTransfer.setData("text/plain", serialized);
}

export function readMidiPatternFromDataTransfer(dataTransfer) {
  if (!dataTransfer) {
    return null;
  }

  const direct = parseMidiPatternDragPayload(
    dataTransfer.getData(MIDI_PATTERN_DND_MIME),
  );
  if (direct) {
    return direct;
  }

  return parseMidiPatternDragPayload(dataTransfer.getData("text/plain"));
}

export function dataTransferHasMidiPatternPayload(dataTransfer) {
  if (!dataTransfer) {
    return false;
  }

  const types = Array.from(dataTransfer.types || []).map(function (type) {
    return String(type || "");
  });

  return types.includes(MIDI_PATTERN_DND_MIME);
}
