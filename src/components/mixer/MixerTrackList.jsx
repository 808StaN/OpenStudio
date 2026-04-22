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
