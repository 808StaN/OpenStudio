// Top toolbar for Piano Roll: channel/snap/scale menus, import/export and edit mode.
export function PianoRollToolbar(props) {
  const {
    channelMenuRef,
    snapMenuRef,
    scaleRootMenuRef,
    scaleTypeMenuRef,
    midiImportInputRef,
    activeChannel,
    channels,
    isChannelMenuOpen,
    setIsChannelMenuOpen,
    isSnapMenuOpen,
    setIsSnapMenuOpen,
    isScaleRootMenuOpen,
    setIsScaleRootMenuOpen,
    isScaleTypeMenuOpen,
    setIsScaleTypeMenuOpen,
    onSelectChannel,
    onImportMidiClick,
    onExportMidiClick,
    onImportMidiFileChange,
    editMode,
    setEditMode,
    setSelectedNoteIds,
    activeSnap,
    SNAP_OPTIONS,
    snapKey,
    setSnapKey,
    scaleRoot,
    scaleType,
    activeScale,
    SCALE_ROOTS,
    SCALE_TYPES,
    onSelectScaleRoot,
    onSelectScaleType,
  } = props;

  return (
    <header className="piano-roll-toolbar">
      <div className="snap-menu channel-menu" ref={channelMenuRef}>
        <button
          type="button"
          className="snap-trigger"
          onClick={function () {
            setIsChannelMenuOpen(function (value) {
              const next = !value;
              setIsSnapMenuOpen(false);
              setIsScaleRootMenuOpen(false);
              setIsScaleTypeMenuOpen(false);
              return next;
            });
          }}
        >
          Channel: {activeChannel?.name || "-"}
        </button>
        {isChannelMenuOpen ? (
          <div className="snap-dropdown">
            {channels.map(function (channel) {
              return (
                <label key={channel.id} className="snap-option">
                  <input
                    type="radio"
                    name="piano-roll-channel"
                    checked={(activeChannel?.id || "") === channel.id}
                    onChange={function () {
                      onSelectChannel(channel.id);
                      setIsChannelMenuOpen(false);
                    }}
                  />
                  <span>{channel.name}</span>
                </label>
              );
            })}
          </div>
        ) : null}
      </div>

      <button type="button" className="snap-trigger" onClick={onImportMidiClick}>
        Import MIDI
      </button>
      <button type="button" className="snap-trigger" onClick={onExportMidiClick}>
        Export MIDI
      </button>
      <input
        ref={midiImportInputRef}
        type="file"
        accept=".mid,.midi,audio/midi,audio/x-midi"
        style={{ display: "none" }}
        onChange={function (event) {
          void onImportMidiFileChange(event);
        }}
      />

      <div className="edit-mode-toggle">
        <button
          type="button"
          className={editMode === "add" ? "is-active" : ""}
          onClick={function () {
            setEditMode("add");
            setSelectedNoteIds([]);
          }}
        >
          Add Notes
        </button>
        <button
          type="button"
          className={editMode === "select" ? "is-active" : ""}
          onClick={function () {
            setEditMode("select");
          }}
        >
          Select
        </button>
      </div>

      <div className="snap-menu" ref={snapMenuRef}>
        <button
          type="button"
          className="snap-trigger"
          onClick={function () {
            setIsSnapMenuOpen(function (value) {
              const next = !value;
              setIsChannelMenuOpen(false);
              setIsScaleRootMenuOpen(false);
              setIsScaleTypeMenuOpen(false);
              return next;
            });
          }}
        >
          Snap: {activeSnap.label}
        </button>
        {isSnapMenuOpen ? (
          <div className="snap-dropdown">
            {SNAP_OPTIONS.map(function (option) {
              return (
                <label key={option.key} className="snap-option">
                  <input
                    type="radio"
                    name="piano-roll-snap"
                    checked={snapKey === option.key}
                    onChange={function () {
                      setSnapKey(option.key);
                      setIsSnapMenuOpen(false);
                    }}
                  />
                  <span>{option.label}</span>
                </label>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="scale-controls">
        <span>Scale:</span>
        <div className="snap-menu scale-menu" ref={scaleRootMenuRef}>
          <button
            type="button"
            className="snap-trigger"
            onClick={function () {
              setIsScaleRootMenuOpen(function (value) {
                const next = !value;
                setIsScaleTypeMenuOpen(false);
                setIsChannelMenuOpen(false);
                setIsSnapMenuOpen(false);
                return next;
              });
            }}
          >
            {scaleRoot}
          </button>
          {isScaleRootMenuOpen ? (
            <div className="snap-dropdown">
              {SCALE_ROOTS.map(function (noteName) {
                return (
                  <label key={noteName} className="snap-option">
                    <input
                      type="radio"
                      name="piano-roll-scale-root"
                      checked={scaleRoot === noteName}
                      onChange={function () {
                        onSelectScaleRoot(noteName);
                        setIsScaleRootMenuOpen(false);
                      }}
                    />
                    <span>{noteName}</span>
                  </label>
                );
              })}
            </div>
          ) : null}
        </div>

        <div className="snap-menu scale-menu" ref={scaleTypeMenuRef}>
          <button
            type="button"
            className="snap-trigger"
            onClick={function () {
              setIsScaleTypeMenuOpen(function (value) {
                const next = !value;
                setIsScaleRootMenuOpen(false);
                setIsChannelMenuOpen(false);
                setIsSnapMenuOpen(false);
                return next;
              });
            }}
          >
            {activeScale.label}
          </button>
          {isScaleTypeMenuOpen ? (
            <div className="snap-dropdown">
              {SCALE_TYPES.map(function (item) {
                return (
                  <label key={item.key} className="snap-option">
                    <input
                      type="radio"
                      name="piano-roll-scale-type"
                      checked={scaleType === item.key}
                      onChange={function () {
                        onSelectScaleType(item.key);
                        setIsScaleTypeMenuOpen(false);
                      }}
                    />
                    <span>{item.label}</span>
                  </label>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>

      <small>
        {editMode === "add"
          ? "LMB add. LMB drag note to move, right edge to resize. RMB delete."
          : "Drag to select. Move selected with mouse. Ctrl+C/X/V, Delete, Arrow Up/Down (scale), Shift+Arrow +/-1, Ctrl+Arrow +/-12."}{" "}
        Drop MID file on Piano Roll (from Drumkits Browser or your computer) to
        paste melody. Import MIDI opens file picker. Export MIDI saves current
        channel melody. Wheel: up/down, Ctrl+Wheel: zoom.
      </small>
    </header>
  );
}
