import { useCallback, useRef } from "react";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function snapToStep(value, min, step) {
  if (!step) return value;
  const snapped = Math.round((value - min) / step) * step + min;
  return Number(snapped.toFixed(6));
}

export function HorizontalSlider({
  className = "",
  min,
  max,
  step = 1,
  value,
  onChange,
  onReset,
}) {
  const sliderRef = useRef(null);
  const isDraggingRef = useRef(false);

  const valueToPercent = useCallback(function (nextValue) {
    return ((nextValue - min) / (max - min)) * 100;
  }, [min, max]);

  const updateFromClientX = useCallback(function (clientX) {
    const el = sliderRef.current;
    if (!el || !onChange) return;

    const rect = el.getBoundingClientRect();
    const pct = clamp((clientX - rect.left) / rect.width, 0, 1);
    const nextValue = snapToStep(min + pct * (max - min), min, step);
    onChange(clamp(nextValue, min, max));
  }, [min, max, step, onChange]);

  const handlePointerDown = useCallback(function (event) {
    event.preventDefault();
    isDraggingRef.current = true;
    updateFromClientX(event.clientX);

    const el = sliderRef.current;
    if (el) {
      el.setPointerCapture(event.pointerId);
    }
  }, [updateFromClientX]);

  const handlePointerMove = useCallback(function (event) {
    if (!isDraggingRef.current) return;
    updateFromClientX(event.clientX);
  }, [updateFromClientX]);

  const handlePointerUp = useCallback(function () {
    isDraggingRef.current = false;
  }, []);

  const handleWheel = useCallback(function (event) {
    event.preventDefault();
    if (!onChange) return;
    const direction = event.deltaY > 0 ? -1 : 1;
    onChange(clamp(snapToStep(value + step * direction, min, step), min, max));
  }, [value, min, max, step, onChange]);

  const percent = valueToPercent(value);
  const rootClassName = "horizontal-slider" + (className ? " " + className : "");

  return (
    <div
      ref={sliderRef}
      className={rootClassName}
      role="slider"
      tabIndex={0}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onWheel={handleWheel}
      onDoubleClick={function (event) {
        event.stopPropagation();
        if (onReset) onReset();
      }}
    >
      <div className="horizontal-slider-track" />
      <div className="horizontal-slider-fill" style={{ width: percent + "%" }} />
      <div className="horizontal-slider-thumb" style={{ left: percent + "%" }} />
    </div>
  );
}
