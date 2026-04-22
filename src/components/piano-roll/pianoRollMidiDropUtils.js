// Find first MIDI file from DataTransfer file list.
export const getDroppedMidiFile = function (dataTransfer, isMidiFileNameFn) {
  const files = Array.from(dataTransfer?.files || []);
  return (
    files.find(function (file) {
      return isMidiFileNameFn(file?.name);
    }) || null
  );
};

// Check if incoming drag data can provide MIDI content for Piano Roll drop.
export const hasMidiDropPayload = function ({
  dataTransfer,
  dataTransferHasMidiPatternPayloadFn,
  dataTransferHasMidiFilePayloadFn,
  readMidiPatternFromDataTransferFn,
  readMidiFilePayloadFromDataTransferFn,
  isMidiFileNameFn,
}) {
  const hasMidiPatternType = dataTransferHasMidiPatternPayloadFn(dataTransfer);
  const hasMidiFileType = dataTransferHasMidiFilePayloadFn(dataTransfer);
  const payload = readMidiPatternFromDataTransferFn(dataTransfer);
  const midiFilePayload = readMidiFilePayloadFromDataTransferFn(dataTransfer);
  const droppedFile = getDroppedMidiFile(dataTransfer, isMidiFileNameFn);

  return Boolean(
    hasMidiPatternType ||
      hasMidiFileType ||
      payload ||
      midiFilePayload ||
      droppedFile,
  );
};

// Resolve dropped MIDI notes from either path payload or attached file payload.
export const resolveDroppedMidiNotes = async function ({
  dataTransfer,
  readMidiFilePayloadFromDataTransferFn,
  parseMidiArrayBufferToStepNotesFn,
  isMidiFileNameFn,
}) {
  const midiFilePayload = readMidiFilePayloadFromDataTransferFn(dataTransfer);
  if (midiFilePayload?.midiPath) {
    try {
      const response = await fetch(midiFilePayload.midiPath, {
        cache: "no-store",
      });
      if (!response.ok) {
        return [];
      }

      const bytes = await response.arrayBuffer();
      return parseMidiArrayBufferToStepNotesFn(bytes);
    } catch {
      return [];
    }
  }

  const droppedFile = getDroppedMidiFile(dataTransfer, isMidiFileNameFn);
  if (!droppedFile) {
    return [];
  }

  try {
    const bytes = await droppedFile.arrayBuffer();
    return parseMidiArrayBufferToStepNotesFn(bytes);
  } catch {
    return [];
  }
};
