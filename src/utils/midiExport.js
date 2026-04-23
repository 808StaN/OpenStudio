import { clamp } from "../store/utils";

const MIDI_HEADER_CHUNK = [0x4d, 0x54, 0x68, 0x64]; // MThd
const MIDI_TRACK_CHUNK = [0x4d, 0x54, 0x72, 0x6b]; // MTrk
const TICKS_PER_QUARTER = 480;
const TICKS_PER_STEP = TICKS_PER_QUARTER / 4;

function encodeUint16(value) {
  return [(value >> 8) & 0xff, value & 0xff];
}

function encodeUint32(value) {
  return [
    (value >> 24) & 0xff,
    (value >> 16) & 0xff,
    (value >> 8) & 0xff,
    value & 0xff,
  ];
}

function encodeVarLength(value) {
  let buffer = [value & 0x7f];
  let remaining = value >> 7;

  while (remaining > 0) {
    buffer = [(remaining & 0x7f) | 0x80].concat(buffer);
    remaining >>= 7;
  }

  return buffer;
}

function buildTrackEventBytes(notes, bpm) {
  const microsecondsPerQuarter = Math.round(
    60000000 / clamp(Number(bpm || 120), 20, 300),
  );

  const events = [
    {
      tick: 0,
      kind: "meta",
      bytes: [
        0xff,
        0x51,
        0x03,
        (microsecondsPerQuarter >> 16) & 0xff,
        (microsecondsPerQuarter >> 8) & 0xff,
        microsecondsPerQuarter & 0xff,
      ],
    },
  ];

  const safeNotes = (Array.isArray(notes) ? notes : []).map(function (note) {
    const pitch = Math.round(clamp(Number(note?.pitch || 72), 0, 127));
    const velocity = Math.round(clamp(Number(note?.velocity || 100), 1, 127));
    const startTick = Math.max(
      0,
      Math.round(Number(note?.start || 0) * TICKS_PER_STEP),
    );
    const lengthTick = Math.max(
      1,
      Math.round(Math.max(0.0625, Number(note?.length || 1)) * TICKS_PER_STEP),
    );

    return {
      pitch,
      velocity,
      startTick,
      endTick: startTick + lengthTick,
    };
  });

  safeNotes.forEach(function (note) {
    events.push({
      tick: note.startTick,
      kind: "on",
      bytes: [0x90, note.pitch, note.velocity],
    });
    events.push({
      tick: note.endTick,
      kind: "off",
      bytes: [0x80, note.pitch, 0],
    });
  });

  events.sort(function (a, b) {
    if (a.tick !== b.tick) {
      return a.tick - b.tick;
    }

    const priority = function (kind) {
      if (kind === "off") {
        return 0;
      }
      if (kind === "on") {
        return 1;
      }
      return 2;
    };

    return priority(a.kind) - priority(b.kind);
  });

  const trackBytes = [];
  let lastTick = 0;

  events.forEach(function (event) {
    const delta = Math.max(0, event.tick - lastTick);
    trackBytes.push(...encodeVarLength(delta), ...event.bytes);
    lastTick = event.tick;
  });

  trackBytes.push(0x00, 0xff, 0x2f, 0x00); // End of track

  return trackBytes;
}

export function createMidiFileData(notes, bpm) {
  const trackBytes = buildTrackEventBytes(notes, bpm);

  const header = [
    ...MIDI_HEADER_CHUNK,
    ...encodeUint32(6),
    ...encodeUint16(0),
    ...encodeUint16(1),
    ...encodeUint16(TICKS_PER_QUARTER),
  ];

  const trackChunk = [
    ...MIDI_TRACK_CHUNK,
    ...encodeUint32(trackBytes.length),
    ...trackBytes,
  ];

  return new Uint8Array(header.concat(trackChunk));
}

export function triggerMidiDownload(notes, bpm, requestedFileName) {
  const midiData = createMidiFileData(notes, bpm);
  const blob = new Blob([midiData], {
    type: "audio/midi",
  });

  const safeBaseName = String(requestedFileName || "melody")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 80);
  const fileName = (safeBaseName || "melody") + ".mid";

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();

  setTimeout(function () {
    URL.revokeObjectURL(url);
  }, 1000);
}
