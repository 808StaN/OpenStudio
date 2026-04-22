import { useCallback } from "react";

// Handles mouse interaction on existing notes:
// - select-mode delete/resize/multi-drag behavior
// - draw-mode right-click delete
// - draw-mode move/resize with optional step->piano conversion
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
  const onNoteMouseDown = useCallback(
    function (event, note) {
      event.stopPropagation();
      event.preventDefault();

      if (Number(note.length) > 0) {
        lastTouchedLengthRef.current = Number(note.length);
      }
      if (Number(note.velocity) > 0) {
        const touchedVelocity = Math.round(clampFn(Number(note.velocity), 1, 127));
        lastTouchedVelocityRef.current = touchedVelocity;
        setVelocityReadout(midiVelocityToPercentFn(touchedVelocity));
      }

      if (event.button === 0) {
        void startPreviewNote(note.pitch);
      }

      const noteRect = event.currentTarget.getBoundingClientRect();
      const clickedNearRightEdge = noteRect.right - event.clientX <= 8;

      if (editMode === "select") {
        if (!activeChannel) {
          return;
        }

        const noteSelectionId = getSelectionId(note);

        if (event.button === 2) {
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
            const rawEnd =
              activeSession.start + activeSession.originLength + deltaStepsRaw;
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

        const dragIds = notesToMove.map(function (item) {
          return "piano:" + item.id;
        });
        setSelectedNoteIds(dragIds);

        const session = {
          originX: event.clientX,
          originY: event.clientY,
          previewOriginPitch: note.pitch,
          // Track last previewed pitch to avoid retrigger spam while dragging.
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

          const deltaStepsRaw =
            (moveEvent.clientX - dragSession.originX) / stepWidth;
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

            if (
              isNearlyEqualFn(nextStart, item.start) &&
              nextPitch === item.pitch
            ) {
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
        return;
      }

      if (event.button === 2) {
        if (!activeChannel) {
          return;
        }

        if (note.source === "step") {
          dispatch(
            toggleStepAction({
              patternId: activePatternId,
              channelId: activeChannel.id,
              stepIndex: note.start,
            }),
          );
          return;
        }

        dispatch(
          togglePianoNoteAction({
            patternId: activePatternId,
            channelId: activeChannel.id,
            start: note.start,
            pitch: note.pitch,
            length: note.length,
          }),
        );
        return;
      }

      if (event.button !== 0) {
        return;
      }

      if (!activeChannel) {
        return;
      }

      const session = {
        patternId: activePatternId,
        channelId: activeChannel.id,
        source: note.source,
        mode: clickedNearRightEdge ? "resize" : "move",
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

        if (activeSession.mode === "resize") {
          const maxLen = Math.max(minFreeLength, patternLength - activeSession.start);
          const minLen = Math.min(minNoteLength, maxLen);
          const rawEnd =
            activeSession.start + activeSession.originLength + deltaStepsRaw;
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
          return;
        }

        const deltaRows = Math.round(
          (moveEvent.clientY - activeSession.originY) / rowHeight,
        );
        const maxStart = Math.max(0, patternLength - activeSession.length);
        const nextStart = clampFn(
          quantizeBySnapFn(activeSession.originStart + deltaStepsRaw, snapStepSize),
          0,
          maxStart,
        );
        const nextPitch = Math.max(
          pitchMin,
          Math.min(pitchMax, activeSession.originPitch - deltaRows),
        );

        if (
          nextStart === activeSession.start &&
          nextPitch === activeSession.pitch
        ) {
          return;
        }

        ensureStepConverted();

        if (nextPitch !== activeSession.pitch) {
          void startPreviewNote(nextPitch);
        }

        dispatch(
          movePianoNoteAction({
            patternId: activeSession.patternId,
            channelId: activeSession.channelId,
            noteId: note.id,
            start: activeSession.start,
            pitch: activeSession.pitch,
            nextStart,
            nextPitch,
          }),
        );

        activeSession.start = nextStart;
        activeSession.pitch = nextPitch;
      };

      const onMouseUp = function () {
        resizeSessionRef.current = null;
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    },
    [
      lastTouchedLengthRef,
      clampFn,
      lastTouchedVelocityRef,
      setVelocityReadout,
      midiVelocityToPercentFn,
      startPreviewNote,
      editMode,
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
      defaultNoteVelocity,
      stepWidth,
      minFreeLength,
      patternLength,
      minNoteLength,
      snapStepSize,
      quantizeBySnapFn,
      snapEpsilon,
      setPianoNoteLengthAction,
      pianoNotes,
      ensureNoteIsPiano,
      rowHeight,
      pitchMin,
      pitchMax,
      isNearlyEqualFn,
      movePianoNotesBatchAction,
      dragSelectionRef,
      resizeSessionRef,
      selectedNoteIds,
      movePianoNoteAction,
    ],
  );

  return {
    onNoteMouseDown,
  };
};
