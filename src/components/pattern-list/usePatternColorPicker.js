import { useEffect, useRef, useState } from "react";
import { setPatternColor } from "../../store";
import { clamp, hexToRgb, hsvToRgb, rgbToHex, rgbToHsv } from "./patternListColorUtils";

// Manage per-pattern HSV picker state and throttled Redux color writes.
export const usePatternColorPicker = function ({
  dispatch,
  defaultPatternColor,
}) {
  const [pickerStateByPatternId, setPickerStateByPatternId] = useState({});
  const colorRafMapRef = useRef(new Map());
  const pendingColorMapRef = useRef(new Map());

  // Cancel pending RAF color updates when component unmounts.
  useEffect(function () {
    const rafMap = colorRafMapRef.current;
    const pendingMap = pendingColorMapRef.current;

    return function () {
      rafMap.forEach(function (rafId) {
        cancelAnimationFrame(rafId);
      });
      rafMap.clear();
      pendingMap.clear();
    };
  }, []);

  // Batch rapid picker drags to one Redux update per animation frame.
  const queuePatternColorUpdate = function (patternId, color) {
    pendingColorMapRef.current.set(patternId, color);

    if (colorRafMapRef.current.has(patternId)) {
      return;
    }

    const rafId = requestAnimationFrame(function () {
      colorRafMapRef.current.delete(patternId);
      const nextColor = pendingColorMapRef.current.get(patternId);
      pendingColorMapRef.current.delete(patternId);
      if (!nextColor) {
        return;
      }

      dispatch(
        setPatternColor({
          patternId,
          color: nextColor,
        }),
      );
    });

    colorRafMapRef.current.set(patternId, rafId);
  };

  const getPickerStateForPattern = function (pattern) {
    const patternId = pattern.id;
    const existing = pickerStateByPatternId[patternId];
    if (existing) {
      return existing;
    }

    return rgbToHsv(hexToRgb(pattern.color || defaultPatternColor));
  };

  const updatePickerColor = function (pattern, nextPartial) {
    const patternId = pattern.id;
    const current = getPickerStateForPattern(pattern);
    const next = {
      h: clamp(Number(nextPartial.h ?? current.h), 0, 360),
      s: clamp(Number(nextPartial.s ?? current.s), 0, 1),
      v: clamp(Number(nextPartial.v ?? current.v), 0, 1),
    };

    setPickerStateByPatternId(function (prev) {
      return {
        ...prev,
        [patternId]: next,
      };
    });

    const hex = rgbToHex(hsvToRgb(next.h, next.s, next.v));
    queuePatternColorUpdate(patternId, hex);
  };

  const startSvDrag = function (event, pattern) {
    event.preventDefault();
    event.stopPropagation();

    const element = event.currentTarget;

    const updateFromPointer = function (pointerEvent) {
      const rect = element.getBoundingClientRect();
      const x = clamp(pointerEvent.clientX - rect.left, 0, rect.width);
      const y = clamp(pointerEvent.clientY - rect.top, 0, rect.height);
      const nextS = rect.width > 0 ? x / rect.width : 0;
      const nextV = rect.height > 0 ? 1 - y / rect.height : 0;

      updatePickerColor(pattern, {
        s: nextS,
        v: nextV,
      });
    };

    updateFromPointer(event);

    const onMouseMove = function (moveEvent) {
      updateFromPointer(moveEvent);
    };

    const onMouseUp = function () {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const startHueDrag = function (event, pattern) {
    event.preventDefault();
    event.stopPropagation();

    const element = event.currentTarget;

    const updateFromPointer = function (pointerEvent) {
      const rect = element.getBoundingClientRect();
      const x = clamp(pointerEvent.clientX - rect.left, 0, rect.width);
      const nextHue = rect.width > 0 ? (x / rect.width) * 360 : 0;

      updatePickerColor(pattern, {
        h: nextHue,
      });
    };

    updateFromPointer(event);

    const onMouseMove = function (moveEvent) {
      updateFromPointer(moveEvent);
    };

    const onMouseUp = function () {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  return {
    getPickerStateForPattern,
    updatePickerColor,
    startSvDrag,
    startHueDrag,
  };
};
