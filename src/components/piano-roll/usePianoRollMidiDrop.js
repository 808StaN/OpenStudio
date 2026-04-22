import { useCallback } from "react";
import { hasMidiDropPayload, resolveDroppedMidiNotes } from "./pianoRollMidiDropUtils";

// Wire drag-over and drop behavior for MIDI pattern/file drops into Piano Roll.
export const usePianoRollMidiDrop = function ({
  activePattern,
  activeChannel,
  activePatternId,
  patternLength,
  stepWidth,
  dispatch,
  clampFn,
  getGridPointerFromEvent,
  pasteMidiPatternToChannelAction,
  dataTransferHasMidiPatternPayloadFn,
  dataTransferHasMidiFilePayloadFn,
  readMidiPatternFromDataTransferFn,
  readMidiFilePayloadFromDataTransferFn,
  parseMidiArrayBufferToStepNotesFn,
  isMidiFileNameFn,
}) {
  const onPianoRollMidiDragOver = useCallback(
    function (event) {
      if (
        hasMidiDropPayload({
          dataTransfer: event.dataTransfer,
          dataTransferHasMidiPatternPayloadFn,
          dataTransferHasMidiFilePayloadFn,
          readMidiPatternFromDataTransferFn,
          readMidiFilePayloadFromDataTransferFn,
          isMidiFileNameFn,
        })
      ) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }
    },
    [
      dataTransferHasMidiFilePayloadFn,
      dataTransferHasMidiPatternPayloadFn,
      isMidiFileNameFn,
      readMidiFilePayloadFromDataTransferFn,
      readMidiPatternFromDataTransferFn,
    ],
  );

  const onPianoRollMidiDrop = useCallback(
    async function (event) {
      if (!activePattern || !activeChannel) {
        return;
      }

      const payload = readMidiPatternFromDataTransferFn(event.dataTransfer);

      const pointer = getGridPointerFromEvent(event);
      if (!pointer) {
        return;
      }

      event.preventDefault();

      const insertStep = clampFn(Math.floor(pointer.x / stepWidth), 0, patternLength - 1);

      if (payload) {
        dispatch(
          pasteMidiPatternToChannelAction({
            patternId: activePatternId,
            channelId: activeChannel.id,
            insertStep,
            notes: payload.notes,
          }),
        );
        return;
      }

      const notes = await resolveDroppedMidiNotes({
        dataTransfer: event.dataTransfer,
        readMidiFilePayloadFromDataTransferFn,
        parseMidiArrayBufferToStepNotesFn,
        isMidiFileNameFn,
      });
      if (notes.length === 0) {
        return;
      }

      dispatch(
        pasteMidiPatternToChannelAction({
          patternId: activePatternId,
          channelId: activeChannel.id,
          insertStep,
          notes,
        }),
      );
    },
    [
      activeChannel,
      activePattern,
      activePatternId,
      clampFn,
      dispatch,
      getGridPointerFromEvent,
      isMidiFileNameFn,
      parseMidiArrayBufferToStepNotesFn,
      pasteMidiPatternToChannelAction,
      patternLength,
      readMidiFilePayloadFromDataTransferFn,
      readMidiPatternFromDataTransferFn,
      stepWidth,
    ],
  );

  return {
    onPianoRollMidiDragOver,
    onPianoRollMidiDrop,
  };
};
