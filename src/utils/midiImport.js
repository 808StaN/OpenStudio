export const MIDI_FILE_DND_MIME = "application/x-openstudio-midi-file";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function readUint16(bytes, offset) {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readUint32(bytes, offset) {
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0
  );
}

function readVarLength(bytes, startOffset) {
  let offset = startOffset;
  let value = 0;

  for (let i = 0; i < 4; i += 1) {
    if (offset >= bytes.length) {
      return null;
    }

    const byte = bytes[offset];
    value = (value << 7) | (byte & 0x7f);
    offset += 1;

    if ((byte & 0x80) === 0) {
      return {
        value,
        nextOffset: offset,
      };
    }
  }

  return null;
}

function normalizeOpenNoteKey(channel, pitch) {
  return channel + ":" + pitch;
}

function pushOpenNote(openNotes, key, noteData) {
  if (!openNotes.has(key)) {
    openNotes.set(key, []);
  }

  openNotes.get(key).push(noteData);
}

function popOpenNote(openNotes, key) {
  const list = openNotes.get(key);
  if (!list || list.length === 0) {
    return null;
  }

  const next = list.pop() || null;
  if (list.length === 0) {
    openNotes.delete(key);
  }

  return next;
}

function parseTrackEvents(bytes, startOffset, endOffset) {
  let offset = startOffset;
  let tick = 0;
  let runningStatus = null;
  const notes = [];
  const openNotes = new Map();

  while (offset < endOffset) {
    const delta = readVarLength(bytes, offset);
    if (!delta) {
      break;
    }

    tick += delta.value;
    offset = delta.nextOffset;
    if (offset >= endOffset) {
      break;
    }

    let statusByte = bytes[offset];
    if (statusByte >= 0x80) {
      offset += 1;
      if (statusByte < 0xf0) {
        runningStatus = statusByte;
      }
    } else if (runningStatus !== null) {
      statusByte = runningStatus;
    } else {
      break;
    }

    if (statusByte === 0xff) {
      if (offset >= endOffset) {
        break;
      }

      offset += 1; // meta type
      const metaLen = readVarLength(bytes, offset);
      if (!metaLen) {
        break;
      }

      offset = metaLen.nextOffset + metaLen.value;
      continue;
    }

    if (statusByte === 0xf0 || statusByte === 0xf7) {
      const sysexLen = readVarLength(bytes, offset);
      if (!sysexLen) {
        break;
      }

      offset = sysexLen.nextOffset + sysexLen.value;
      continue;
    }

    const eventType = statusByte & 0xf0;
    const channel = statusByte & 0x0f;

    if (eventType === 0xc0 || eventType === 0xd0) {
      offset += 1;
      continue;
    }

    if (offset + 1 >= endOffset) {
      break;
    }

    const data1 = bytes[offset];
    const data2 = bytes[offset + 1];
    offset += 2;

    if (eventType === 0x90 && data2 > 0) {
      const key = normalizeOpenNoteKey(channel, data1);
      pushOpenNote(openNotes, key, {
        startTick: tick,
        velocity: data2,
      });
      continue;
    }

    if (eventType === 0x80 || (eventType === 0x90 && data2 === 0)) {
      const key = normalizeOpenNoteKey(channel, data1);
      const active = popOpenNote(openNotes, key);
      if (!active) {
        continue;
      }

      const lengthTick = Math.max(1, tick - active.startTick);
      notes.push({
        pitch: data1,
        velocity: active.velocity,
        startTick: active.startTick,
        lengthTick,
      });
    }
  }

  return notes;
}

function decodeMidiHeader(bytes) {
  if (bytes.length < 14) {
    return null;
  }

  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (magic !== "MThd") {
    return null;
  }

  const headerLen = readUint32(bytes, 4);
  if (headerLen < 6 || bytes.length < 8 + headerLen) {
    return null;
  }

  const format = readUint16(bytes, 8);
  const trackCount = readUint16(bytes, 10);
  const division = readUint16(bytes, 12);

  if (division <= 0 || (division & 0x8000) !== 0) {
    return null;
  }

  return {
    format,
    trackCount,
    ticksPerQuarter: division,
    nextOffset: 8 + headerLen,
  };
}

