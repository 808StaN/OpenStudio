import { memo } from "react";

/**
 * Step sequencer grid for a single channel row.
 * Each step is a button that toggles on/off with mouse down / right-click.
 * The playhead highlight is shown when playback is active.
 */
export const ChannelRackStepGrid = memo(function ChannelRackStepGrid({
  channel,
  activePatternId,
  patternLength,
  row,
  isPlaying,
  hasAnyStepNotes,
  playheadStep,
  onToggleStep,
  onMidiPatternDragOver,
  onMidiPatternDrop,
}) {
  return (
    <div
      className="step-grid"
      onDragOver={onMidiPatternDragOver}
      onDrop={function (event) {
        void onMidiPatternDrop(event, channel);
      }}
      style={{
        gridTemplateColumns:
          "repeat(" + patternLength + ", var(--step-cell-width, 28px))",
      }}
    >
      {row.map(function (isOn, stepIndex) {
        return (
          <button
            key={channel.id + "-" + stepIndex}
            type="button"
            className={
              "step" +
              (Math.floor(stepIndex / 4) % 2 === 0 ? " group-a" : " group-b") +
              (isOn ? " is-on" : "") +
              (isPlaying && hasAnyStepNotes && playheadStep === stepIndex
                ? " is-playhead"
                : "")
            }
            onMouseDown={function (event) {
              if (event.button === 0 && !isOn) {
                onToggleStep(activePatternId, channel.id, stepIndex);
              }

              if (event.button === 2 && isOn) {
                event.preventDefault();
                onToggleStep(activePatternId, channel.id, stepIndex);
              }
            }}
            onContextMenu={function (event) {
              event.preventDefault();
            }}
          />
        );
      })}
    </div>
  );
});
