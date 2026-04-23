import { memo } from "react";
import { getPluginInstrument } from "../../data/pluginInstruments";
import { getInsertLabel } from "./channelRackUtils";

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
      <button
        className={"small-toggle" + (channel.muted ? " is-on" : "")}
        onClick={function () {
          onToggleMute(channel.id, !channel.muted);
        }}
      >
        M
      </button>
      <button
        className={"small-toggle" + (channel.solo ? " is-on" : "")}
        onClick={function () {
          onToggleSolo(channel.id, !channel.solo);
        }}
      >
        S
      </button>

      <label className="knob-label">
        Vol
        <input
          className="rack-knob"
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={channel.volume}
          onDoubleClick={function () {
            onSetVolume(channel.id, 1);
          }}
          onChange={function (event) {
            onSetVolume(channel.id, Number(event.target.value));
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
          value={channel.pan}
          onDoubleClick={function () {
            onSetPan(channel.id, 0);
          }}
          onChange={function (event) {
            onSetPan(channel.id, Number(event.target.value));
          }}
        />
      </label>

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

      <label className="channel-insert">
        <div
          className={
            "channel-insert-select rack-modern-select" +
            (isInsertMenuOpen ? " is-open" : "")
          }
        >
          <button
            type="button"
            className="rack-modern-select-trigger"
            aria-label="Insert assignment"
            onClick={function (event) {
              event.stopPropagation();
              onToggleInsertMenu(channel.id);
            }}
          >
            <span className="rack-modern-select-value">
              {insertLabelById[channel.mixerInsertId] || "Insert 1"}
            </span>
            <span className="rack-modern-select-caret">v</span>
          </button>
          {isInsertMenuOpen ? (
            <div className="rack-modern-select-dropdown">
              {mixerInserts.map(function (insert, index) {
                const label = getInsertLabel(insert, index);
                const isActive = insert.id === channel.mixerInsertId;
                return (
                  <button
                    key={insert.id}
                    type="button"
                    className={
                      "rack-modern-select-option" + (isActive ? " is-active" : "")
                    }
                    onClick={function (event) {
                      event.stopPropagation();
                      onAssignMixerInsert(channel.id, insert.id);
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </label>
    </div>
  );
});
