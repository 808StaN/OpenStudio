import { useCallback } from "react";
import {
  hasChannelRackMidiDropPayload,
  resolveChannelRackDroppedMidiNotes,
} from "./channelRackMidiDropUtils";

// Handle MIDI drag-over/drop behavior for channel rows in Channel Rack.
export const useChannelRackMidiDrop = function ({
  activePatternId,
  dispatch,
  dataTransferHasMidiPatternPayloadFn,
  dataTransferHasMidiFilePayloadFn,
  readMidiPatternFromDataTransferFn,
  readMidiFilePayloadFromDataTransferFn,
  parseMidiArrayBufferToStepNotesFn,
  isMidiFileNameFn,
  pasteMidiPatternToChannelAction,
}) {
  const onMidiPatternDragOver = useCallback(
    function (event) {
      if (
        hasChannelRackMidiDropPayload({
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

  const onMidiPatternDrop = useCallback(
    async function (event, channel) {
      if (!channel) {
        return;
      }

      const payload = readMidiPatternFromDataTransferFn(event.dataTransfer);

      if (!payload) {
        const notes = await resolveChannelRackDroppedMidiNotes({
          dataTransfer: event.dataTransfer,
          readMidiFilePayloadFromDataTransferFn,
          parseMidiArrayBufferToStepNotesFn,
          isMidiFileNameFn,
        });
        if (notes.length === 0) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        dispatch(
          pasteMidiPatternToChannelAction({
            patternId: activePatternId,
            channelId: channel.id,
            notes,
          }),
        );
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      dispatch(
        pasteMidiPatternToChannelAction({
          patternId: activePatternId,
          channelId: channel.id,
          notes: payload.notes,
        }),
      );
    },
    [
      activePatternId,
      dispatch,
      isMidiFileNameFn,
      parseMidiArrayBufferToStepNotesFn,
      pasteMidiPatternToChannelAction,
      readMidiFilePayloadFromDataTransferFn,
      readMidiPatternFromDataTransferFn,
    ],
  );

  return {
    onMidiPatternDragOver,
    onMidiPatternDrop,
  };
};