function parseMidiBytesToTickNotes(bytes) {
  const header = decodeMidiHeader(bytes);
  if (!header) {
    return null;
  }

  let offset = header.nextOffset;
  const notes = [];

  for (let trackIndex = 0; trackIndex < header.trackCount; trackIndex += 1) {
    if (offset + 8 > bytes.length) {
      break;
    }

    const magic = String.fromCharCode(
      bytes[offset],
      bytes[offset + 1],
      bytes[offset + 2],
      bytes[offset + 3],
    );
    if (magic !== "MTrk") {
      break;
    }

    const trackLength = readUint32(bytes, offset + 4);
    const trackStart = offset + 8;
    const trackEnd = trackStart + trackLength;
    if (trackEnd > bytes.length) {
      break;
    }

    const trackNotes = parseTrackEvents(bytes, trackStart, trackEnd);
    notes.push(...trackNotes);
    offset = trackEnd;
  }

  return {
    ticksPerQuarter: header.ticksPerQuarter,
    notes,
  };
}

function mapTickNotesToStepNotes(parsed) {
  if (!parsed || !Array.isArray(parsed.notes) || parsed.notes.length === 0) {
    return [];
  }

  const ticksPerQuarter = Math.max(1, Number(parsed.ticksPerQuarter || 480));

  return parsed.notes
    .map(function (note) {
      const start = (Number(note.startTick || 0) / ticksPerQuarter) * 4;
      const length = (Number(note.lengthTick || 1) / ticksPerQuarter) * 4;
      const pitch = Math.round(clamp(Number(note.pitch || 72), 0, 127));
      const velocity = Math.round(clamp(Number(note.velocity || 100), 1, 127));

      return {
        start: Math.max(0, start),
        length: Math.max(0.0625, length),
        pitch,
        velocity,
        source: "piano",
      };
    })
    .filter(Boolean)
    .sort(function (a, b) {
      if (a.start !== b.start) {
        return a.start - b.start;
      }

      return b.pitch - a.pitch;
    });
}

export function isMidiFileName(fileName) {
  const normalized = String(fileName || "")
    .trim()
    .toLowerCase();
  return normalized.endsWith(".mid") || normalized.endsWith(".midi");
}

export function parseMidiArrayBufferToStepNotes(arrayBuffer) {
  if (!(arrayBuffer instanceof ArrayBuffer)) {
    return [];
  }

  const bytes = new Uint8Array(arrayBuffer);
  const parsed = parseMidiBytesToTickNotes(bytes);
  return mapTickNotesToStepNotes(parsed);
}

export function buildMidiFileDragPayload(payload) {
  return {
    type: "openstudio-midi-file",
    version: 1,
    fileName: String(payload?.fileName || "").trim(),
    midiPath: String(payload?.midiPath || "").trim(),
  };
}

export function writeMidiFileToDataTransfer(dataTransfer, payload) {
  if (!dataTransfer || !payload) {
    return;
  }

  const serialized = JSON.stringify(payload);
  dataTransfer.setData(MIDI_FILE_DND_MIME, serialized);
  dataTransfer.setData("text/plain", serialized);
}

export function readMidiFilePayloadFromDataTransfer(dataTransfer) {
  if (!dataTransfer) {
    return null;
  }

  const parse = function (raw) {
    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.type !== "openstudio-midi-file") {
        return null;
      }

      const midiPath = String(parsed.midiPath || "").trim();
      if (!midiPath) {
        return null;
      }

      return {
        type: "openstudio-midi-file",
        version: Number(parsed.version || 1),
        fileName: String(parsed.fileName || "").trim(),
        midiPath,
      };
    } catch {
      return null;
    }
  };

  const direct = parse(dataTransfer.getData(MIDI_FILE_DND_MIME));
  if (direct) {
    return direct;
  }

  return parse(dataTransfer.getData("text/plain"));
}

export function dataTransferHasMidiFilePayload(dataTransfer) {
  if (!dataTransfer) {
    return false;
  }

  const types = Array.from(dataTransfer.types || []).map(function (type) {
    return String(type || "");
  });

  if (types.includes(MIDI_FILE_DND_MIME)) {
    return true;
  }

  if (types.includes("Files")) {
    const droppedFile = Array.from(dataTransfer.files || []).find(
      function (file) {
        return isMidiFileName(file?.name);
      },
    );

    if (droppedFile) {
      return true;
    }

    // During dragover some browsers hide file names but still expose the Files type.
    return true;
  }

  return false;
}
