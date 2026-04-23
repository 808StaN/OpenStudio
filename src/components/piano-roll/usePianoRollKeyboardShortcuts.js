import { useEffect } from "react";

// Centralized keyboard shortcuts for Piano Roll editing actions.
export const usePianoRollKeyboardShortcuts = function ({
  activeChannel,
  patternId,
  channelId,
  editMode,
  pianoNotes,
  selectedNotes,
  scalePitchClasses,
  pitchMin,
  pitchMax,
  setEditMode,
  setSelectedNoteIds,
  toSelectionId,
  copySelectedNotes,
  cutSelectedNotes,
  pasteClipboardNotes,
  deleteSelectedNotes,
  ensureNoteIsPiano,
  clampFn,
  moveByScaleStepFn,
  onMoveSelectedNotes,
}) {
  useEffect(
    function () {
      const onKeyDown = function (event) {
        const target = event.target;
        if (
          target instanceof HTMLElement &&
          (target.isContentEditable ||
            target.closest("input, textarea, [contenteditable='true']"))
        ) {
          return;
        }

        const hasSelection = selectedNotes.length > 0;
        const key = event.key.toLowerCase();
        const ctrlOrMeta = event.ctrlKey || event.metaKey;

        if (ctrlOrMeta && key === "a") {
          event.preventDefault();
          setEditMode("select");
          setSelectedNoteIds(
            pianoNotes.map(function (note) {
              return toSelectionId(note);
            }),
          );
          return;
        }

        if (editMode !== "select") {
          return;
        }

        if (ctrlOrMeta && key === "c") {
          event.preventDefault();
          copySelectedNotes();
          return;
        }

        if (ctrlOrMeta && key === "x") {
          event.preventDefault();
          cutSelectedNotes();
          return;
        }

        if (ctrlOrMeta && key === "v") {
          event.preventDefault();
          pasteClipboardNotes();
          return;
        }

        if (event.key === "Delete" || event.key === "Backspace") {
          if (!hasSelection) {
            return;
          }
          event.preventDefault();
          deleteSelectedNotes();
          return;
        }

        if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
          return;
        }

        if (!hasSelection || !activeChannel || !patternId || !channelId) {
          return;
        }

        event.preventDefault();

        const direction = event.key === "ArrowUp" ? 1 : -1;
        const moveByOctave = event.ctrlKey && !event.metaKey;
        const moveBySemitone = event.shiftKey;
        const fixedStep = moveByOctave ? 12 : moveBySemitone ? 1 : 0;
        const moved = selectedNotes.map(function (note) {
          return ensureNoteIsPiano(note);
        });

        const moves = [];

        moved.forEach(function (note) {
          const nextPitch =
            fixedStep > 0
              ? clampFn(note.pitch + direction * fixedStep, pitchMin, pitchMax)
              : moveByScaleStepFn(
                  note.pitch,
                  direction,
                  scalePitchClasses,
                  pitchMin,
                  pitchMax,
                );

          if (nextPitch === note.pitch) {
            return;
          }

          moves.push({
            noteId: note.id,
            start: note.start,
            pitch: note.pitch,
            nextStart: note.start,
            nextPitch,
          });

          note.pitch = nextPitch;
        });

        if (moves.length > 0) {
          onMoveSelectedNotes({
            patternId,
            channelId,
            moves,
          });
        }

        setSelectedNoteIds(
          moved.map(function (note) {
            return "piano:" + note.id;
          }),
        );
      };

      window.addEventListener("keydown", onKeyDown);
      return function () {
        window.removeEventListener("keydown", onKeyDown);
      };
    },
    [
      activeChannel,
      channelId,
      clampFn,
      copySelectedNotes,
      cutSelectedNotes,
      deleteSelectedNotes,
      editMode,
      ensureNoteIsPiano,
      moveByScaleStepFn,
      onMoveSelectedNotes,
      pasteClipboardNotes,
      patternId,
      pianoNotes,
      pitchMax,
      pitchMin,
      scalePitchClasses,
      selectedNotes,
      setEditMode,
      setSelectedNoteIds,
      toSelectionId,
    ],
  );
};
