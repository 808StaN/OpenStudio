import { useCallback } from "react";

// Handles all grid click interactions:
// - marquee selection in Select mode
// - adding/removing step notes
// - adding/removing piano notes
// - C5 special behavior for step lane compatibility
export const usePianoRollGridMouseDown = function ({
  activeChannel,
  activePattern,
  activePatternId,
  editMode,
  patternLength,
  stepWidth,
  rowHeight,
  gridWidth,
  gridHeight,
  pitchRows,
  snapStepSize,
  minNoteLength,
  minFreeLength,
  pitchMax,
  c5Pitch,
  marqueeMinDrag,
  pianoNotes,
  dispatch,
  getGridPointerFromEvent,
  setSelectionBox,
  setSelectedNoteIds,
  toggleStepAction,
  togglePianoNoteAction,
  startPreviewNote,
  lastTouchedLengthRef,
  lastTouchedVelocityRef,
  clampFn,
  isNearlyEqualFn,
  quantizeBySnapFn,
  getSelectionId,
}) {
  const onGridMouseDown = useCallback(
    function (event) {
      if (!activeChannel || !activePattern) {
        return;
      }

      if (event.button !== 0 && event.button !== 2) {
        return;
      }

      const pointer = getGridPointerFromEvent(event);
      if (!pointer) {
        return;
      }

      const x = pointer.x;
      const y = pointer.y;

      if (y < 0) {
        return;
      }

      if (editMode === "select") {
        if (event.button !== 0) {
          return;
        }

        event.preventDefault();

        const startX = clampFn(x, 0, gridWidth);
        const startY = clampFn(y, 0, gridHeight);
        setSelectionBox({
          startX,
          startY,
          endX: startX,
          endY: startY,
        });

        const onMouseMove = function (moveEvent) {
          const movePointer = getGridPointerFromEvent(moveEvent);
          if (!movePointer) {
            return;
          }

          setSelectionBox(function (current) {
            if (!current) {
              return current;
            }

            return {
              ...current,
              endX: clampFn(movePointer.x, 0, gridWidth),
              endY: clampFn(movePointer.y, 0, gridHeight),
            };
          });
        };

        const onMouseUp = function (upEvent) {
          window.removeEventListener("mousemove", onMouseMove);
          window.removeEventListener("mouseup", onMouseUp);

          const upPointer = getGridPointerFromEvent(upEvent) || {
            x: startX,
            y: startY,
          };

          const endX = clampFn(upPointer.x, 0, gridWidth);
          const endY = clampFn(upPointer.y, 0, gridHeight);
          const minX = Math.min(startX, endX);
          const maxX = Math.max(startX, endX);
          const minY = Math.min(startY, endY);
          const maxY = Math.max(startY, endY);
          const wasClick =
            Math.abs(maxX - minX) < marqueeMinDrag &&
            Math.abs(maxY - minY) < marqueeMinDrag;

          if (wasClick) {
            setSelectedNoteIds([]);
            setSelectionBox(null);
            return;
          }

          const nextSelection = pianoNotes
            .filter(function (note) {
              const noteLeft = note.start * stepWidth + 1;
              const noteTop = (pitchMax - note.pitch) * rowHeight + 2;
              const noteWidth = Math.max(8, note.length * stepWidth - 2);
              const noteHeight = Math.max(6, rowHeight - 4);
              const noteRight = noteLeft + noteWidth;
              const noteBottom = noteTop + noteHeight;

              const intersectsHorizontally =
                noteRight >= minX && noteLeft <= maxX;
              const intersectsVertically =
                noteBottom >= minY && noteTop <= maxY;
              return intersectsHorizontally && intersectsVertically;
            })
            .map(function (note) {
              return getSelectionId(note);
            });

          setSelectedNoteIds(nextSelection);
          setSelectionBox(null);
        };

        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
        return;
      }

      const stepIndex = Math.max(
        0,
        Math.min(patternLength - 1, Math.floor(x / stepWidth)),
      );
      const rawStart = clampFn(x / stepWidth, 0, patternLength - minFreeLength);
      const snappedStart = clampFn(
        quantizeBySnapFn(rawStart, snapStepSize),
        0,
        patternLength - minFreeLength,
      );
      const rowIndex = Math.max(
        0,
        Math.min(pitchRows.length - 1, Math.floor(y / rowHeight)),
      );
      const pitch = pitchMax - rowIndex;

      const stepRow = activePattern.stepGrid?.[activeChannel.id] || [];
      const stepIsOn = Boolean(stepRow[stepIndex]);

      const customNotes = activePattern.pianoPreview?.[activeChannel.id] || [];
      const hasCustomNote = customNotes.some(function (note) {
        return (
          isNearlyEqualFn(note.start || 0, snappedStart) && note.pitch === pitch
        );
      });

      const maxNewLength = Math.max(minFreeLength, patternLength - snappedStart);
      const minNewLength = Math.min(minFreeLength, maxNewLength);
      const lastTouchedLength = Math.max(
        minFreeLength,
        Number(lastTouchedLengthRef.current || minNoteLength),
      );
      const nextCreatedLength = clampFn(
        lastTouchedLength,
        minNewLength,
        maxNewLength,
      );
      const snappedStartIsStep = isNearlyEqualFn(snappedStart, stepIndex);
      const shouldUseStepCell =
        snappedStartIsStep && isNearlyEqualFn(nextCreatedLength, 1);

      if (pitch === c5Pitch) {
        if (event.button === 0) {
          if (shouldUseStepCell) {
            if (!stepIsOn) {
              dispatch(
                toggleStepAction({
                  patternId: activePatternId,
                  channelId: activeChannel.id,
                  stepIndex,
                }),
              );
            }
            void startPreviewNote(pitch);
            return;
          }

          if (!hasCustomNote) {
            if (stepIsOn && snappedStartIsStep) {
              dispatch(
                toggleStepAction({
                  patternId: activePatternId,
                  channelId: activeChannel.id,
                  stepIndex,
                }),
              );
            }

            lastTouchedLengthRef.current = nextCreatedLength;
            dispatch(
              togglePianoNoteAction({
                patternId: activePatternId,
                channelId: activeChannel.id,
                start: snappedStart,
                pitch,
                length: nextCreatedLength,
                velocity: lastTouchedVelocityRef.current,
              }),
            );
            void startPreviewNote(pitch);
          }
          return;
        }

        if (event.button === 2) {
          event.preventDefault();

          if (hasCustomNote) {
            dispatch(
              togglePianoNoteAction({
                patternId: activePatternId,
                channelId: activeChannel.id,
                start: snappedStart,
                pitch,
                length: minNoteLength,
              }),
            );
            return;
          }

          if (stepIsOn) {
            dispatch(
              toggleStepAction({
                patternId: activePatternId,
                channelId: activeChannel.id,
                stepIndex,
              }),
            );
          }
        }

        return;
      }

      if (event.button === 0 && !hasCustomNote) {
        lastTouchedLengthRef.current = nextCreatedLength;
        dispatch(
          togglePianoNoteAction({
            patternId: activePatternId,
            channelId: activeChannel.id,
            start: snappedStart,
            pitch,
            length: nextCreatedLength,
            velocity: lastTouchedVelocityRef.current,
          }),
        );
        void startPreviewNote(pitch);
      }

      if (event.button === 2 && hasCustomNote) {
        event.preventDefault();
        dispatch(
          togglePianoNoteAction({
            patternId: activePatternId,
            channelId: activeChannel.id,
            start: snappedStart,
            pitch,
            length: minNoteLength,
          }),
        );
      }
    },
    [
      activeChannel,
      activePattern,
      editMode,
      getGridPointerFromEvent,
      clampFn,
      gridWidth,
      gridHeight,
      setSelectionBox,
      setSelectedNoteIds,
      pianoNotes,
      stepWidth,
      pitchMax,
      rowHeight,
      marqueeMinDrag,
      getSelectionId,
      patternLength,
      minFreeLength,
      quantizeBySnapFn,
      snapStepSize,
      pitchRows,
      isNearlyEqualFn,
      minNoteLength,
      c5Pitch,
      dispatch,
      toggleStepAction,
      activePatternId,
      togglePianoNoteAction,
      startPreviewNote,
      lastTouchedLengthRef,
      lastTouchedVelocityRef,
    ],
  );

  return {
    onGridMouseDown,
  };
};
