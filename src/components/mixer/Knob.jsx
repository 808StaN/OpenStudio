import { useEffect, useRef } from "react"

const R = 72
const PX_PER_DEG = 2.2

function polarToXY(deg, r) {
  const rad = (deg - 90) * Math.PI / 180
  return { x: r * Math.cos(rad), y: r * Math.sin(rad) }
}

function describeArc(startDeg, endDeg, r) {
  if (Math.abs(endDeg - startDeg) < 0.01) return ""
  const s = polarToXY(startDeg, r)
  const e = polarToXY(endDeg, r)
  const delta = endDeg - startDeg
  const largeArc = Math.abs(delta) > 180 ? 1 : 0
  const sweep = delta > 0 ? 1 : 0
  return "M " + s.x + " " + s.y + " A " + r + " " + r + " 0 " + largeArc + " " + sweep + " " + e.x + " " + e.y
}

export default function Knob({ value, onChange, onReset, className, style }) {
  const knobRef = useRef(null)
  const isDraggingRef = useRef(false)
  const onChangeRef = useRef(onChange)

  useEffect(function () {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(function () {
    const el = knobRef.current
    if (!el) return

    function onMouseDown(e) {
      e.preventDefault()
      el.requestPointerLock()
    }

    function onPointerLockChange() {
      isDraggingRef.current = document.pointerLockElement === el
    }

    function onMouseMove(e) {
      if (!isDraggingRef.current) return
      const next = Math.max(-180, Math.min(180, (value || 0) - e.movementY / PX_PER_DEG))
      if (onChangeRef.current) {
        onChangeRef.current(next)
      }
    }

    function onMouseUp() {
      if (isDraggingRef.current) {
        document.exitPointerLock()
      }
    }

    el.addEventListener("mousedown", onMouseDown)
    document.addEventListener("pointerlockchange", onPointerLockChange)
    document.addEventListener("mousemove", onMouseMove)
    document.addEventListener("mouseup", onMouseUp)

    return function () {
      el.removeEventListener("mousedown", onMouseDown)
      document.removeEventListener("pointerlockchange", onPointerLockChange)
      document.removeEventListener("mousemove", onMouseMove)
      document.removeEventListener("mouseup", onMouseUp)
    }
  }, [value])

  function onWheel(e) {
    e.preventDefault()
    const next = Math.max(-180, Math.min(180, (value || 0) - Math.sign(e.deltaY)))
    if (onChangeRef.current) {
      onChangeRef.current(next)
    }
  }

  const angle = value || 0
  const rad = (angle * Math.PI) / 180
  const ix = Math.sin(rad) * 38
  const iy = -Math.cos(rad) * 38

  const arcPath =
    angle > 0.5 ? describeArc(0, angle, R) :
    angle < -0.5 ? describeArc(angle, 0, R) : ""

  const arcColor = angle < -0.5 ? "#D85A30" : "#1D9E75"

  return (
    <div
      ref={knobRef}
      onWheel={onWheel}
      onDoubleClick={function (e) {
        e.stopPropagation()
        if (onReset) onReset()
      }}
      className={className}
      style={style}
    >
      <svg
        viewBox="-90 -90 180 180"
        width="100%"
        height="100%"
        style={{ overflow: "visible", display: "block" }}
      >
        <circle
          cx="0"
          cy="0"
          r={R}
          fill="none"
          stroke="#232b33"
          strokeWidth="10"
          strokeLinecap="round"
        />
        {arcPath && (
          <path
            d={arcPath}
            fill="none"
            stroke={arcColor}
            strokeWidth="10"
            strokeLinecap="round"
          />
        )}
        <circle
          cx="0"
          cy="0"
          r="54"
          fill="#11171d"
          stroke="#232b33"
          strokeWidth="0.5"
        />
        <line
          x1="0"
          y1="0"
          x2={ix}
          y2={iy}
          stroke="#d3d8d7"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <circle cx={ix} cy={iy} r="4" fill="#d3d8d7" />
        <circle
          cx="0"
          cy="0"
          r="8"
          fill="#07090c"
          stroke="#232b33"
          strokeWidth="0.5"
        />
        <circle cx="0" cy={-R} r="4" fill="#232b33" />
        <circle cx="0" cy={R} r="3" fill="#2a3038" />
      </svg>
    </div>
  )
}
