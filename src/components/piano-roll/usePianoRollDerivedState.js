import { useMemo } from "react";
import { getNoteSelectionId } from "./pianoRollUtils";
import { MIN_FREE_LENGTH, SCALE_TYPES, SNAP_OPTIONS, STEPS_PER_BAR } from "./pianoRollConstants";

// Centralizes derived, memoized Piano Roll view state.
// This keeps the main window component focused on wiring hooks/components.
export const usePianoRollDerivedState = function ({
  scaleRoot,
  scaleType,
  snapKey,
  stepWidth,
  patternLength,
  rowHeight,
  pitchMin,
  pitchMax,
  pianoNotes,
  selectedNoteIds,
  currentStep16,
  isPlaying,
  scaleRoots,
}) {
  const activeSnap =
    SNAP_OPTIONS.find(function (option) {
      return option.key === snapKey;
    }) || SNAP_OPTIONS[9];

  const snapStepSize = activeSnap.stepSize;
  const minNoteLength = snapStepSize || MIN_FREE_LENGTH;
  const snapLineWidth = Math.max(1, (snapStepSize || 1) * stepWidth);
  const snapLineOpacity = snapStepSize ? 0.12 : 0;

  const scaleRootClass = scaleRoots.indexOf(scaleRoot);
  const activeScale =
    SCALE_TYPES.find(function (item) {
      return item.key === scaleType;
    }) || SCALE_TYPES[0];

  const scalePitchClasses = useMemo(
    function () {
      return new Set(
        activeScale.intervals.map(function (interval) {
          return (scaleRootClass + interval + 12) % 12;
        }),
      );
    },
    [activeScale, scaleRootClass],
  );

  const pitchRows = useMemo(function () {
    const rows = [];
    for (let pitch = pitchMax; pitch >= pitchMin; pitch -= 1) {
      rows.push(pitch);
    }
    return rows;
  }, [pitchMax, pitchMin]);

  const selectedNoteIdSet = useMemo(
    function () {
      return new Set(selectedNoteIds);
    },
    [selectedNoteIds],
  );

  const selectedNotes = useMemo(
    function () {
      return pianoNotes.filter(function (note) {
        return selectedNoteIdSet.has(getNoteSelectionId(note));
      });
    },
    [pianoNotes, selectedNoteIdSet],
  );

  const gridWidth = patternLength * stepWidth;
  const gridHeight = pitchRows.length * rowHeight;
  const totalBars = Math.max(1, Math.ceil(patternLength / STEPS_PER_BAR));

  const normalizedPlayheadStep =
    ((currentStep16 % patternLength) + patternLength) % patternLength;
  const playheadStep = isPlaying
    ? (normalizedPlayheadStep - 1 + patternLength) % patternLength
    : normalizedPlayheadStep;

  return {
    activeSnap,
    snapStepSize,
    minNoteLength,
    snapLineWidth,
    snapLineOpacity,
    activeScale,
    scalePitchClasses,
    pitchRows,
    selectedNoteIdSet,
    selectedNotes,
    gridWidth,
    gridHeight,
    totalBars,
    playheadStep,
  };
};
