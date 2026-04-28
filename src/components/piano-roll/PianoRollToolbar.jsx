import { DropdownMenu } from "../common/DropdownMenu";

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
      <div className="channel-menu" ref={channelMenuRef}>
        <DropdownMenu
          triggerClassName="snap-trigger"
          triggerLabel={"Channel: " + (activeChannel?.name || "-")}
          isOpen={isChannelMenuOpen}
          setIsOpen={setIsChannelMenuOpen}
          options={channels.map(function (channel) {
            return { key: channel.id, label: channel.name };
          })}
          activeKey={activeChannel?.id || ""}
          onSelect={onSelectChannel}
          radioName="piano-roll-channel"
          onTriggerClick={function () {
            setIsChannelMenuOpen(function (value) {
              const next = !value;
              setIsSnapMenuOpen(false);
              setIsScaleRootMenuOpen(false);
              setIsScaleTypeMenuOpen(false);
              return next;
            });
          }}
        />
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

      <DropdownMenu
        menuRef={snapMenuRef}
        triggerClassName="snap-trigger"
        triggerLabel={"Snap: " + activeSnap.label}
        isOpen={isSnapMenuOpen}
        setIsOpen={setIsSnapMenuOpen}
        options={SNAP_OPTIONS}
        activeKey={snapKey}
        onSelect={setSnapKey}
        radioName="piano-roll-snap"
        onTriggerClick={function () {
          setIsSnapMenuOpen(function (value) {
            const next = !value;
            setIsChannelMenuOpen(false);
            setIsScaleRootMenuOpen(false);
            setIsScaleTypeMenuOpen(false);
            return next;
          });
        }}
      />

      <div className="scale-controls">
        <span>Scale:</span>
        <div className="scale-menu" ref={scaleRootMenuRef}>
          <DropdownMenu
            triggerClassName="snap-trigger"
            triggerLabel={scaleRoot}
            isOpen={isScaleRootMenuOpen}
            setIsOpen={setIsScaleRootMenuOpen}
            options={SCALE_ROOTS.map(function (noteName) {
              return { key: noteName, label: noteName };
            })}
            activeKey={scaleRoot}
            onSelect={onSelectScaleRoot}
            radioName="piano-roll-scale-root"
            onTriggerClick={function () {
              setIsScaleRootMenuOpen(function (value) {
                const next = !value;
                setIsScaleTypeMenuOpen(false);
                setIsChannelMenuOpen(false);
                setIsSnapMenuOpen(false);
                return next;
              });
            }}
          />
        </div>

        <div className="scale-menu" ref={scaleTypeMenuRef}>
          <DropdownMenu
            triggerClassName="snap-trigger"
            triggerLabel={activeScale.label}
            isOpen={isScaleTypeMenuOpen}
            setIsOpen={setIsScaleTypeMenuOpen}
            options={SCALE_TYPES}
            activeKey={scaleType}
            onSelect={onSelectScaleType}
            radioName="piano-roll-scale-type"
            onTriggerClick={function () {
              setIsScaleTypeMenuOpen(function (value) {
                const next = !value;
                setIsScaleRootMenuOpen(false);
                setIsChannelMenuOpen(false);
                setIsSnapMenuOpen(false);
                return next;
              });
            }}
          />
        </div>
      </div>


    </header>
  );
}
