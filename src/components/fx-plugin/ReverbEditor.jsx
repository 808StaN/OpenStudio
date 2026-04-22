// Dedicated UI renderer for the Reverb effect branch.
export function ReverbEditor({
  reverbControls,
  reverbParams,
  draggingReverbParam,
  beginReverbDrag,
  onReverbWheel,
  resetReverbControl,
  editingReverbParam,
  editingReverbText,
  setEditingReverbText,
  commitReverbEdit,
  beginReverbEdit,
  setEditingReverbParam,
}) {
  return (
    <section className="fx-plugin-panel fx-window-panel">
      <div className="fx-reverb-shell">
        {/* Each card maps to one reverb parameter with drag/wheel/type editing. */}
        <div className="fx-reverb-grid">
          {reverbControls.map(function (control) {
            const value = Number(reverbParams[control.param] || 0);
            const ratio =
              control.max > control.min
                ? (value - control.min) / (control.max - control.min)
                : 0;
            const clampedRatio = Math.max(0, Math.min(1, ratio));

            return (
              <div
                key={control.param}
                className={
                  "fx-reverb-control" +
                  (draggingReverbParam === control.param ? " is-active" : "")
                }
              >
                <span>{control.label}</span>

                <button
                  type="button"
                  className="fx-reverb-knob"
                  onMouseDown={function (event) {
                    beginReverbDrag(event, control);
                  }}
                  onWheel={function (event) {
                    onReverbWheel(event, control);
                  }}
                  onDoubleClick={function (event) {
                    event.preventDefault();
                    resetReverbControl(control);
                  }}
                  aria-label={control.label}
                  title="Drag to change, Shift for precision, double click to reset"
                >
                  {/* Knob face uses a conic gradient as a compact value meter. */}
                  <span
                    className="fx-reverb-knob-face"
                    style={{
                      background:
                        "conic-gradient(from -135deg, #ff9730 " +
                        Math.round(clampedRatio * 100) +
                        "%, #2a3344 " +
                        Math.round(clampedRatio * 100) +
                        "%)",
                    }}
                  />
                </button>

                {editingReverbParam === control.param ? (
                  // Inline numeric editing mode (Enter confirms, Escape cancels).
                  <input
                    className="fx-reverb-inline-input"
                    value={editingReverbText}
                    onChange={function (event) {
                      setEditingReverbText(event.target.value);
                    }}
                    onBlur={function () {
                      commitReverbEdit(control);
                    }}
                    onKeyDown={function (event) {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        commitReverbEdit(control);
                      }
                      if (event.key === "Escape") {
                        event.preventDefault();
                        setEditingReverbParam("");
                        setEditingReverbText("");
                      }
                    }}
                    autoFocus
                  />
                ) : (
                  // Display mode; double click opens the inline editor.
                  <strong
                    className="fx-reverb-value"
                    onDoubleClick={function () {
                      beginReverbEdit(control);
                    }}
                    title="Double click to type value"
                  >
                    {control.format(value)}
                  </strong>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
