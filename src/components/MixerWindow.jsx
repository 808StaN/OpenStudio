import { ChevronRight, Power } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  addMixerTrack,
  openWindow,
  selectInsert,
  setFxEditorTarget,
  setFxSlotEffectType,
  setInsertActive,
  setInsertFader,
  setInsertPan,
  setInsertStereo,
  toggleFxSlot,
} from "../store";

const FX_EFFECT_GRAPHIC_EQ = "graphic-eq";

function getFxSlotName(slot, fallbackIndex) {
  if (slot?.effectType === FX_EFFECT_GRAPHIC_EQ) {
    return "Parametric EQ 2";
  }
  return String(slot?.name || "").trim() || "Slot " + (fallbackIndex + 1);
}

export function MixerWindow() {
  const dispatch = useDispatch();
  const [valueReadout, setValueReadout] = useState("");
  const [selectedFxSlotId, setSelectedFxSlotId] = useState(null);
  const [dropTargetSlotId, setDropTargetSlotId] = useState(null);
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
  const fxSlots = Array.isArray(selectedInsert?.fxSlots)
    ? selectedInsert.fxSlots
    : [];
  const selectedFxSlot =
    fxSlots.find(function (slot) {
      return slot.id === selectedFxSlotId;
    }) || fxSlots[0] || null;

  useEffect(
    function () {
      if (fxSlots.length === 0) {
        if (selectedFxSlotId !== null) {
          setSelectedFxSlotId(null);
        }
        return;
      }

      const exists = fxSlots.some(function (slot) {
        return slot.id === selectedFxSlotId;
      });

      if (!exists) {
        setSelectedFxSlotId(fxSlots[0].id);
      }
    },
    [fxSlots, selectedFxSlotId],
  );

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

  const openFxEditorForSlot = function (slotId) {
    if (!selectedInsert || !slotId) {
      return;
    }

    dispatch(
      setFxEditorTarget({
        insertId: selectedInsert.id,
        slotId,
      }),
    );
    dispatch(openWindow("fxPlugin"));
  };

  const readEffectPayloadFromDataTransfer = function (dataTransfer) {
    if (!dataTransfer) {
      return null;
    }

    const parsePayload = function (raw) {
      if (!raw) {
        return null;
      }

      try {
        const payload = JSON.parse(raw);
        if (
          payload &&
          payload.type === "effect" &&
          payload.effectType === FX_EFFECT_GRAPHIC_EQ
        ) {
          return payload;
        }
      } catch {
        return null;
      }

      return null;
    };

    return (
      parsePayload(dataTransfer.getData("application/x-daw-effect")) ||
      parsePayload(dataTransfer.getData("text/plain"))
    );
  };

  const onFxSlotDragOver = function (event, slot) {
    const types = Array.from(event.dataTransfer?.types || []);
    const supportsEffectPayload =
      types.includes("application/x-daw-effect") ||
      types.includes("text/plain");

    if (!supportsEffectPayload) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";

    if (dropTargetSlotId !== slot.id) {
      setDropTargetSlotId(slot.id);
    }
  };

  const onFxSlotDragLeave = function (event, slot) {
    const related = event.relatedTarget;
    if (
      related instanceof Node &&
      event.currentTarget instanceof Node &&
      event.currentTarget.contains(related)
    ) {
      return;
    }

    if (dropTargetSlotId === slot.id) {
      setDropTargetSlotId(null);
    }
  };

  const onFxSlotDrop = function (event, slot) {
    event.preventDefault();
    setDropTargetSlotId(null);

    const payload = readEffectPayloadFromDataTransfer(event.dataTransfer);
    if (!payload) {
      return;
    }

    dispatch(
      setFxSlotEffectType({
        insertId: selectedInsert.id,
        slotId: slot.id,
        effectType: payload.effectType,
      }),
    );

    if (!(slot.effectType === payload.effectType && slot.enabled)) {
      dispatch(
        toggleFxSlot({
          insertId: selectedInsert.id,
          slotId: slot.id,
        }),
      );
    }

    const slotIndex = fxSlots.findIndex(function (item) {
      return item.id === slot.id;
    });

    setSelectedFxSlotId(slot.id);
    showValueReadout(
      getTrackLabel(selectedInsert) +
        " loaded " +
        (payload.effectName || "Parametric EQ 2") +
        " on " +
        getFxSlotName(slot, Math.max(0, slotIndex)),
    );
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
          {fxSlots.map(function (slot, slotIndex) {
            const slotName = getFxSlotName(slot, slotIndex);
            return (
              <div
                className={
                  "fx-row" +
                  (slot.id === selectedFxSlot?.id ? " is-selected" : "") +
                  (slot.id === dropTargetSlotId ? " is-drop-target" : "")
                }
                key={slot.id}
                onClick={function () {
                  setSelectedFxSlotId(slot.id);
                  openFxEditorForSlot(slot.id);
                }}
                onDragOver={function (event) {
                  onFxSlotDragOver(event, slot);
                }}
                onDragLeave={function (event) {
                  onFxSlotDragLeave(event, slot);
                }}
                onDrop={function (event) {
                  onFxSlotDrop(event, slot);
                }}
              >
                <button
                  className={
                    "fx-power" +
                    (slot.enabled ? " is-on" : "") +
                    (slot.effectType === FX_EFFECT_GRAPHIC_EQ ? "" : " is-disabled")
                  }
                  onClick={function (event) {
                    event.stopPropagation();

                    if (slot.effectType !== FX_EFFECT_GRAPHIC_EQ) {
                      return;
                    }

                    dispatch(
                      toggleFxSlot({
                        insertId: selectedInsert.id,
                        slotId: slot.id,
                      }),
                    );

                    showValueReadout(
                      getTrackLabel(selectedInsert) +
                        " " +
                        slotName +
                        ": " +
                        (!slot.enabled ? "ON" : "OFF"),
                    );
                  }}
                >
                  <Power size={11} />
                </button>
                <span className="fx-name">{slotName}</span>
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
