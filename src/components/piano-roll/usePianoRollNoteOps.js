import { useCallback } from "react";

// Shared Piano Roll note operations:
// - pointer-to-grid coordinate mapping
// - removing notes (step or piano source)
// - converting step notes to piano notes on-demand
export const usePianoRollNoteOps = function ({
  gridWrapRef,
  gridHeaderHeight,
  activeChannel,
  dispatch,
  activePatternId,
  defaultNoteVelocity,
  clampFn,
  makeIdFn,
  toggleStepAction,
  togglePianoNoteAction,
}) {
  const getGridPointerFromEvent = useCallback(
    function (event) {
      const viewport = gridWrapRef.current;
      if (!viewport) {
        return null;
      }

      const rect = viewport.getBoundingClientRect();
      const x = event.clientX - rect.left + viewport.scrollLeft;
      const y =
        event.clientY - rect.top + viewport.scrollTop - gridHeaderHeight;

      return {
        x,
        y,
        viewport,
      };
    },
    [gridWrapRef, gridHeaderHeight],
  );

  const removeNote = useCallback(
    function (note) {
      if (!activeChannel) {
        return;
      }

      if (note.source === "step") {
        dispatch(
          toggleStepAction({
            patternId: activePatternId,
            channelId: activeChannel.id,
            stepIndex: Math.round(note.start),
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
    },
    [
      activeChannel,
      dispatch,
      toggleStepAction,
      activePatternId,
      togglePianoNoteAction,
    ],
  );

  // Converts a step note into a persistent piano note while preserving pitch/start/length.
  const ensureNoteIsPiano = useCallback(
    function (note) {
      if (!activeChannel) {
        return note;
      }

      if (note.source !== "step") {
        return note;
      }

      dispatch(
        toggleStepAction({
          patternId: activePatternId,
          channelId: activeChannel.id,
          stepIndex: Math.round(note.start),
        }),
      );

      const generatedId = makeIdFn("conv");
      dispatch(
        togglePianoNoteAction({
          patternId: activePatternId,
          channelId: activeChannel.id,
          id: generatedId,
          start: note.start,
          pitch: note.pitch,
          length: note.length,
          velocity: Math.round(
            clampFn(Number(note.velocity || defaultNoteVelocity), 1, 127),
          ),
        }),
      );

      return {
        ...note,
        source: "piano",
        id: generatedId,
      };
    },
    [
      activeChannel,
      dispatch,
      toggleStepAction,
      activePatternId,
      makeIdFn,
      togglePianoNoteAction,
      clampFn,
      defaultNoteVelocity,
    ],
  );

  return {
    getGridPointerFromEvent,
    removeNote,
    ensureNoteIsPiano,
  };
};
