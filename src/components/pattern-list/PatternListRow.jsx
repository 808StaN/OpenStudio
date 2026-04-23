import { clamp, hexToRgb, hsvToRgb, rgbToHex, rgbToHsv } from "./patternListColorUtils";

// Single row renderer for one pattern entry, including color popover controls.
export function PatternListRow({
  pattern,
  isSelected,
  isDragging,
  clipCount,
  openColorPatternId,
  defaultPatternColor,
  getPickerStateForPattern,
  setOpenColorPatternId,
  startSvDrag,
  startHueDrag,
  updatePickerColor,
  onRowClick,
  onRowDragStart,
  onRowDragEnd,
  onRename,
}) {
  const pickerState = getPickerStateForPattern(pattern);
  const pickerColor = rgbToHex(hsvToRgb(pickerState.h, pickerState.s, pickerState.v));
  const hueColor = rgbToHex(hsvToRgb(pickerState.h, 1, 1));
  const svCursorLeft = clamp(pickerState.s * 100, 0, 100);
  const svCursorTop = clamp((1 - pickerState.v) * 100, 0, 100);
  const hueCursorLeft = clamp((pickerState.h / 360) * 100, 0, 100);

  return (
    <article
      className={
        "pattern-list-row" +
        (isSelected ? " is-selected" : "") +
        (isDragging ? " is-dragging" : "")
      }
      draggable
      onClick={function (event) {
        onRowClick(event, pattern.id);
      }}
      onDragStart={function (event) {
        onRowDragStart(event, pattern);
      }}
      onDragEnd={onRowDragEnd}
    >
      <div className="pattern-list-row-top">
        <input
          className="pattern-list-name"
          value={pattern.name}
          maxLength={40}
          onClick={function (event) {
            event.stopPropagation();
          }}
          onChange={function (event) {
            onRename(pattern.id, event.target.value);
          }}
        />

        <div
          className="pattern-list-color-wrap"
          onMouseDown={function (event) {
            event.stopPropagation();
          }}
        >
          <button
            type="button"
            className="pattern-list-color-label"
            title="Pattern color"
            onClick={function (event) {
              event.stopPropagation();
              setOpenColorPatternId(function (prev) {
                return prev === pattern.id ? null : pattern.id;
              });
            }}
          >
            <span
              className="pattern-list-color-chip"
              style={{
                backgroundColor: pickerColor,
              }}
            />
          </button>

          {openColorPatternId === pattern.id ? (
            <div className="pattern-list-color-popover">
              <div
                className="pattern-list-sv"
                style={{
                  backgroundColor: hueColor,
                }}
                onMouseDown={function (event) {
                  startSvDrag(event, pattern);
                }}
              >
                <span
                  className="pattern-list-sv-cursor"
                  style={{
                    left: svCursorLeft + "%",
                    top: svCursorTop + "%",
                  }}
                />
              </div>

              <div
                className="pattern-list-hue"
                onMouseDown={function (event) {
                  startHueDrag(event, pattern);
                }}
              >
                <span
                  className="pattern-list-hue-cursor"
                  style={{
                    left: hueCursorLeft + "%",
                  }}
                />
              </div>

              <button
                type="button"
                className="pattern-list-color-reset"
                onClick={function () {
                  updatePickerColor(
                    pattern,
                    rgbToHsv(hexToRgb(defaultPatternColor)),
                  );
                }}
              >
                Reset
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="pattern-list-meta">
        <span>{Math.max(1, Math.ceil((pattern.lengthSteps || 16) / 16))} bars</span>
        <span>{clipCount || 0} clips</span>
      </div>
    </article>
  );
}
