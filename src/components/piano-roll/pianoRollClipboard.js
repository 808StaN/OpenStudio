// Module-level clipboard shared by all Piano Roll instances.
// This mirrors DAW-style behavior where copied notes persist across views.
let sharedPianoClipboard = {
  sourcePatternId: null,
  sourceChannelId: null,
  entries: [],
  pasteCountInSource: 0,
};

// Clamp and normalize a note velocity to the valid MIDI range.
const toSafeVelocity = function (velocity, defaultVelocity, clampFn) {
  return Math.round(clampFn(Number(velocity || defaultVelocity), 1, 127));
};

// Save selected notes into the shared Piano Roll clipboard.
export const copySelectedNotesToClipboard = function ({
  selectedNotes,
  activePatternId,
  activeChannelId,
  defaultVelocity,
  clampFn,
}) {
  if (!Array.isArray(selectedNotes) || selectedNotes.length === 0) {
    return false;
  }

  sharedPianoClipboard = {
    sourcePatternId: activePatternId,
    sourceChannelId: activeChannelId || null,
    pasteCountInSource: 0,
    entries: selectedNotes.map(function (note) {
      return {
        start: note.start,
        pitch: note.pitch,
        length: note.length,
        velocity: toSafeVelocity(note.velocity, defaultVelocity, clampFn),
      };
    }),
  };

  return true;
};

// Build a paste payload from the shared clipboard for the active context.
export const buildClipboardPastePayload = function ({
  activePatternId,
  activeChannelId,
  patternLength,
  minFreeLength,
  pitchMin,
  pitchMax,
  defaultVelocity,
  clampFn,
  makeIdFn,
}) {
  if (
    !sharedPianoClipboard.entries ||
    sharedPianoClipboard.entries.length === 0 ||
    !activeChannelId
  ) {
    return { notesToAdd: [], nextSelection: [] };
  }

  const isSamePianoRollContext =
    sharedPianoClipboard.sourcePatternId === activePatternId &&
    sharedPianoClipboard.sourceChannelId === activeChannelId;

  if (isSamePianoRollContext) {
    sharedPianoClipboard.pasteCountInSource += 1;
  }

  const pasteShift = isSamePianoRollContext
    ? sharedPianoClipboard.pasteCountInSource
    : 0;

  const notesToAdd = [];
  const nextSelection = [];

  sharedPianoClipboard.entries.forEach(function (entry) {
    const start = clampFn(entry.start + pasteShift, 0, patternLength - minFreeLength);
    const maxLen = Math.max(minFreeLength, patternLength - start);
    const length = clampFn(entry.length, minFreeLength, maxLen);
    const pitch = clampFn(entry.pitch, pitchMin, pitchMax);
    const newId = makeIdFn("paste");
    notesToAdd.push({
      id: newId,
      start,
      pitch,
      length,
      velocity: toSafeVelocity(entry.velocity, defaultVelocity, clampFn),
    });
    nextSelection.push("piano:" + newId);
  });

  return { notesToAdd, nextSelection };
};
