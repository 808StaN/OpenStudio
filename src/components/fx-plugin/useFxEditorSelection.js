import { useMemo } from "react";
import { useSelector } from "react-redux";
import {
  getSafeGraphicEqParams,
  getSafeMaximizerParams,
  getSafeReverbParams,
} from "../../audio/domain/fxParams";

// Resolves current editor target (insert/slot) and sanitized params.
// Keeps FxPluginWindow focused on interaction wiring instead of store plumbing.
export function useFxEditorSelection() {
  const inserts = useSelector(function (state) {
    return state.daw.mixer.inserts;
  });
  const selectedInsertId = useSelector(function (state) {
    return state.daw.mixer.selectedInsertId;
  });
  const fxEditorTarget = useSelector(function (state) {
    return state.daw.ui.fxEditorTarget;
  });

  const activeInsert =
    inserts.find(function (insert) {
      return insert.id === fxEditorTarget?.insertId;
    }) ||
    inserts.find(function (insert) {
      return insert.id === selectedInsertId;
    }) ||
    inserts[0] ||
    null;

  const fxSlots = Array.isArray(activeInsert?.fxSlots) ? activeInsert.fxSlots : [];
  const activeSlot =
    fxSlots.find(function (slot) {
      return slot.id === fxEditorTarget?.slotId;
    }) ||
    fxSlots[0] ||
    null;

  const activeInsertId = activeInsert?.id || "";
  const activeSlotId = activeSlot?.id || "";

  const reverbParams = useMemo(
    function () {
      return getSafeReverbParams(activeSlot?.params);
    },
    [activeSlot?.params],
  );
  const eqParams = useMemo(
    function () {
      return getSafeGraphicEqParams(activeSlot?.params);
    },
    [activeSlot?.params],
  );
  const maximizerParams = useMemo(
    function () {
      return getSafeMaximizerParams(activeSlot?.params);
    },
    [activeSlot?.params],
  );

  return {
    activeInsert,
    activeSlot,
    activeInsertId,
    activeSlotId,
    eqParams,
    reverbParams,
    maximizerParams,
  };
}
