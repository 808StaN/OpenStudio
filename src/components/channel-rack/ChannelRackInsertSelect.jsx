import { memo } from "react";
import { getInsertLabel } from "./channelRackUtils";

/**
 * Custom insert selector rendered in-row with app-themed dropdown styles.
 */
export const ChannelRackInsertSelect = memo(function ChannelRackInsertSelect({
  channelId,
  channelMixerInsertId,
  mixerInserts,
  insertLabelById,
  isOpen,
  onToggleInsertMenu,
  onAssignMixerInsert,
}) {
  return (
    <label className="channel-insert">
      <div
        className={
          "channel-insert-select rack-modern-select" + (isOpen ? " is-open" : "")
        }
      >
        <button
          type="button"
          className="rack-modern-select-trigger"
          aria-label="Insert assignment"
          onClick={function (event) {
            event.stopPropagation();
            onToggleInsertMenu(channelId);
          }}
        >
          <span className="rack-modern-select-value">
            {insertLabelById[channelMixerInsertId] || "Insert 1"}
          </span>
        </button>
        {isOpen ? (
          <div className="rack-modern-select-dropdown">
            {mixerInserts.map(function (insert, index) {
              const label = getInsertLabel(insert, index);
              const isActive = insert.id === channelMixerInsertId;
              return (
                <button
                  key={insert.id}
                  type="button"
                  className={"rack-modern-select-option" + (isActive ? " is-active" : "")}
                  onClick={function (event) {
                    event.stopPropagation();
                    onAssignMixerInsert(channelId, insert.id);
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
  );
});
