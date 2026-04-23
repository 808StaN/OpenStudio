import { useCallback } from "react";

/**
 * Returns stable drag-and-drop / activation handlers for a single
 * ChannelRackRow wrapper (the <article> element).
 */
export function useChannelRackRowHandlers({
  channel,
  onActivateChannel,
  onAssignPluginToChannel,
  onAssignSampleToChannel,
}) {
  const handleMouseDown = useCallback(
    function () {
      onActivateChannel(channel.id);
    },
    [channel.id, onActivateChannel],
  );

  const handleDragOver = useCallback(function (event) {
    event.preventDefault();
  }, []);

  const handleDrop = useCallback(
    function (event) {
      event.preventDefault();

      const rawPlugin = event.dataTransfer.getData(
        "application/x-daw-plugin",
      );
      if (rawPlugin) {
        try {
          const payload = JSON.parse(rawPlugin);
          onAssignPluginToChannel(channel.id, payload);
          return;
        } catch {
          return;
        }
      }

      const rawSample = event.dataTransfer.getData(
        "application/x-daw-sample",
      );
      if (!rawSample) {
        return;
      }

      try {
        const payload = JSON.parse(rawSample);
        onAssignSampleToChannel(channel.id, payload);
      } catch {
        return;
      }
    },
    [channel.id, onAssignPluginToChannel, onAssignSampleToChannel],
  );

  return {
    handleMouseDown,
    handleDragOver,
    handleDrop,
  };
}
