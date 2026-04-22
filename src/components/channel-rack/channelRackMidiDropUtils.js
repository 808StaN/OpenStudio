// Find first dropped MIDI file from DataTransfer payload.
export const getDroppedMidiFile = function (dataTransfer, isMidiFileNameFn) {
  return (
    Array.from(dataTransfer?.files || []).find(function (file) {
      return isMidiFileNameFn(file?.name);
    }) || null
  );
};

// Check whether drag data can provide a MIDI pattern/file payload.
export const hasChannelRackMidiDropPayload = function ({
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

// Resolve notes from data-transfer MIDI payload/path/file.
export const resolveChannelRackDroppedMidiNotes = async function ({
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
