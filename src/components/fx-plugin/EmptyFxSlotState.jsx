// Generic empty slot/drop target renderer for FX window.
export function EmptyFxSlotState({
  isEmptyDropTarget,
  onEmptySlotDragOver,
  onEmptySlotDragLeave,
  onEmptySlotDrop,
}) {
  return (
    <section className="fx-plugin-panel fx-window-panel">
      <div
        // Highlighted style appears only while a valid effect payload is hovering.
        className={"fx-empty-slot" + (isEmptyDropTarget ? " is-drop-target" : "")}
        onDragOver={onEmptySlotDragOver}
        onDragLeave={onEmptySlotDragLeave}
        onDrop={onEmptySlotDrop}
      >
        <p>This slot is empty.</p>
        <p>Drag an effect from Browser/Plugins/Effects and drop it here.</p>
      </div>
    </section>
  );
}
