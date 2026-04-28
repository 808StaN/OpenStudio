import { useRef, useCallback } from "react"

export default function Fader({ value, min, max, onChange, onReset, className }) {
  const isDraggingRef = useRef(false)
  const startYRef = useRef(0)
  const startValueRef = useRef(value)
  const grooveRef = useRef(null)

  const clamp = useCallback(function (v) {
    return Math.max(min, Math.min(max, v))
  }, [min, max])

  const valueToPercent = useCallback(function (v) {
    return ((v - min) / (max - min)) * 100
  }, [min, max])

  const percentToValue = useCallback(function (pct) {
    return min + (pct / 100) * (max - min)
  }, [min, max])

  const handlePointerDown = useCallback(function (event) {
    event.preventDefault()
    isDraggingRef.current = true
    startYRef.current = event.clientY
    startValueRef.current = value

    const el = grooveRef.current
    if (el) {
      el.setPointerCapture(event.pointerId)
    }
  }, [value])

  const handlePointerMove = useCallback(function (event) {
    if (!isDraggingRef.current) return

    const el = grooveRef.current
    if (!el) return

    const rect = el.getBoundingClientRect()
    const height = rect.height
    const deltaY = startYRef.current - event.clientY
    const deltaPct = (deltaY / height) * 100
    const startPct = valueToPercent(startValueRef.current)
    const nextPct = Math.max(0, Math.min(100, startPct + deltaPct))
    const nextValue = percentToValue(nextPct)

    if (onChange) {
      onChange(nextValue)
    }
  }, [onChange, valueToPercent, percentToValue])

  const handlePointerUp = useCallback(function () {
    isDraggingRef.current = false
  }, [])

  const handleWheel = useCallback(function (event) {
    event.preventDefault()
    const step = (max - min) / 100
    const direction = event.deltaY > 0 ? -1 : 1
    const nextValue = clamp(value + step * direction * 3)
    if (onChange) {
      onChange(nextValue)
    }
  }, [value, min, max, onChange, clamp])

  const percent = valueToPercent(value)

  return (
    <div
      ref={grooveRef}
      className={className}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onWheel={handleWheel}
      onDoubleClick={function (event) {
        event.stopPropagation()
        if (onReset) onReset()
      }}
    >
      <div className="fader-track" />
      <div
        className="fader-fill"
        style={{ height: percent + "%" }}
      />
      <div
        className="fader-thumb"
        style={{ bottom: "calc(" + percent + "% - 5px)" }}
      />
    </div>
  )
}
