import { useCallback } from "react";

// Handles note interactions while Piano Roll is in draw mode.
// Responsibilities:
// - right-click delete (step or piano note)
// - left-click move/resize single note with optional step->piano conversion
export const usePianoRollDrawModeNoteMouseDown = function ({
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
}) {
  const onDrawModeNoteMouseDown = useCallback(
    function (event, note, clickedNearRightEdge) {
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

        if (nextStart === activeSession.start && nextPitch === activeSession.pitch) {
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
      activeChannel,
      dispatch,
      toggleStepAction,
      activePatternId,
      togglePianoNoteAction,
      resizeSessionRef,
      stepWidth,
      minFreeLength,
      patternLength,
      minNoteLength,
      snapStepSize,
      quantizeBySnapFn,
      clampFn,
      snapEpsilon,
      setPianoNoteLengthAction,
      lastTouchedLengthRef,
      rowHeight,
      pitchMin,
      pitchMax,
      startPreviewNote,
      movePianoNoteAction,
      defaultNoteVelocity,
    ],
  );

  return {
    onDrawModeNoteMouseDown,
  };
};
