import { isSupportedEffectType } from "./mixerUiUtils";

// Encapsulates drag-and-drop behavior for loading effects into mixer slots.
export function useMixerFxDropHandlers({
  dropTargetSlotId,
  setDropTargetSlotId,
  setArmedFxClearSlotId,
  selectedInsert,
  fxSlots,
  dispatch,
  setFxSlotEffectTypeAction,
  toggleFxSlotAction,
  getInsertLabel,
  getFxSlotName,
  showValueReadout,
  setSelectedFxSlotId,
}) {
  const readEffectPayloadFromDataTransfer = function (dataTransfer) {
    if (!dataTransfer) {
      return null;
    }

    const parsePayload = function (raw) {
      if (!raw) {
        return null;
      }

      try {
        const payload = JSON.parse(raw);
        if (
          payload &&
          payload.type === "effect" &&
          isSupportedEffectType(payload.effectType)
        ) {
          return payload;
        }
      } catch {
        return null;
      }

      return null;
    };

    return (
      parsePayload(dataTransfer.getData("application/x-daw-effect")) ||
      parsePayload(dataTransfer.getData("text/plain"))
    );
  };

  const onFxSlotDragOver = function (event, slot) {
    const types = Array.from(event.dataTransfer?.types || []);
    const supportsEffectPayload =
      types.includes("application/x-daw-effect") ||
      types.includes("text/plain");

    if (!supportsEffectPayload) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";

    if (dropTargetSlotId !== slot.id) {
      setDropTargetSlotId(slot.id);
    }
  };

  const onFxSlotDragLeave = function (event, slot) {
    const related = event.relatedTarget;
    if (
      related instanceof Node &&
      event.currentTarget instanceof Node &&
      event.currentTarget.contains(related)
    ) {
      return;
    }

    if (dropTargetSlotId === slot.id) {
      setDropTargetSlotId(null);
    }
  };

  const onFxSlotDrop = function (event, slot) {
    event.preventDefault();
    setDropTargetSlotId(null);
    setArmedFxClearSlotId(null);

    const payload = readEffectPayloadFromDataTransfer(event.dataTransfer);
    if (!payload) {
      return;
    }

    dispatch(
      setFxSlotEffectTypeAction({
        insertId: selectedInsert.id,
        slotId: slot.id,
        effectType: payload.effectType,
      }),
    );

    if (!(slot.effectType === payload.effectType && slot.enabled)) {
      dispatch(
        toggleFxSlotAction({
          insertId: selectedInsert.id,
          slotId: slot.id,
        }),
      );
    }

    const slotIndex = fxSlots.findIndex(function (item) {
      return item.id === slot.id;
    });

    setSelectedFxSlotId(slot.id);
    showValueReadout(
      getInsertLabel(selectedInsert) +
        " loaded " +
        (payload.effectName || "Graphic EQ") +
        " on " +
        getFxSlotName(slot, Math.max(0, slotIndex)),
    );
  };

  return {
    onFxSlotDragOver,
    onFxSlotDragLeave,
    onFxSlotDrop,
  };
}
