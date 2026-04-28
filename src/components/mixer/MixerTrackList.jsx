// Renders mixer insert strips (left panel) and forwards UI events to parent handlers.

import Knob from "./Knob"
import Fader from "./Fader"

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
              onSelectInsert(insert.id)
            }}
          >
            <div className="track-header">
              <button
                className={"track-led" + (insert.active ? " is-on" : "")}
                onClick={function (event) {
                  event.stopPropagation()
                  onToggleInsertActive(insert)
                }}
              />
              <div className="track-title">{getInsertLabel(insert)}</div>
            </div>

            <div className="knob-group">
              <div className="knob-wrap">
                <span>Pan</span>
                <Knob
                  value={insert.pan * 180}
                  onChange={function (deg) {
                    onPanChange(insert, deg / 180)
                  }}
                  onReset={function () {
                    onPanReset(insert)
                  }}
                  className="mixer-knob"
                />
              </div>

              <div className="knob-wrap">
                <span>Stereo</span>
                <Knob
                  value={insert.stereoSeparation * 180}
                  onChange={function (deg) {
                    onStereoChange(insert, deg / 180)
                  }}
                  onReset={function () {
                    onStereoReset(insert)
                  }}
                  className="mixer-knob"
                />
              </div>
            </div>

            <div className="fader-block">
              <div className="fader-groove">
                <Fader
                  className="fader-slider"
                  min={0}
                  max={1.25}
                  value={insert.fader}
                  onChange={function (nextValue) {
                    onFaderChange(insert, nextValue)
                  }}
                  onReset={function () {
                    onFaderReset(insert)
                  }}
                />
              </div>

              <div className="meter-column">
                {Array.from({ length: 14 }).map(function (_, index) {
                  const threshold = (14 - index) / 14
                  const isActive = insert.meter >= threshold
                  return (
                    <span
                      key={index}
                      className={"meter-seg" + (isActive ? " is-on" : "")}
                    />
                  )
                })}
              </div>
            </div>
          </article>
        )
      })}
    </section>
  )
}
