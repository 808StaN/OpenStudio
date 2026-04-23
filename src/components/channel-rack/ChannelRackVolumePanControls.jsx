import { memo } from "react";

/**
 * Volume/Pan slider pair for a channel strip.
 * Double-click resets to neutral defaults.
 */
export const ChannelRackVolumePanControls = memo(function ChannelRackVolumePanControls({
  channelId,
  volume,
  pan,
  onSetVolume,
  onSetPan,
}) {
  return (
    <>
      <label className="knob-label">
        Vol
        <input
          className="rack-knob"
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={volume}
          onDoubleClick={function () {
            onSetVolume(channelId, 1);
          }}
          onChange={function (event) {
            onSetVolume(channelId, Number(event.target.value));
          }}
        />
      </label>

      <label className="knob-label">
        Pan
        <input
          className="rack-knob"
          type="range"
          min="-1"
          max="1"
          step="0.01"
          value={pan}
          onDoubleClick={function () {
            onSetPan(channelId, 0);
          }}
          onChange={function (event) {
            onSetPan(channelId, Number(event.target.value));
          }}
        />
      </label>
    </>
  );
});
