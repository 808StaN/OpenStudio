function clampBipolarValue(value) {
  return Math.min(1, Math.max(-1, Number(value) || 0))
}

function getPanKnobStyle(value) {
  const clamped = clampBipolarValue(value)
  const abs = Math.abs(clamped)
  if (clamped < 0) {
    return {
      "--knob-angle": 90 * clamped + "deg",
      "--knob-fill-start": 360 - 90 * abs + "deg",
      "--knob-fill-end": "360deg",
    }
  }
  return {
    "--knob-angle": 90 * clamped + "deg",
    "--knob-fill-start": "0deg",
    "--knob-fill-end": 90 * abs + "deg",
  }
}

function getStereoKnobStyle(value) {
  const clamped = clampBipolarValue(value)
  const normalized = (clamped + 1) / 2
  return {
    "--knob-angle": 90 * clamped + "deg",
    "--knob-fill-start": "270deg",
    "--knob-fill-end": 270 + 180 * normalized + "deg",
  }
}

// Renders mixer insert strips (left panel) and forwards UI events to parent handlers.

export function MixerTrackList({
  inserts,
  selectedInsertId,
  getInsertLabel,
  onSelectInsert,
  onToggleInsertActive,
  onPanChange,
  onPanReset,
  onStereoChange,
  onStereoReset,
  onFaderChange,
  onFaderReset,
}) {
  return (
    <section className="mixer-left">
      {inserts.map(function (insert) {
        return (
          <article
            className={
              "mixer-track" + (insert.id === selectedInsertId ? " is-selected" : "")
            }
            key={insert.id}
            onClick={function () {
              onSelectInsert(insert.id);
            }}
          >
            <div className="track-header">
              <button
                className={"track-led" + (insert.active ? " is-on" : "")}
                onClick={function (event) {
                  event.stopPropagation();
                  onToggleInsertActive(insert);
                }}
              />
              <div className="track-title">{getInsertLabel(insert)}</div>
            </div>

            <div className="knob-group">
              <label className="knob-wrap">
                <span>Pan</span>
                <span
                  className="metal-knob-visual"
                  style={getPanKnobStyle(insert.pan)}
                  aria-hidden="true"
                />
                <input
                  className="metal-knob"
                  type="range"
                  min="-1"
                  max="1"
                  step="0.01"
                  value={insert.pan}
                  onDoubleClick={function (event) {
                    event.stopPropagation();
                    onPanReset(insert);
                  }}
                  onChange={function (event) {
                    onPanChange(insert, Number(event.target.value));
                  }}
                />
              </label>

              <label className="knob-wrap">
                <span>Stereo</span>
                <span
                  className="metal-knob-visual"
                  style={getStereoKnobStyle(insert.stereoSeparation)}
                  aria-hidden="true"
                />
                <input
                  className="metal-knob"
                  type="range"
                  min="-1"
                  max="1"
                  step="0.01"
                  value={insert.stereoSeparation}
                  onDoubleClick={function (event) {
                    event.stopPropagation();
                    onStereoReset(insert);
                  }}
                  onChange={function (event) {
                    onStereoChange(insert, Number(event.target.value));
                  }}
                />
              </label>
            </div>

            <div className="fader-block">
              <div className="fader-groove">
                <input
                  className="fader-slider"
                  type="range"
                  min="0"
                  max="1.25"
                  step="0.01"
                  value={insert.fader}
                  onDoubleClick={function (event) {
                    event.stopPropagation();
                    onFaderReset(insert);
                  }}
                  onChange={function (event) {
                    onFaderChange(insert, Number(event.target.value));
                  }}
                />
              </div>

              <div className="meter-column">
                {Array.from({ length: 14 }).map(function (_, index) {
                  const threshold = (index + 1) / 14;
                  const isActive = insert.meter >= threshold;
                  return (
                    <span
                      key={index}
                      className={"meter-seg" + (isActive ? " is-on" : "")}
                    />
                  );
                })}
              </div>
            </div>
          </article>
        );
      })}
    </section>
  );
}
