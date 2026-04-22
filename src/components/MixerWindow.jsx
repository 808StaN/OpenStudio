import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  addMixerTrack,
  openWindow,
  selectInsert,
  setFxEditorTarget,
  setFxSlotEffectType,
  setInsertActive,
  setInsertFader,
  setInsertPan,
  setInsertStereo,
  toggleFxSlot,
} from "../store";
import { useMixerFxDropHandlers } from "./mixer/useMixerFxDropHandlers";
import { MixerFxSlotsPanel } from "./mixer/MixerFxSlotsPanel";
import { MixerTrackList } from "./mixer/MixerTrackList";
import {
  FX_EFFECT_NONE,
  formatPercentValue,
  formatSignedPercentValue,
  getFxSlotName,
  getInsertLabel,
  isSupportedEffectType,
} from "./mixer/mixerUiUtils";

export function MixerWindow() {
  const dispatch = useDispatch();
  const [valueReadout, setValueReadout] = useState("");
  const [selectedFxSlotId, setSelectedFxSlotId] = useState(null);
  const [dropTargetSlotId, setDropTargetSlotId] = useState(null);
  const [armedFxClearSlotId, setArmedFxClearSlotId] = useState(null);
  const clearReadoutTimeoutRef = useRef(null);

  const inserts = useSelector(function (state) {
    return state.daw.mixer.inserts;
  });
  const selectedInsertId = useSelector(function (state) {
    return state.daw.mixer.selectedInsertId;
  });

  const selectedInsert =
    inserts.find(function (item) {
      return item.id === selectedInsertId;
    }) || inserts[0];
  const fxSlots = Array.isArray(selectedInsert?.fxSlots)
    ? selectedInsert.fxSlots
    : [];
  // Keep selection stable even when insert/fx layout changes after Redux updates.
  const activeSelectedFxSlotId =
    selectedFxSlotId &&
    fxSlots.some(function (slot) {
      return slot.id === selectedFxSlotId;
    })
      ? selectedFxSlotId
      : fxSlots[0]?.id || null;
  // Auto-expire armed clear state when slot/effect is no longer present.
  const activeArmedFxClearSlotId =
    armedFxClearSlotId &&
    fxSlots.some(function (slot) {
      return (
        slot.id === armedFxClearSlotId && slot.effectType !== FX_EFFECT_NONE
      );
    })
      ? armedFxClearSlotId
      : null;

  useEffect(function () {
    return function () {
      if (clearReadoutTimeoutRef.current) {
        clearTimeout(clearReadoutTimeoutRef.current);
      }
    };
  }, []);

  const showValueReadout = function (text) {
    setValueReadout(text);

    if (clearReadoutTimeoutRef.current) {
      clearTimeout(clearReadoutTimeoutRef.current);
    }

    clearReadoutTimeoutRef.current = setTimeout(function () {
      setValueReadout("");
    }, 1700);
  };

  const resetPan = function (insert) {
    const nextValue = 0;
    const trackLabel = getInsertLabel(insert);
    dispatch(
      setInsertPan({
        insertId: insert.id,
        value: nextValue,
      }),
    );
    showValueReadout(
      trackLabel + " Pan: " + formatSignedPercentValue(nextValue),
    );
  };

  const resetStereo = function (insert) {
    const nextValue = 0;
    const trackLabel = getInsertLabel(insert);
    dispatch(
      setInsertStereo({
        insertId: insert.id,
        value: nextValue,
      }),
    );
    showValueReadout(
      trackLabel + " Stereo: " + formatSignedPercentValue(nextValue),
    );
  };

  const resetVolume = function (insert) {
    const nextValue = 1;
    const trackLabel = getInsertLabel(insert);
    dispatch(
      setInsertFader({
        insertId: insert.id,
        value: nextValue,
      }),
    );
    showValueReadout(trackLabel + " Volume: " + formatPercentValue(nextValue));
  };

  const openFxEditorForSlot = function (slotId) {
    if (!selectedInsert || !slotId) {
      return;
    }

    dispatch(
      setFxEditorTarget({
        insertId: selectedInsert.id,
        slotId,
      }),
    );
    dispatch(openWindow("fxPlugin"));
  };

  // Drag/drop handlers are extracted so the component body stays focused on view wiring.
  const { onFxSlotDragOver, onFxSlotDragLeave, onFxSlotDrop } =
    useMixerFxDropHandlers({
      dropTargetSlotId,
      setDropTargetSlotId,
      setArmedFxClearSlotId,
      selectedInsert,
      fxSlots,
      dispatch,
      setFxSlotEffectTypeAction: setFxSlotEffectType,
      toggleFxSlotAction: toggleFxSlot,
      getInsertLabel,
      getFxSlotName,
      showValueReadout,
      setSelectedFxSlotId,
    });

  const onSelectInsert = function (insertId) {
    dispatch(selectInsert(insertId));
  };

  const onToggleInsertActive = function (insert) {
    const nextValue = !insert.active;
    const trackLabel = getInsertLabel(insert);
    dispatch(
      setInsertActive({
        insertId: insert.id,
        value: nextValue,
      }),
    );
    showValueReadout(trackLabel + " Active: " + (nextValue ? "ON" : "OFF"));
  };

  const onPanChange = function (insert, nextValue) {
    const trackLabel = getInsertLabel(insert);
    dispatch(
      setInsertPan({
        insertId: insert.id,
        value: nextValue,
      }),
    );
    showValueReadout(trackLabel + " Pan: " + formatSignedPercentValue(nextValue));
  };

  const onStereoChange = function (insert, nextValue) {
    const trackLabel = getInsertLabel(insert);
    dispatch(
      setInsertStereo({
        insertId: insert.id,
        value: nextValue,
      }),
    );
    showValueReadout(
      trackLabel + " Stereo: " + formatSignedPercentValue(nextValue),
    );
  };

  const onFaderChange = function (insert, nextValue) {
    const trackLabel = getInsertLabel(insert);
    dispatch(
      setInsertFader({
        insertId: insert.id,
        value: nextValue,
      }),
    );
    showValueReadout(trackLabel + " Volume: " + formatPercentValue(nextValue));
  };

  const onSelectSlot = function (slotId) {
    if (activeArmedFxClearSlotId) {
      setArmedFxClearSlotId(null);
    }
    setSelectedFxSlotId(slotId);
    openFxEditorForSlot(slotId);
  };

  const onToggleSlotPower = function (slot, slotName) {
    if (activeArmedFxClearSlotId) {
      setArmedFxClearSlotId(null);
    }

    if (!isSupportedEffectType(slot.effectType)) {
      return;
    }

    dispatch(
      toggleFxSlot({
        insertId: selectedInsert.id,
        slotId: slot.id,
      }),
    );

    showValueReadout(
      getInsertLabel(selectedInsert) +
        " " +
        slotName +
        ": " +
        (!slot.enabled ? "ON" : "OFF"),
    );
  };

  const onArmSlotClear = function (slotId, slotName) {
    setArmedFxClearSlotId(slotId);
    showValueReadout("Click X again to remove " + slotName);
  };

  const onConfirmSlotClear = function (slotId, slotName) {
    setArmedFxClearSlotId(null);

    dispatch(
      setFxSlotEffectType({
        insertId: selectedInsert.id,
        slotId,
        effectType: FX_EFFECT_NONE,
      }),
    );

    showValueReadout(getInsertLabel(selectedInsert) + " cleared " + slotName);
  };

  return (
    <div className="mixer-root">
      <MixerTrackList
        inserts={inserts}
        selectedInsertId={selectedInsertId}
        getInsertLabel={getInsertLabel}
        onSelectInsert={onSelectInsert}
        onToggleInsertActive={onToggleInsertActive}
        onPanChange={onPanChange}
        onPanReset={resetPan}
        onStereoChange={onStereoChange}
        onStereoReset={resetStereo}
        onFaderChange={onFaderChange}
        onFaderReset={resetVolume}
      />

      <MixerFxSlotsPanel
        fxSlots={fxSlots}
        dropTargetSlotId={dropTargetSlotId}
        activeSelectedFxSlotId={activeSelectedFxSlotId}
        activeArmedFxClearSlotId={activeArmedFxClearSlotId}
        getFxSlotName={getFxSlotName}
        onAddInsert={function () {
          dispatch(addMixerTrack());
        }}
        onSelectSlot={onSelectSlot}
        onDragOverSlot={onFxSlotDragOver}
        onDragLeaveSlot={onFxSlotDragLeave}
        onDropSlot={onFxSlotDrop}
        onToggleSlotPower={onToggleSlotPower}
        onArmSlotClear={onArmSlotClear}
        onConfirmSlotClear={onConfirmSlotClear}
      />

      <div
        className={"mixer-value-readout" + (valueReadout ? " is-visible" : "")}
      >
        {valueReadout}
      </div>
    </div>
  );
}
