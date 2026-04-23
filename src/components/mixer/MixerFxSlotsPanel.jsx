import { ChevronRight, Power } from "lucide-react";
import { FX_EFFECT_NONE, isSupportedEffectType } from "./mixerUiUtils";

// Renders mixer FX slots panel (right side) and delegates all behavior to parent callbacks.
export function MixerFxSlotsPanel({
  fxSlots,
  dropTargetSlotId,
  activeSelectedFxSlotId,
  activeArmedFxClearSlotId,
  getFxSlotName,
  onAddInsert,
  onSelectSlot,
  onDragOverSlot,
  onDragLeaveSlot,
  onDropSlot,
  onToggleSlotPower,
  onArmSlotClear,
  onConfirmSlotClear,
}) {
  return (
    <aside className="mixer-right">
      <div className="mixer-right-header">
        <div className="fx-header">FX Slots</div>
        <button className="mixer-track-add" type="button" onClick={onAddInsert}>
          + Insert
        </button>
      </div>

      <div className="fx-list">
        {fxSlots.map(function (slot, slotIndex) {
          const slotName = getFxSlotName(slot, slotIndex);
          const hasLoadedEffect = slot.effectType !== FX_EFFECT_NONE;

          return (
            <div
              className={
                "fx-row" +
                (slot.id === activeSelectedFxSlotId ? " is-selected" : "") +
                (slot.id === dropTargetSlotId ? " is-drop-target" : "")
              }
              key={slot.id}
              onClick={function () {
                onSelectSlot(slot.id);
              }}
              onDragOver={function (event) {
                onDragOverSlot(event, slot);
              }}
              onDragLeave={function (event) {
                onDragLeaveSlot(event, slot);
              }}
              onDrop={function (event) {
                onDropSlot(event, slot);
              }}
            >
              <button
                className={
                  "fx-power" +
                  (slot.enabled ? " is-on" : "") +
                  (isSupportedEffectType(slot.effectType) ? "" : " is-disabled")
                }
                title={
                  isSupportedEffectType(slot.effectType)
                    ? slot.enabled
                      ? "Bypass FX"
                      : "Enable FX"
                    : "Empty slot"
                }
                onClick={function (event) {
                  event.stopPropagation();
                  onToggleSlotPower(slot, slotName);
                }}
              >
                <Power size={12} />
              </button>

              <span className="fx-name">{slotName}</span>

              {hasLoadedEffect ? (
                <button
                  type="button"
                  className={
                    "fx-clear" +
                    (activeArmedFxClearSlotId === slot.id ? " is-armed" : "")
                  }
                  title={
                    activeArmedFxClearSlotId === slot.id
                      ? "Click again to confirm removal"
                      : "Remove effect"
                  }
                  onClick={function (event) {
                    event.stopPropagation();
                    if (activeArmedFxClearSlotId !== slot.id) {
                      onArmSlotClear(slot.id, slotName);
                      return;
                    }

                    onConfirmSlotClear(slot.id, slotName);
                  }}
                >
                  <span className="fx-clear-glyph">X</span>
                </button>
              ) : (
                <ChevronRight size={14} className="fx-arrow" />
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
