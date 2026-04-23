import { useCallback, useEffect, useRef, useState } from "react";

// Manage Reverb editor knobs: drag, wheel, reset, and inline numeric editing.
export const useReverbControlInteractions = function ({
  reverbParams,
  setReverbValue,
  clampFn,
  roundToStepFn,
  parseNumericInputFn,
}) {
  const reverbDragRef = useRef(null);
  const [draggingReverbParam, setDraggingReverbParam] = useState("");
  const [editingReverbParam, setEditingReverbParam] = useState("");
  const [editingReverbText, setEditingReverbText] = useState("");

  const adjustReverbValue = useCallback(
    function (control, rawValue) {
      const clampedValue = clampFn(rawValue, control.min, control.max);
      const stepped = roundToStepFn(clampedValue, control.step);
      setReverbValue(control.param, stepped);
    },
    [clampFn, roundToStepFn, setReverbValue],
  );

  const beginReverbDrag = function (event, control) {
    event.preventDefault();

    const startValue = Number(reverbParams[control.param] || 0);
    reverbDragRef.current = {
      param: control.param,
      startY: event.clientY,
      startValue,
      control,
    };
    setDraggingReverbParam(control.param);
  };

  const onReverbWheel = function (event, control) {
    event.preventDefault();
    const direction = event.deltaY < 0 ? 1 : -1;
    const current = Number(reverbParams[control.param] || 0);
    const wheelFactor = event.shiftKey ? 0.4 : 2;
    adjustReverbValue(
      control,
      current + direction * control.step * wheelFactor,
    );
  };

  const resetReverbControl = function (control) {
    adjustReverbValue(control, Number(control.defaultValue));
  };

  const beginReverbEdit = function (control) {
    const raw = Number(reverbParams[control.param] || 0);
    setEditingReverbParam(control.param);
    setEditingReverbText(String(roundToStepFn(raw, control.step)));
  };

  const commitReverbEdit = function (control) {
    const parsed = parseNumericInputFn(editingReverbText);
    if (parsed !== null) {
      adjustReverbValue(control, parsed);
    }
    setEditingReverbParam("");
    setEditingReverbText("");
  };

  useEffect(
    function () {
      if (!draggingReverbParam || !reverbDragRef.current) {
        return;
      }

      // Vertical drag adjusts value; Shift key lowers sensitivity for fine tuning.
      const onMouseMove = function (event) {
        const drag = reverbDragRef.current;
        if (!drag) {
          return;
        }

        const range = drag.control.max - drag.control.min;
        const delta = drag.startY - event.clientY;
        const valuePerPixel = range / (event.shiftKey ? 700 : 160);
        adjustReverbValue(
          drag.control,
          drag.startValue + delta * valuePerPixel,
        );
      };

      const onMouseUp = function () {
        reverbDragRef.current = null;
        setDraggingReverbParam("");
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);

      return function () {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };
    },
    [adjustReverbValue, draggingReverbParam],
  );

  return {
    draggingReverbParam,
    beginReverbDrag,
    onReverbWheel,
    resetReverbControl,
    editingReverbParam,
    editingReverbText,
    setEditingReverbParam,
    setEditingReverbText,
    commitReverbEdit,
    beginReverbEdit,
  };
};
