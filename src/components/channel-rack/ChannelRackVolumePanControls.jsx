import { memo } from "react";
import { HorizontalSlider } from "../common/HorizontalSlider";

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
        <HorizontalSlider
          className="rack-knob"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onReset={function () {
            onSetVolume(channelId, 1);
          }}
          onChange={function (nextValue) {
            onSetVolume(channelId, nextValue);
          }}
        />
      </label>

      <label className="knob-label">
        Pan
        <HorizontalSlider
          className="rack-knob"
          min={-1}
          max={1}
          step={0.01}
          value={pan}
          onReset={function () {
            onSetPan(channelId, 0);
          }}
          onChange={function (nextValue) {
            onSetPan(channelId, nextValue);
          }}
        />
      </label>
    </>
  );
});
