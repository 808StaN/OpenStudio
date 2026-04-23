import { useRef } from "react";

export function DraggableBpm({ value, onChange, min, max }) {
  const dragStartYRef = useRef(0);
  const dragStartValueRef = useRef(value);
  const isDraggingRef = useRef(false);

  const onMouseDown = function (event) {
    // Track initial pointer/value so dragging is deterministic and smooth.
    isDraggingRef.current = true;
    dragStartYRef.current = event.clientY;
    dragStartValueRef.current = value;

    const onMouseMove = function (moveEvent) {
      if (!isDraggingRef.current) {
        return;
      }

      const delta = dragStartYRef.current - moveEvent.clientY;
      const nextValue = dragStartValueRef.current + delta;
      onChange(Math.max(min, Math.min(max, nextValue)));
    };

    const onMouseUp = function () {
      isDraggingRef.current = false;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  return (
    <button className="transport-bpm" onMouseDown={onMouseDown}>
      {Math.round(value)} BPM
    </button>
  );
}
