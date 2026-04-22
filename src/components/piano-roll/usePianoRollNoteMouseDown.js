import { useCallback } from "react";
import { usePianoRollDrawModeNoteMouseDown } from "./usePianoRollDrawModeNoteMouseDown";
import { usePianoRollSelectModeNoteMouseDown } from "./usePianoRollSelectModeNoteMouseDown";

// Main note mousedown router:
// - stores last touched note metadata for UI helpers
// - previews note on left-click
// - forwards to select-mode or draw-mode interaction handlers
export const usePianoRollNoteMouseDown = function ({
  activeChannel,
  activePatternId,
  editMode,
  selectedNoteIdSet,
  selectedNoteIds,
  selectedNotes,
  pianoNotes,
  patternLength,
  stepWidth,
  rowHeight,
  snapStepSize,
  minNoteLength,
  minFreeLength,
  snapEpsilon,
  pitchMin,
  pitchMax,
  defaultNoteVelocity,
  dispatch,
  clampFn,
  isNearlyEqualFn,
  quantizeBySnapFn,
  getSelectionId,
  ensureNoteIsPiano,
  removeNote,
  deleteSelectedNotes,
  setSelectedNoteIds,
  movePianoNotesBatchAction,
  movePianoNoteAction,
  setPianoNoteLengthAction,
  toggleStepAction,
  togglePianoNoteAction,
  resizeSessionRef,
  dragSelectionRef,
  startPreviewNote,
  lastTouchedLengthRef,
  lastTouchedVelocityRef,
  setVelocityReadout,
  midiVelocityToPercentFn,
}) {
  const { onSelectModeNoteMouseDown } = usePianoRollSelectModeNoteMouseDown({
    activeChannel,
    activePatternId,
    selectedNoteIdSet,
    selectedNoteIds,
    selectedNotes,
    pianoNotes,
    patternLength,
    stepWidth,
    rowHeight,
    snapStepSize,
    minNoteLength,
    minFreeLength,
    snapEpsilon,
    pitchMin,
    pitchMax,
    defaultNoteVelocity,
    dispatch,
    clampFn,
    isNearlyEqualFn,
    quantizeBySnapFn,
    getSelectionId,
    ensureNoteIsPiano,
    removeNote,
    deleteSelectedNotes,
    setSelectedNoteIds,
    movePianoNotesBatchAction,
    setPianoNoteLengthAction,
    toggleStepAction,
    togglePianoNoteAction,
    resizeSessionRef,
    dragSelectionRef,
    startPreviewNote,
    lastTouchedLengthRef,
  });

  const { onDrawModeNoteMouseDown } = usePianoRollDrawModeNoteMouseDown({
    activeChannel,
    activePatternId,
    patternLength,
    stepWidth,
    rowHeight,
    snapStepSize,
    minNoteLength,
    minFreeLength,
    snapEpsilon,
    pitchMin,
    pitchMax,
    defaultNoteVelocity,
    dispatch,
    clampFn,
    quantizeBySnapFn,
    movePianoNoteAction,
    setPianoNoteLengthAction,
    toggleStepAction,
    togglePianoNoteAction,
    resizeSessionRef,
    startPreviewNote,
    lastTouchedLengthRef,
  });

  const onNoteMouseDown = useCallback(
    function (event, note) {
      event.stopPropagation();
      event.preventDefault();

      // Keep "last touched" values in sync for quick-access piano roll tools.
      if (Number(note.length) > 0) {
        lastTouchedLengthRef.current = Number(note.length);
      }
      if (Number(note.velocity) > 0) {
        const touchedVelocity = Math.round(clampFn(Number(note.velocity), 1, 127));
        lastTouchedVelocityRef.current = touchedVelocity;
        setVelocityReadout(midiVelocityToPercentFn(touchedVelocity));
      }

      // Preview only on primary-button interactions.
      if (event.button === 0) {
        void startPreviewNote(note.pitch);
      }

      const noteRect = event.currentTarget.getBoundingClientRect();
      const clickedNearRightEdge = noteRect.right - event.clientX <= 8;

      if (editMode === "select") {
        onSelectModeNoteMouseDown(event, note, clickedNearRightEdge);
        return;
      }

      onDrawModeNoteMouseDown(event, note, clickedNearRightEdge);
    },
    [
      lastTouchedLengthRef,
      clampFn,
      lastTouchedVelocityRef,
      setVelocityReadout,
      midiVelocityToPercentFn,
      startPreviewNote,
      editMode,
      onSelectModeNoteMouseDown,
      onDrawModeNoteMouseDown,
    ],
  );

  return {
    onNoteMouseDown,
  };
};
