import { useCallback } from "react";
import {
  buildClipboardPastePayload,
  copySelectedNotesToClipboard,
} from "./pianoRollClipboard";

// Encapsulates copy/cut/paste/delete actions for selected piano notes.
// Keeping these operations in one hook makes keyboard shortcut wiring much cleaner.
export const usePianoRollClipboardActions = function ({
  selectedNotes,
  activePatternId,
  activePattern,
  activeChannel,
  dispatch,
  patternLength,
  minFreeLength,
  pitchMin,
  pitchMax,
  defaultVelocity,
  clampFn,
  makeIdFn,
  addPianoNotesBatchAction,
  removePianoNotesBatchAction,
  setSelectedNoteIds,
  setEditMode,
}) {
  const copySelectedNotes = useCallback(
    function () {
      copySelectedNotesToClipboard({
        selectedNotes,
        activePatternId,
        activeChannelId: activeChannel?.id || null,
        defaultVelocity,
        clampFn,
      });
    },
    [
      selectedNotes,
      activePatternId,
      activeChannel,
      defaultVelocity,
      clampFn,
    ],
  );

  const deleteSelectedNotes = useCallback(
    function () {
      if (!selectedNotes.length) {
        return;
      }

      if (activeChannel) {
        dispatch(
          removePianoNotesBatchAction({
            patternId: activePatternId,
            channelId: activeChannel.id,
            notes: selectedNotes.map(function (note) {
              return {
                id: note.id,
                source: note.source,
                start: note.start,
                pitch: note.pitch,
              };
            }),
          }),
        );
      }

      setSelectedNoteIds([]);
    },
    [
      selectedNotes,
      activeChannel,
      dispatch,
      removePianoNotesBatchAction,
      activePatternId,
      setSelectedNoteIds,
    ],
  );

  const cutSelectedNotes = useCallback(
    function () {
      if (!selectedNotes.length) {
        return;
      }
      copySelectedNotes();
      deleteSelectedNotes();
    },
    [selectedNotes, copySelectedNotes, deleteSelectedNotes],
  );

  const pasteClipboardNotes = useCallback(
    function () {
      if (!activePattern || !activeChannel) {
        return;
      }

      const { notesToAdd, nextSelection } = buildClipboardPastePayload({
        activePatternId,
        activeChannelId: activeChannel.id,
        patternLength,
        minFreeLength,
        pitchMin,
        pitchMax,
        defaultVelocity,
        clampFn,
        makeIdFn,
      });

      if (notesToAdd.length > 0) {
        dispatch(
          addPianoNotesBatchAction({
            patternId: activePatternId,
            channelId: activeChannel.id,
            notes: notesToAdd,
            allowOverlaps: true,
          }),
        );
      }

      if (nextSelection.length > 0) {
        setSelectedNoteIds(nextSelection);
        setEditMode("select");
      }
    },
    [
      activePattern,
      activeChannel,
      activePatternId,
      patternLength,
      minFreeLength,
      pitchMin,
      pitchMax,
      defaultVelocity,
      clampFn,
      makeIdFn,
      dispatch,
      addPianoNotesBatchAction,
      setSelectedNoteIds,
      setEditMode,
    ],
  );

  return {
    copySelectedNotes,
    deleteSelectedNotes,
    cutSelectedNotes,
    pasteClipboardNotes,
  };
};
