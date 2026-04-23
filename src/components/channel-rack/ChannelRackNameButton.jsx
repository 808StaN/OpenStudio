import { memo } from "react";
import { getPluginInstrument } from "../../data/pluginInstruments";

/**
 * Channel title button with left-click (open settings)
 * and right-click (open context menu) behavior.
 */
export const ChannelRackNameButton = memo(function ChannelRackNameButton({
  channel,
  onOpenSampleSettings,
  onOpenChannelContextMenu,
}) {
  return (
    <button
      className="channel-name"
      title={
        channel.pluginRef
          ? "Instrument: " +
            (getPluginInstrument(channel.pluginRef)?.name || channel.name)
          : channel.sampleRef || "Drop WAV from Browser"
      }
      onClick={function (event) {
        event.stopPropagation();
        onOpenSampleSettings(channel.id);
      }}
      onContextMenu={function (event) {
        event.preventDefault();
        event.stopPropagation();
        onOpenChannelContextMenu(
          channel.id,
          event.currentTarget.getBoundingClientRect(),
        );
      }}
    >
      {channel.name}
    </button>
  );
});
