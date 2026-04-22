import { useCallback } from "react";

// MIDI import/export handlers for Piano Roll toolbar actions.
export const usePianoRollMidiIo = function ({
  midiImportInputRef,
  activePattern,
  activeChannel,
  activePatternId,
  bpm,
  dispatch,
  isMidiFileNameFn,
  parseMidiArrayBufferToStepNotesFn,
  extractMidiPatternNotesFn,
  triggerMidiDownloadFn,
  pasteMidiPatternToChannelAction,
}) {
  const onExportMidiClick = useCallback(
    function () {
      if (!activePattern || !activeChannel) {
        return;
      }

      const notes = extractMidiPatternNotesFn(activePattern, activeChannel.id);
      if (notes.length === 0) {
        return;
      }

      const fileName =
        String(activePattern.name || "pattern").trim() +
        "-" +
        String(activeChannel.name || "channel").trim();
      triggerMidiDownloadFn(notes, bpm, fileName);
    },
    [activePattern, activeChannel, bpm, extractMidiPatternNotesFn, triggerMidiDownloadFn],
  );

  const onImportMidiClick = useCallback(function () {
    if (!midiImportInputRef.current) {
      return;
    }

    midiImportInputRef.current.click();
  }, [midiImportInputRef]);

  const onImportMidiFileChange = useCallback(
    async function (event) {
      const input = event.target;
      const file = input?.files?.[0] || null;

      if (!file || !isMidiFileNameFn(file.name)) {
        if (input) {
          input.value = "";
        }
        return;
      }

      if (!activePattern || !activeChannel) {
        input.value = "";
        return;
      }

      try {
        const bytes = await file.arrayBuffer();
        const notes = parseMidiArrayBufferToStepNotesFn(bytes);
        if (notes.length === 0) {
          input.value = "";
          return;
        }

        dispatch(
          pasteMidiPatternToChannelAction({
            patternId: activePatternId,
            channelId: activeChannel.id,
            insertStep: 0,
            notes,
          }),
        );
      } catch {
        // Ignore unreadable MIDI files.
      }

      input.value = "";
    },
    [
      activeChannel,
      activePattern,
      activePatternId,
      dispatch,
      isMidiFileNameFn,
      parseMidiArrayBufferToStepNotesFn,
      pasteMidiPatternToChannelAction,
    ],
  );

  return {
    onExportMidiClick,
    onImportMidiClick,
    onImportMidiFileChange,
  };
};
