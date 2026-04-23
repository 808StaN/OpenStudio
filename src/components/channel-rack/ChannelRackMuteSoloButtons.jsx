import { memo } from "react";

/**
 * Compact M/S toggles used in each channel row.
 * Kept isolated so controls can evolve without touching the whole row strip.
 */
export const ChannelRackMuteSoloButtons = memo(function ChannelRackMuteSoloButtons({
  channelId,
  muted,
  solo,
  onToggleMute,
  onToggleSolo,
}) {
  return (
    <>
      <button
        className={"small-toggle" + (muted ? " is-on" : "")}
        onClick={function () {
          onToggleMute(channelId, !muted);
        }}
      >
        M
      </button>
      <button
        className={"small-toggle" + (solo ? " is-on" : "")}
        onClick={function () {
          onToggleSolo(channelId, !solo);
        }}
      >
        S
      </button>
    </>
  );
});
