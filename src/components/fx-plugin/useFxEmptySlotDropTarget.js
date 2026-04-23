import { useCallback, useState } from "react";
import { isSupportedEffectType } from "./fxPluginUtils";

// Parse a transfer payload and keep only valid FX plugin drag objects.
const parseEffectPayload = function (raw) {
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

// Read effect payload from known drag data channels.
const readEffectPayloadFromDataTransfer = function (dataTransfer) {
  if (!dataTransfer) {
    return null;
  }

  return (
    parseEffectPayload(dataTransfer.getData("application/x-daw-effect")) ||
    parseEffectPayload(dataTransfer.getData("text/plain"))
  );
};

// Manage empty-slot drop target visuals and payload extraction.
export const useFxEmptySlotDropTarget = function (onEffectDrop) {
  const [isEmptyDropTarget, setIsEmptyDropTarget] = useState(false);

  // Highlight only when dragged data can contain effect payload.
  const onEmptySlotDragOver = useCallback(
    function (event) {
      const types = Array.from(event.dataTransfer?.types || []);
      const supportsEffectPayload =
        types.includes("application/x-daw-effect") ||
        types.includes("text/plain");

      if (!supportsEffectPayload) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "copy";
      setIsEmptyDropTarget(true);
    },
    [],
  );

  // Remove highlight when pointer leaves the drop target box.
  const onEmptySlotDragLeave = useCallback(
    function (event) {
      event.stopPropagation();

      const related = event.relatedTarget;
      const currentTarget = event.currentTarget;
      if (
        related &&
        currentTarget &&
        typeof currentTarget.contains === "function" &&
        currentTarget.contains(related)
      ) {
        return;
      }

      setIsEmptyDropTarget(false);
    },
    [],
  );

  // Resolve payload and delegate effect assignment to parent callback.
  const onEmptySlotDrop = useCallback(
    function (event) {
      event.preventDefault();
      event.stopPropagation();
      setIsEmptyDropTarget(false);

      const payload = readEffectPayloadFromDataTransfer(event.dataTransfer);
      if (!payload || typeof onEffectDrop !== "function") {
        return;
      }

      onEffectDrop(payload.effectType);
    },
    [onEffectDrop],
  );

  return {
    isEmptyDropTarget,
    onEmptySlotDragOver,
    onEmptySlotDragLeave,
    onEmptySlotDrop,
  };
};
