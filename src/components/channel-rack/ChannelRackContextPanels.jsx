// Context panel for channel actions opened by right-clicking channel name.
export function ChannelContextMenuPanel(props) {
  const {
    channelContextMenu,
    channelsCount,
    onCloneChannel,
    onRemoveChannel,
    onBeginRenameChannel,
  } = props;

  if (!channelContextMenu) {
    return null;
  }

  return (
    <div
      className="rack-channel-context-menu"
      style={{
        left: channelContextMenu.x + "px",
        top: channelContextMenu.y + "px",
      }}
    >
      <button type="button" onClick={onCloneChannel}>
        Clone Channel
      </button>
      <button type="button" disabled={channelsCount <= 1} onClick={onRemoveChannel}>
        Remove Channel
      </button>
      <button type="button" onClick={onBeginRenameChannel}>
        Rename Channel
      </button>
    </div>
  );
}

// Inline rename panel rendered near the channel context menu.
export function ChannelRenamePanel(props) {
  const { renamePanel, onChangeValue, onSave, onCancel, onKeyDown } = props;

  if (!renamePanel) {
    return null;
  }

  return (
    <div
      className="rack-channel-rename-panel"
      style={{
        left: renamePanel.x + "px",
        top: renamePanel.y + "px",
      }}
    >
      <input
        autoFocus
        value={renamePanel.value}
        maxLength={14}
        onChange={onChangeValue}
        onKeyDown={onKeyDown}
      />
      <div className="rack-channel-rename-actions">
        <button type="button" onClick={onSave}>
          Save
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
