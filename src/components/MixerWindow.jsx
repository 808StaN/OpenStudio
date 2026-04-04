import { ChevronRight, Power } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  addMixerTrack,
  selectInsert,
  setInsertActive,
  setInsertFader,
  setInsertPan,
  setInsertStereo,
  toggleFxSlot,
} from "../store";

export function MixerWindow() {
  const dispatch = useDispatch();
  const [valueReadout, setValueReadout] = useState("");
  const clearReadoutTimeoutRef = useRef(null);

  const inserts = useSelector(function (state) {
    return state.daw.mixer.inserts;
  });
  const selectedInsertId = useSelector(function (state) {
    return state.daw.mixer.selectedInsertId;
  });

  const selectedInsert =
    inserts.find(function (item) {
      return item.id === selectedInsertId;
    }) || inserts[0];

  const getTrackLabel = function (insert) {
    if (insert.isMaster) {
      return insert.name || "Master";
    }

    const sourceName = String(insert.name || "");
    const renamed = sourceName.replace(/^insert\b/i, "Track");
    if (renamed && renamed !== sourceName) {
      return renamed;
    }

    const numericSuffix = String(insert.id || "").match(/insert-(\d+)/i)?.[1];
    if (numericSuffix) {
      return "Track " + numericSuffix;
    }

    return sourceName || "Track";
  };

  useEffect(function () {
    return function () {
      if (clearReadoutTimeoutRef.current) {
        clearTimeout(clearReadoutTimeoutRef.current);
      }
    };
  }, []);

  const formatPercentValue = function (value) {
    return Math.round(value * 100) + "%";
  };

  const formatSignedPercentValue = function (value) {
    const intValue = Math.round(value * 100);
    if (intValue > 0) {
      return "+" + intValue + "%";
    }
    return intValue + "%";
  };

  const showValueReadout = function (text) {
    setValueReadout(text);

    if (clearReadoutTimeoutRef.current) {
      clearTimeout(clearReadoutTimeoutRef.current);
    }

    clearReadoutTimeoutRef.current = setTimeout(function () {
      setValueReadout("");
    }, 1700);
  };

  const resetPan = function (insert) {
    const nextValue = 0;
    const trackLabel = getTrackLabel(insert);
    dispatch(
      setInsertPan({
        insertId: insert.id,
        value: nextValue,
      }),
    );
    showValueReadout(
      trackLabel + " Pan: " + formatSignedPercentValue(nextValue),
    );
  };

  const resetStereo = function (insert) {
    const nextValue = 0;
    const trackLabel = getTrackLabel(insert);
    dispatch(
      setInsertStereo({
        insertId: insert.id,
        value: nextValue,
      }),
    );
    showValueReadout(
      trackLabel + " Stereo: " + formatSignedPercentValue(nextValue),
    );
  };

  const resetVolume = function (insert) {
    const nextValue = 1;
    const trackLabel = getTrackLabel(insert);
    dispatch(
      setInsertFader({
        insertId: insert.id,
        value: nextValue,
      }),
    );
    showValueReadout(trackLabel + " Volume: " + formatPercentValue(nextValue));
  };

  return (
    <div className="mixer-root">
      <section className="mixer-left">
        {inserts.map(function (insert) {
          return (
            <article
              className={
                "mixer-track" +
                (insert.id === selectedInsertId ? " is-selected" : "")
              }
              key={insert.id}
              onClick={function () {
                dispatch(selectInsert(insert.id));
              }}
            >
              <div className="track-header">
                <button
                  className={"track-led" + (insert.active ? " is-on" : "")}
                  onClick={function (event) {
                    event.stopPropagation();
                    const nextValue = !insert.active;
                    const trackLabel = getTrackLabel(insert);
                    dispatch(
                      setInsertActive({
                        insertId: insert.id,
                        value: nextValue,
                      }),
                    );
                    showValueReadout(
                      trackLabel + " Active: " + (nextValue ? "ON" : "OFF"),
                    );
                  }}
                />
                <div className="track-title">{getTrackLabel(insert)}</div>
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
                      resetPan(insert);
                    }}
                    onChange={function (event) {
                      const nextValue = Number(event.target.value);
                      const trackLabel = getTrackLabel(insert);
                      dispatch(
                        setInsertPan({
                          insertId: insert.id,
                          value: nextValue,
                        }),
                      );
                      showValueReadout(
                        trackLabel +
                          " Pan: " +
                          formatSignedPercentValue(nextValue),
                      );
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
                      resetStereo(insert);
                    }}
                    onChange={function (event) {
                      const nextValue = Number(event.target.value);
                      const trackLabel = getTrackLabel(insert);
                      dispatch(
                        setInsertStereo({
                          insertId: insert.id,
                          value: nextValue,
                        }),
                      );
                      showValueReadout(
                        trackLabel +
                          " Stereo: " +
                          formatSignedPercentValue(nextValue),
                      );
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
                      resetVolume(insert);
                    }}
                    onChange={function (event) {
                      const nextValue = Number(event.target.value);
                      const trackLabel = getTrackLabel(insert);
                      dispatch(
                        setInsertFader({
                          insertId: insert.id,
                          value: nextValue,
                        }),
                      );
                      showValueReadout(
                        trackLabel +
                          " Volume: " +
                          formatPercentValue(nextValue),
                      );
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

      <aside className="mixer-right">
        <div className="mixer-right-header">
          <div className="fx-header">FX Slots</div>
          <button
            className="mixer-track-add"
            type="button"
            onClick={function () {
              dispatch(addMixerTrack());
            }}
          >
            + Track
          </button>
        </div>

        <div className="fx-list">
          {selectedInsert.fxSlots.map(function (slot) {
            return (
              <div className="fx-row" key={slot.id}>
                <button
                  className={"fx-power" + (slot.enabled ? " is-on" : "")}
                  onClick={function () {
                    dispatch(
                      toggleFxSlot({
                        insertId: selectedInsert.id,
                        slotId: slot.id,
                      }),
                    );
                  }}
                >
                  <Power size={11} />
                </button>
                <span className="fx-name">{slot.name}</span>
                <ChevronRight size={14} className="fx-arrow" />
              </div>
            );
          })}
        </div>
      </aside>

      <div
        className={"mixer-value-readout" + (valueReadout ? " is-visible" : "")}
      >
        {valueReadout}
      </div>
    </div>
  );
}
