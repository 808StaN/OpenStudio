import { memo } from "react";
import { ChannelRackInsertSelect } from "./ChannelRackInsertSelect";
import { ChannelRackMuteSoloButtons } from "./ChannelRackMuteSoloButtons";
import { ChannelRackNameButton } from "./ChannelRackNameButton";
import { ChannelRackVolumePanControls } from "./ChannelRackVolumePanControls";

/**
 * Left-side control strip for a single channel row:
 * mute / solo toggles, volume / pan knobs, channel name button,
 * and an insert-routing dropdown.
 */
export const ChannelRackRowControls = memo(function ChannelRackRowControls({
  channel,
  mixerInserts,
  insertLabelById,
  openInsertMenuChannelId,
  onToggleMute,
  onToggleSolo,
  onSetVolume,
  onSetPan,
  onOpenSampleSettings,
  onOpenChannelContextMenu,
  onToggleInsertMenu,
  onAssignMixerInsert,
}) {
  const isInsertMenuOpen = openInsertMenuChannelId === channel.id;

  return (
    <div className="rack-controls">
      <ChannelRackMuteSoloButtons
        channelId={channel.id}
        muted={channel.muted}
        solo={channel.solo}
        onToggleMute={onToggleMute}
        onToggleSolo={onToggleSolo}
      />

      <ChannelRackVolumePanControls
        channelId={channel.id}
        volume={channel.volume}
        pan={channel.pan}
        onSetVolume={onSetVolume}
        onSetPan={onSetPan}
      />

      <ChannelRackNameButton
        channel={channel}
        onOpenSampleSettings={onOpenSampleSettings}
        onOpenChannelContextMenu={onOpenChannelContextMenu}
      />

      <ChannelRackInsertSelect
        channelId={channel.id}
        channelMixerInsertId={channel.mixerInsertId}
        mixerInserts={mixerInserts}
        insertLabelById={insertLabelById}
        isOpen={isInsertMenuOpen}
        onToggleInsertMenu={onToggleInsertMenu}
        onAssignMixerInsert={onAssignMixerInsert}
      />
    </div>
  );
});
