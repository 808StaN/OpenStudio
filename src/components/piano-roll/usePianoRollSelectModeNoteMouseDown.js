import { useCallback } from "react";

// Handles note interactions while Piano Roll is in select mode.
// Responsibilities:
// - right-click delete (single or current selection)
// - edge resize
// - drag selected note set as one batch
export const usePianoRollSelectModeNoteMouseDown = function ({
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
}) {
  const onSelectModeNoteMouseDown = useCallback(
    function (event, note, clickedNearRightEdge) {
      if (!activeChannel) {
        return;
      }

      const noteSelectionId = getSelectionId(note);

      if (event.button === 2) {
        // Delete whole selection when clicked note is selected; fallback to single note delete.
        if (selectedNoteIdSet.has(noteSelectionId) && selectedNotes.length > 1) {
          deleteSelectedNotes();
          return;
        }

        removeNote(note);
        setSelectedNoteIds(function (current) {
          return current.filter(function (item) {
            return item !== noteSelectionId;
          });
        });
        return;
      }

      if (event.button !== 0) {
        return;
      }

      if (clickedNearRightEdge) {
        const session = {
          patternId: activePatternId,
          channelId: activeChannel.id,
          source: note.source,
          mode: "resize",
          start: note.start,
          pitch: note.pitch,
          length: note.length,
          originStart: note.start,
          originPitch: note.pitch,
          originLength: note.length,
          originX: event.clientX,
          originY: event.clientY,
          convertedStep: false,
        };

        resizeSessionRef.current = session;

        const ensureStepConverted = function () {
          const activeSession = resizeSessionRef.current;
          if (!activeSession) {
            return;
          }

          if (activeSession.source !== "step" || activeSession.convertedStep) {
            return;
          }

          dispatch(
            toggleStepAction({
              patternId: activeSession.patternId,
              channelId: activeSession.channelId,
              stepIndex: activeSession.start,
            }),
          );

          dispatch(
            togglePianoNoteAction({
              patternId: activeSession.patternId,
              channelId: activeSession.channelId,
              start: activeSession.start,
              pitch: activeSession.pitch,
              length: activeSession.length,
              velocity: Math.round(
                clampFn(Number(note.velocity || defaultNoteVelocity), 1, 127),
              ),
            }),
          );

          activeSession.source = "piano";
          activeSession.convertedStep = true;
        };

        const onMouseMove = function (moveEvent) {
          const activeSession = resizeSessionRef.current;
          if (!activeSession) {
            return;
          }

          const deltaStepsRaw =
            (moveEvent.clientX - activeSession.originX) / stepWidth;
          const maxLen = Math.max(minFreeLength, patternLength - activeSession.start);
          const minLen = Math.min(minNoteLength, maxLen);
          const rawEnd = activeSession.start + activeSession.originLength + deltaStepsRaw;
          const snappedEnd = snapStepSize
            ? quantizeBySnapFn(rawEnd, snapStepSize)
            : rawEnd;
          const nextLength = clampFn(
            snappedEnd - activeSession.start,
            minLen,
            maxLen,
          );

          if (activeSession.source === "step") {
            if (nextLength <= 1) {
              return;
            }
            ensureStepConverted();
          }

          if (Math.abs(nextLength - activeSession.length) <= snapEpsilon) {
            return;
          }

          dispatch(
            setPianoNoteLengthAction({
              patternId: activeSession.patternId,
              channelId: activeSession.channelId,
              noteId: note.id,
              start: activeSession.start,
              pitch: activeSession.pitch,
              length: nextLength,
            }),
          );

          activeSession.length = nextLength;
          lastTouchedLengthRef.current = nextLength;
        };

        const onMouseUp = function () {
          resizeSessionRef.current = null;
          window.removeEventListener("mousemove", onMouseMove);
          window.removeEventListener("mouseup", onMouseUp);
        };

        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
        return;
      }

      const activeSelectionIds = selectedNoteIdSet.has(noteSelectionId)
        ? selectedNoteIds
        : [noteSelectionId];

      let notesToMove = pianoNotes.filter(function (item) {
        return activeSelectionIds.includes(getSelectionId(item));
      });
      notesToMove = notesToMove.map(function (item) {
        return ensureNoteIsPiano(item);
      });

      setSelectedNoteIds(
        notesToMove.map(function (item) {
          return "piano:" + item.id;
        }),
      );

      const session = {
        originX: event.clientX,
        originY: event.clientY,
        previewOriginPitch: note.pitch,
        // Prevent repeated retrigger when pointer moves inside same semitone.
        lastPreviewPitch: note.pitch,
        notes: notesToMove.map(function (item) {
          return {
            id: item.id,
            start: item.start,
            pitch: item.pitch,
            length: item.length,
            originStart: item.start,
            originPitch: item.pitch,
          };
        }),
      };

      const anchorNote = session.notes.reduce(function (best, item) {
        if (!best) {
          return item;
        }

        if (item.originStart < best.originStart) {
          return item;
        }

        return best;
      }, null);

      session.anchorOriginStart = anchorNote ? anchorNote.originStart : 0;
      session.minDeltaSteps = session.notes.reduce(function (acc, item) {
        return Math.max(acc, -item.originStart);
      }, -Infinity);
      session.maxDeltaSteps = session.notes.reduce(function (acc, item) {
        const maxStart = Math.max(0, patternLength - item.length);
        return Math.min(acc, maxStart - item.originStart);
      }, Infinity);

      dragSelectionRef.current = session;

      const onMouseMove = function (moveEvent) {
        const dragSession = dragSelectionRef.current;
        if (!dragSession) {
          return;
        }

        const deltaStepsRaw = (moveEvent.clientX - dragSession.originX) / stepWidth;
        const anchorTargetStart = snapStepSize
          ? quantizeBySnapFn(
              dragSession.anchorOriginStart + deltaStepsRaw,
              snapStepSize,
            )
          : dragSession.anchorOriginStart + deltaStepsRaw;
        const deltaSteps = clampFn(
          anchorTargetStart - dragSession.anchorOriginStart,
          dragSession.minDeltaSteps,
          dragSession.maxDeltaSteps,
        );
        const deltaRows = Math.round(
          (moveEvent.clientY - dragSession.originY) / rowHeight,
        );
        const previewPitch = clampFn(
          dragSession.previewOriginPitch - deltaRows,
          pitchMin,
          pitchMax,
        );
        if (previewPitch !== dragSession.lastPreviewPitch) {
          dragSession.lastPreviewPitch = previewPitch;
          void startPreviewNote(previewPitch);
        }

        dragSession.moves = [];
        dragSession.notes.forEach(function (item) {
          const maxStart = Math.max(0, patternLength - item.length);
          const nextStart = clampFn(item.originStart + deltaSteps, 0, maxStart);
          const nextPitch = Math.max(
            pitchMin,
            Math.min(pitchMax, item.originPitch - deltaRows),
          );

          if (isNearlyEqualFn(nextStart, item.start) && nextPitch === item.pitch) {
            return;
          }

          dragSession.moves.push({
            noteId: item.id,
            start: item.start,
            pitch: item.pitch,
            nextStart,
            nextPitch,
          });
        });

        if (Array.isArray(dragSession.moves) && dragSession.moves.length > 0) {
          dispatch(
            movePianoNotesBatchAction({
              patternId: activePatternId,
              channelId: activeChannel.id,
              moves: dragSession.moves,
            }),
          );

          dragSession.moves.forEach(function (move) {
            const target = dragSession.notes.find(function (item) {
              return item.id === move.noteId;
            });
            if (!target) {
              return;
            }
            target.start = move.nextStart;
            target.pitch = move.nextPitch;
          });
        }
      };

      const onMouseUp = function () {
        const dragSession = dragSelectionRef.current;
        dragSelectionRef.current = null;

        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);

        if (!dragSession) {
          return;
        }

        setSelectedNoteIds(
          dragSession.notes.map(function (item) {
            return "piano:" + item.id;
          }),
        );
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    },
    [
      activeChannel,
      getSelectionId,
      selectedNoteIdSet,
      selectedNotes.length,
      deleteSelectedNotes,
      removeNote,
      setSelectedNoteIds,
      activePatternId,
      dispatch,
      toggleStepAction,
      togglePianoNoteAction,
      clampFn,
      defaultNoteVelocity,
      resizeSessionRef,
      stepWidth,
      minFreeLength,
      patternLength,
      minNoteLength,
      snapStepSize,
      quantizeBySnapFn,
      snapEpsilon,
      setPianoNoteLengthAction,
      lastTouchedLengthRef,
      pianoNotes,
      ensureNoteIsPiano,
      dragSelectionRef,
      rowHeight,
      pitchMin,
      pitchMax,
      startPreviewNote,
      isNearlyEqualFn,
      movePianoNotesBatchAction,
      selectedNoteIds,
    ],
  );

  return {
    onSelectModeNoteMouseDown,
  };
};
