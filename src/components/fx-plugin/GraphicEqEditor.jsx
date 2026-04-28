import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";

// Dedicated UI renderer for the Graphic EQ effect branch.
export function GraphicEqEditor({
  graphRef,
  graphWidth,
  graphHeight,
  graphPadding,
  graphMaxDb,
  graphGridRowsPerSide,
  graphFrequencyGuides,
  spectrumPaths,
  eqCurvePath,
  pointCoordinates,
  draggingPointIndex,
  adjustPointShapeByWheel,
  setDraggingPointIndex,
  eqParams,
  editingField,
  editingValue,
  setEditingValue,
  onInlineEditKeyDown,
  onInlineEditBlur,
  beginInlineEdit,
  toFrequencyLabel,
  toDbLabel,
  toShapeLabel,
  onBandTypeChange,
  bandTypeOptions,
}) {
  const [openBandTypeIndex, setOpenBandTypeIndex] = useState(-1);
  const graphLeft = graphPadding.left;
  const graphRight = graphPadding.right;
  const graphTop = graphPadding.top;
  const graphBottom = graphPadding.bottom;
  const graphInnerWidth = Math.max(1, graphWidth - graphLeft - graphRight);
  const graphInnerHeight = Math.max(1, graphHeight - graphTop - graphBottom);

  const dbGridValues = Array.from({
    length: graphGridRowsPerSide * 2 + 1,
  }).map(function (_, index) {
    const t = index / (graphGridRowsPerSide * 2);
    return -graphMaxDb + t * graphMaxDb * 2;
  });

  const getFrequencyGridX = function (frequencyHz) {
    const safeFreq = Math.max(20, Math.min(20000, Number(frequencyHz || 20)));
    const ratio = Math.log(safeFreq / 20) / Math.log(20000 / 20);
    return graphLeft + ratio * graphInnerWidth;
  };

  return (
    <section className="fx-plugin-panel fx-window-panel">
      <div className="fx-proq-shell">
        <div className="fx-proq-graph-wrap">
          {/* Main EQ canvas: grid, analyzer fill/line, EQ transfer curve, draggable points. */}
          <svg
            ref={graphRef}
            className="fx-proq-graph"
            viewBox={"0 0 " + graphWidth + " " + graphHeight}
            preserveAspectRatio="none"
            aria-label="Parametric EQ response"
          >
            {dbGridValues.map(function (dbValue) {
              const y =
                graphTop +
                (1 - (dbValue + graphMaxDb) / (graphMaxDb * 2)) * graphInnerHeight;
              return (
                <line
                  key={"db-" + dbValue}
                  x1={graphLeft}
                  y1={y}
                  x2={graphWidth - graphRight}
                  y2={y}
                  className="fx-proq-grid-line"
                />
              );
            })}

            {graphFrequencyGuides.map(function (frequencyHz) {
              const x = getFrequencyGridX(frequencyHz);
              return (
                <line
                  key={"freq-" + frequencyHz}
                  x1={x}
                  y1={graphTop}
                  x2={x}
                  y2={graphHeight - graphBottom}
                  className="fx-proq-grid-line"
                />
              );
            })}

            {graphFrequencyGuides.map(function (frequencyHz, markerIndex) {
              const x = getFrequencyGridX(frequencyHz);
              const isFirst = markerIndex === 0;
              const isLast = markerIndex === graphFrequencyGuides.length - 1;

              return (
                <text
                  key={"freq-label-" + frequencyHz}
                  className="fx-proq-frequency-label"
                  x={x}
                  y={graphHeight - 8}
                  textAnchor={isFirst ? "start" : isLast ? "end" : "middle"}
                >
                  {toFrequencyLabel(frequencyHz)}
                </text>
              );
            })}

            {spectrumPaths.fillPath ? (
              <path d={spectrumPaths.fillPath} className="fx-proq-spectrum-fill" />
            ) : null}

            {spectrumPaths.linePath ? (
              <path d={spectrumPaths.linePath} className="fx-proq-spectrum-line" />
            ) : null}

            <path d={eqCurvePath} className="fx-proq-curve" />

            {pointCoordinates.map(function (point, index) {
              return (
                <g
                  key={"eq-point-" + index}
                  className={
                    "fx-proq-point" + (draggingPointIndex === index ? " is-active" : "")
                  }
                  transform={
                    "translate(" + point.x.toFixed(2) + " " + point.y.toFixed(2) + ")"
                  }
                  onWheel={function (event) {
                    // Mouse wheel over a point adjusts Q/shape percentage.
                    adjustPointShapeByWheel(event, index);
                  }}
                  onMouseDown={function (event) {
                    event.preventDefault();
                    event.stopPropagation();
                    setDraggingPointIndex(index);
                  }}
                >
                  <circle r="10" className="fx-proq-point-core" />
                  <circle r="13" className="fx-proq-point-ring" />
                  <text className="fx-proq-point-index" textAnchor="middle" dy="4">
                    {index + 1}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        <div className="fx-proq-readouts">
          {/* Per-band compact inspector below the graph. */}
          {eqParams.points.map(function (point, index) {
            return (
              <div
                key={"readout-" + index}
                className={
                  "fx-proq-readout" + (draggingPointIndex === index ? " is-active" : "")
                }
                onWheel={function (event) {
                  adjustPointShapeByWheel(event, index);
                }}
              >
                <span>P{index + 1}</span>
                {editingField?.pointIndex === index && editingField.field === "frequency" ? (
                  <input
                    className="fx-proq-inline-input"
                    value={editingValue}
                    onChange={function (event) {
                      setEditingValue(event.target.value);
                    }}
                    onKeyDown={onInlineEditKeyDown}
                    onBlur={onInlineEditBlur}
                    onWheel={function (event) {
                      event.stopPropagation();
                    }}
                    autoFocus
                  />
                ) : (
                  <strong
                    className="fx-proq-editable"
                    title="Double click to type frequency"
                    onDoubleClick={function () {
                      beginInlineEdit(point, index, "frequency");
                    }}
                  >
                    {toFrequencyLabel(point.frequencyHz)}
                  </strong>
                )}

                {editingField?.pointIndex === index && editingField.field === "gain" ? (
                  <input
                    className="fx-proq-inline-input"
                    value={editingValue}
                    onChange={function (event) {
                      setEditingValue(event.target.value);
                    }}
                    onKeyDown={onInlineEditKeyDown}
                    onBlur={onInlineEditBlur}
                    onWheel={function (event) {
                      event.stopPropagation();
                    }}
                    autoFocus
                  />
                ) : (
                  <em
                    className="fx-proq-editable"
                    title="Double click to type gain"
                    onDoubleClick={function () {
                      beginInlineEdit(point, index, "gain");
                    }}
                  >
                    {toDbLabel(point.gainDb)}
                  </em>
                )}

                {editingField?.pointIndex === index && editingField.field === "shape" ? (
                  <input
                    className="fx-proq-inline-input"
                    value={editingValue}
                    onChange={function (event) {
                      setEditingValue(event.target.value);
                    }}
                    onKeyDown={onInlineEditKeyDown}
                    onBlur={onInlineEditBlur}
                    onWheel={function (event) {
                      event.stopPropagation();
                    }}
                    autoFocus
                  />
                ) : (
                  <small
                    className="fx-proq-shape fx-proq-editable"
                    title="Double click to type shape percent"
                    onDoubleClick={function () {
                      beginInlineEdit(point, index, "shape");
                    }}
                  >
                    {toShapeLabel(point)}
                  </small>
                )}

                <BandTypeSelect
                  point={point}
                  bandTypeOptions={bandTypeOptions}
                  isOpen={openBandTypeIndex === index}
                  onToggle={function (nextOpen) {
                    setOpenBandTypeIndex(nextOpen ? index : -1);
                  }}
                  onSelect={function (bandTypeValue) {
                    onBandTypeChange(index, bandTypeValue);
                    setOpenBandTypeIndex(-1);
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function BandTypeSelect({
  point,
  bandTypeOptions,
  isOpen,
  onToggle,
  onSelect,
}) {
  const triggerRef = useRef(null);
  const [dropdownPos, setDropdownPos] = useState(null);

  const handleToggle = useCallback(
    function (event) {
      event.stopPropagation();
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const nextOpen = !isOpen;
      if (nextOpen) {
        setDropdownPos({
          top: rect.bottom + 4,
          left: rect.left,
        });
      }
      onToggle(nextOpen);
    },
    [isOpen, onToggle],
  );

  const handleClose = useCallback(
    function () {
      onToggle(false);
    },
    [onToggle],
  );

  const label =
    bandTypeOptions.find(function (o) {
      return o.value === point.bandType;
    })?.label || "";

  return (
    <div className="fx-proq-band-type-wrap rack-modern-select">
      <button
        ref={triggerRef}
        type="button"
        className="rack-modern-select-trigger"
        onClick={handleToggle}
      >
        <span className="rack-modern-select-value">{label}</span>
      </button>
      {isOpen && dropdownPos
        ? createPortal(
            <BandTypeDropdown
              className="fx-proq-band-type-dropdown"
              bandTypeOptions={bandTypeOptions}
              currentValue={point.bandType}
              pos={dropdownPos}
              onSelect={onSelect}
              onClose={handleClose}
            />,
            document.body,
          )
        : null}
    </div>
  );
}

function BandTypeDropdown({
  className,
  bandTypeOptions,
  currentValue,
  pos,
  onSelect,
  onClose,
}) {
  const dropdownRef = useRef(null);

  useEffect(
    function () {
      function handleClick(event) {
        if (!dropdownRef.current?.contains(event.target)) {
          onClose();
        }
      }
      function handleEsc(event) {
        if (event.key === "Escape") onClose();
      }
      document.addEventListener("click", handleClick, true);
      document.addEventListener("keydown", handleEsc);
      return function () {
        document.removeEventListener("click", handleClick, true);
        document.removeEventListener("keydown", handleEsc);
      };
    },
    [onClose],
  );

  const style = {
    position: "fixed",
    top: pos.top,
    left: pos.left,
    width: "auto",
    minWidth: 0,
    zIndex: 9999,
  };

  return (
    <div
      ref={dropdownRef}
      className={
        "rack-modern-select-dropdown" + (className ? " " + className : "")
      }
      style={style}
    >
      {bandTypeOptions.map(function (bandType) {
        const isActive = bandType.value === currentValue;
        return (
          <button
            key={bandType.value}
            type="button"
            className={
              "rack-modern-select-option" + (isActive ? " is-active" : "")
            }
            onClick={function (event) {
              event.stopPropagation();
              onSelect(bandType.value);
            }}
          >
            {bandType.label}
          </button>
        );
      })}
    </div>
  );
}
