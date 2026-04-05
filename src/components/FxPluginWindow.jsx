import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  setFxSlotEffectType,
  setFxSlotGraphicEqPoint,
  toggleFxSlot,
} from "../store";

const FX_EFFECT_GRAPHIC_EQ = "graphic-eq";
const GRAPHIC_EQ_DEFAULT_POINT_FREQUENCIES = [
  50, 100, 250, 500, 1000, 3000, 8000,
];
const GRAPHIC_EQ_BAND_TYPES = [
  { value: "peaking", label: "Bell" },
  { value: "lowshelf", label: "Low Shelf" },
  { value: "highshelf", label: "High Shelf" },
  { value: "lowpass", label: "Low Pass" },
  { value: "highpass", label: "High Pass" },
];
const GRAPH_WIDTH = 420;
const GRAPH_HEIGHT = 204;
const GRAPH_MIN_FREQ = 20;
const GRAPH_MAX_FREQ = 20000;
const GRAPH_MAX_DB = 18;
const GRAPH_GRID_ROWS_PER_SIDE = 4;
const GRAPH_FREQUENCY_GUIDES = [
  20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000,
];
const WHEEL_SHAPE_STEP_PERCENT = 2;
const PEAKING_Q_MIN = 0.35;
const PEAKING_Q_MAX = 8;
const SHELF_Q_MIN = 0.25;
const SHELF_Q_MAX = 3.5;
const GRAPH_PADDING = {
  left: 10,
  right: 10,
  top: 10,
  bottom: 26,
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getDefaultEqBandType(index) {
  if (index === 0) {
    return "lowshelf";
  }

  if (index === GRAPHIC_EQ_DEFAULT_POINT_FREQUENCIES.length - 1) {
    return "highshelf";
  }

  return "peaking";
}

function sanitizeEqBandType(raw, fallback) {
  const requested = String(raw || "")
    .trim()
    .toLowerCase();
  if (
    GRAPHIC_EQ_BAND_TYPES.some(function (item) {
      return item.value === requested;
    })
  ) {
    return requested;
  }

  const safeFallback = String(fallback || "")
    .trim()
    .toLowerCase();
  if (
    GRAPHIC_EQ_BAND_TYPES.some(function (item) {
      return item.value === safeFallback;
    })
  ) {
    return safeFallback;
  }

  return "peaking";
}

function toDbLabel(value) {
  const rounded = Number(value || 0).toFixed(1);
  return (Number(rounded) > 0 ? "+" : "") + rounded + " dB";
}

function parseFrequencyInput(raw) {
  if (raw === null || raw === undefined) {
    return null;
  }

  let normalized = String(raw).trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  normalized = normalized.replace(/\s+/g, "").replace(/,/g, ".");

  let multiplier = 1;
  if (normalized.endsWith("khz")) {
    multiplier = 1000;
    normalized = normalized.slice(0, -3);
  } else if (normalized.endsWith("hz")) {
    normalized = normalized.slice(0, -2);
  } else if (normalized.endsWith("k")) {
    multiplier = 1000;
    normalized = normalized.slice(0, -1);
  }

  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  return clamp(numeric * multiplier, GRAPH_MIN_FREQ, GRAPH_MAX_FREQ);
}

function parseDbInput(raw) {
  if (raw === null || raw === undefined) {
    return null;
  }

  const normalized = String(raw).trim().replace(/,/g, ".");
  if (!normalized) {
    return null;
  }

  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  return clamp(numeric, -GRAPH_MAX_DB, GRAPH_MAX_DB);
}

function parseShapePercentInput(raw) {
  if (raw === null || raw === undefined) {
    return null;
  }

  const normalized = String(raw).trim().replace("%", "").replace(/,/g, ".");
  if (!normalized) {
    return null;
  }

  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  return clamp(Math.round(numeric), 0, 100);
}

function getPointShapePercent(point) {
  const bandType = sanitizeEqBandType(point?.bandType, "peaking");
  const q = clamp(Number(point?.q || 1.2), 0.25, 8);

  if (bandType === "peaking") {
    const clampedQ = clamp(q, PEAKING_Q_MIN, PEAKING_Q_MAX);
    const t = (PEAKING_Q_MAX - clampedQ) / (PEAKING_Q_MAX - PEAKING_Q_MIN);
    return Math.round(clamp(t, 0, 1) * 100);
  }

  const clampedQ = clamp(q, SHELF_Q_MIN, SHELF_Q_MAX);
  const t = (clampedQ - SHELF_Q_MIN) / (SHELF_Q_MAX - SHELF_Q_MIN);
  return Math.round(clamp(t, 0, 1) * 100);
}

function getQFromShapePercent(bandType, percent) {
  const safeBandType = sanitizeEqBandType(bandType, "peaking");
  const t = clamp(Number(percent || 0) / 100, 0, 1);

  if (safeBandType === "peaking") {
    return PEAKING_Q_MAX - t * (PEAKING_Q_MAX - PEAKING_Q_MIN);
  }

  return SHELF_Q_MIN + t * (SHELF_Q_MAX - SHELF_Q_MIN);
}

function toShapeLabel(point) {
  const percent = getPointShapePercent(point);
  return percent + "%";
}

function toFrequencyLabel(value) {
  const hz = Number(value || 0);
  if (hz >= 1000) {
    return (hz / 1000).toFixed(2).replace(/\.00$/, "") + "k";
  }
  return Math.round(hz) + "Hz";
}

function getSafeGraphicEqParams(raw) {
  const requestedPoints = Array.isArray(raw?.points) ? raw.points : [];
  const legacyBands = Array.isArray(raw?.bands) ? raw.bands : [];
  return {
    points: GRAPHIC_EQ_DEFAULT_POINT_FREQUENCIES.map(
      function (defaultFreq, index) {
        return {
          frequencyHz: clamp(
            Number(requestedPoints[index]?.frequencyHz || defaultFreq),
            GRAPH_MIN_FREQ,
            GRAPH_MAX_FREQ,
          ),
          gainDb: clamp(
            Number(
              requestedPoints[index]?.gainDb ??
                (Number.isFinite(legacyBands[index]) ? legacyBands[index] : 0),
            ),
            -GRAPH_MAX_DB,
            GRAPH_MAX_DB,
          ),
          q: clamp(Number(requestedPoints[index]?.q || 1.2), 0.25, 8),
          bandType: sanitizeEqBandType(
            requestedPoints[index]?.bandType,
            getDefaultEqBandType(index),
          ),
        };
      },
    ),
  };
}

function buildGraphicEqPath(params, width, height) {
  const safeParams = getSafeGraphicEqParams(params);
  const leftPad = GRAPH_PADDING.left;
  const rightPad = GRAPH_PADDING.right;
  const topPad = GRAPH_PADDING.top;
  const bottomPad = GRAPH_PADDING.bottom;
  const innerW = Math.max(1, width - leftPad - rightPad);
  const innerH = Math.max(1, height - topPad - bottomPad);

  const toX = function (frequencyHz) {
    const safeFreq = clamp(frequencyHz, GRAPH_MIN_FREQ, GRAPH_MAX_FREQ);
    const t =
      Math.log(safeFreq / GRAPH_MIN_FREQ) /
      Math.log(GRAPH_MAX_FREQ / GRAPH_MIN_FREQ);
    return leftPad + t * innerW;
  };

  const toY = function (dbValue) {
    const normalized =
      (clamp(dbValue, -GRAPH_MAX_DB, GRAPH_MAX_DB) + GRAPH_MAX_DB) /
      (GRAPH_MAX_DB * 2);
    return topPad + (1 - normalized) * innerH;
  };

  const evaluateDb = function (frequencyHz) {
    const logFrequency = Math.log2(frequencyHz);
    let db = 0;

    safeParams.points.forEach(function (point) {
      const logCenter = Math.log2(point.frequencyHz);
      const distance = Math.abs(logFrequency - logCenter);
      const qFactor = clamp(point.q, 0.25, 8) / 1.2;
      let influence = Math.exp(-Math.pow((distance * qFactor) / 0.62, 2));

      if (point.bandType === "lowshelf") {
        const slope = clamp(qFactor, 0.3, 6) * 3;
        influence = 1 / (1 + Math.exp((logFrequency - logCenter) * slope));
      } else if (point.bandType === "highshelf") {
        const slope = clamp(qFactor, 0.3, 6) * 3;
        influence = 1 / (1 + Math.exp((logCenter - logFrequency) * slope));
      } else if (point.bandType === "lowpass") {
        const slope = clamp(qFactor, 0.3, 6) * 2.4;
        const attenuation =
          GRAPH_MAX_DB / (1 + Math.exp(-(logFrequency - logCenter) * slope));
        db -= attenuation;
        return;
      } else if (point.bandType === "highpass") {
        const slope = clamp(qFactor, 0.3, 6) * 2.4;
        const attenuation =
          GRAPH_MAX_DB / (1 + Math.exp(-(logCenter - logFrequency) * slope));
        db -= attenuation;
        return;
      }

      db += point.gainDb * influence;
    });

    return clamp(db, -GRAPH_MAX_DB, GRAPH_MAX_DB);
  };

  const sampleCount = 120;
  const points = Array.from({ length: sampleCount + 1 }).map(
    function (_, index) {
      const t = index / sampleCount;
      const freq =
        GRAPH_MIN_FREQ * Math.pow(GRAPH_MAX_FREQ / GRAPH_MIN_FREQ, t);
      return {
        x: toX(freq),
        y: toY(evaluateDb(freq)),
      };
    },
  );

  return points
    .map(function (point, index) {
      const prefix = index === 0 ? "M" : "L";
      return prefix + " " + point.x.toFixed(2) + " " + point.y.toFixed(2);
    })
    .join(" ");
}

function buildSpectrumPaths(spectrum, width, height) {
  const values = Array.isArray(spectrum)
    ? spectrum.filter(function (value) {
        return Number.isFinite(Number(value));
      })
    : [];
  if (values.length < 2) {
    return {
      linePath: "",
      fillPath: "",
    };
  }

  const leftPad = GRAPH_PADDING.left;
  const rightPad = GRAPH_PADDING.right;
  const topPad = GRAPH_PADDING.top;
  const bottomPad = GRAPH_PADDING.bottom;
  const innerW = Math.max(1, width - leftPad - rightPad);
  const innerH = Math.max(1, height - topPad - bottomPad);
  const floorY = topPad + innerH;

  const points = values.map(function (rawValue, index) {
    const t = values.length > 1 ? index / (values.length - 1) : 0;
    const x = leftPad + t * innerW;
    const level = clamp(Number(rawValue || 0), 0, 1);
    const shaped = Math.pow(level, 0.66);
    const y = topPad + (1 - shaped) * innerH;
    return {
      x,
      y,
    };
  });

  const maxLevel = values.reduce(function (maxValue, current) {
    return Math.max(maxValue, Number(current || 0));
  }, 0);
  if (maxLevel < 0.01) {
    return {
      linePath: "",
      fillPath: "",
    };
  }

  const linePath = points
    .map(function (point, index) {
      const prefix = index === 0 ? "M" : "L";
      return prefix + " " + point.x.toFixed(2) + " " + point.y.toFixed(2);
    })
    .join(" ");

  const first = points[0];
  const last = points[points.length - 1];
  const fillPathSegments = [
    "M " + first.x.toFixed(2) + " " + floorY.toFixed(2),
    "L " + first.x.toFixed(2) + " " + first.y.toFixed(2),
  ];

  for (let index = 1; index < points.length; index += 1) {
    const point = points[index];
    fillPathSegments.push("L " + point.x.toFixed(2) + " " + point.y.toFixed(2));
  }

  fillPathSegments.push(
    "L " + last.x.toFixed(2) + " " + floorY.toFixed(2),
    "Z",
  );

  const fillPath = fillPathSegments.join(" ");

  return {
    linePath,
    fillPath,
  };
}

export function FxPluginWindow() {
  const dispatch = useDispatch();
  const graphRef = useRef(null);
  const cancelInlineEditRef = useRef(false);
  const [draggingPointIndex, setDraggingPointIndex] = useState(null);
  const [editingField, setEditingField] = useState(null);
  const [editingValue, setEditingValue] = useState("");
  const [isEmptyDropTarget, setIsEmptyDropTarget] = useState(false);

  const inserts = useSelector(function (state) {
    return state.daw.mixer.inserts;
  });
  const selectedInsertId = useSelector(function (state) {
    return state.daw.mixer.selectedInsertId;
  });
  const fxEditorTarget = useSelector(function (state) {
    return state.daw.ui.fxEditorTarget;
  });

  const activeInsert =
    inserts.find(function (insert) {
      return insert.id === fxEditorTarget?.insertId;
    }) ||
    inserts.find(function (insert) {
      return insert.id === selectedInsertId;
    }) ||
    inserts[0] ||
    null;

  const fxSlots = Array.isArray(activeInsert?.fxSlots)
    ? activeInsert.fxSlots
    : [];
  const activeSlot =
    fxSlots.find(function (slot) {
      return slot.id === fxEditorTarget?.slotId;
    }) ||
    fxSlots[0] ||
    null;

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

  const onEmptySlotDragOver = function (event) {
    const types = Array.from(event.dataTransfer?.types || []);
    const supportsEffectPayload =
      types.includes("application/x-daw-effect") ||
      types.includes("text/plain");

    if (!supportsEffectPayload) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    if (!isEmptyDropTarget) {
      setIsEmptyDropTarget(true);
    }
  };

  const onEmptySlotDragLeave = function (event) {
    event.stopPropagation();

    const related = event.relatedTarget;
    const currentTarget = event.currentTarget;
    if (
      related &&
      currentTarget &&
      typeof currentTarget.contains === "function" &&
      currentTarget.contains(related)
    ) {
      return;
    }

    if (isEmptyDropTarget) {
      setIsEmptyDropTarget(false);
    }
  };

  const onEmptySlotDrop = function (event) {
    event.preventDefault();
    event.stopPropagation();
    setIsEmptyDropTarget(false);

    if (!activeInsert || !activeSlot) {
      return;
    }

    const payload = readEffectPayloadFromDataTransfer(event.dataTransfer);
    if (!payload) {
      return;
    }

    dispatch(
      setFxSlotEffectType({
        insertId: activeInsert.id,
        slotId: activeSlot.id,
        effectType: payload.effectType,
      }),
    );

    if (!(activeSlot.effectType === payload.effectType && activeSlot.enabled)) {
      dispatch(
        toggleFxSlot({
          insertId: activeInsert.id,
          slotId: activeSlot.id,
        }),
      );
    }
  };

  const activeInsertId = activeInsert?.id || "";
  const activeSlotId = activeSlot?.id || "";

  const eqParams = useMemo(
    function () {
      return getSafeGraphicEqParams(activeSlot?.params);
    },
    [activeSlot?.params],
  );

  const eqCurvePath = useMemo(
    function () {
      return buildGraphicEqPath(eqParams, GRAPH_WIDTH, GRAPH_HEIGHT);
    },
    [eqParams],
  );

  const spectrumPaths = useMemo(
    function () {
      return buildSpectrumPaths(
        Array.isArray(activeInsert?.meterSpectrum)
          ? activeInsert.meterSpectrum
          : null,
        GRAPH_WIDTH,
        GRAPH_HEIGHT,
      );
    },
    [activeInsert?.meterSpectrum],
  );

  const pointCoordinates = useMemo(
    function () {
      const leftPad = GRAPH_PADDING.left;
      const rightPad = GRAPH_PADDING.right;
      const topPad = GRAPH_PADDING.top;
      const bottomPad = GRAPH_PADDING.bottom;
      const innerW = Math.max(1, GRAPH_WIDTH - leftPad - rightPad);
      const innerH = Math.max(1, GRAPH_HEIGHT - topPad - bottomPad);

      return eqParams.points.map(function (point) {
        const xRatio =
          Math.log(
            clamp(point.frequencyHz, GRAPH_MIN_FREQ, GRAPH_MAX_FREQ) /
              GRAPH_MIN_FREQ,
          ) / Math.log(GRAPH_MAX_FREQ / GRAPH_MIN_FREQ);
        const yRatio =
          (clamp(point.gainDb, -GRAPH_MAX_DB, GRAPH_MAX_DB) + GRAPH_MAX_DB) /
          (GRAPH_MAX_DB * 2);

        return {
          x: leftPad + xRatio * innerW,
          y: topPad + (1 - yRatio) * innerH,
        };
      });
    },
    [eqParams.points],
  );

  const updatePointFromClient = useCallback(
    function (clientX, clientY, pointIndex) {
      if (!graphRef.current || !activeInsertId || !activeSlotId) {
        return;
      }

      const rect = graphRef.current.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return;
      }

      const leftPad = GRAPH_PADDING.left;
      const rightPad = GRAPH_PADDING.right;
      const topPad = GRAPH_PADDING.top;
      const bottomPad = GRAPH_PADDING.bottom;
      const innerW = Math.max(1, GRAPH_WIDTH - leftPad - rightPad);
      const innerH = Math.max(1, GRAPH_HEIGHT - topPad - bottomPad);

      const normalizedX = (clientX - rect.left) / rect.width;
      const normalizedY = (clientY - rect.top) / rect.height;

      const graphX = clamp(
        normalizedX * GRAPH_WIDTH,
        leftPad,
        GRAPH_WIDTH - rightPad,
      );
      const graphY = clamp(
        normalizedY * GRAPH_HEIGHT,
        topPad,
        GRAPH_HEIGHT - bottomPad,
      );

      const freqRatio = (graphX - leftPad) / innerW;
      const gainRatio = 1 - (graphY - topPad) / innerH;

      const frequencyHz = clamp(
        GRAPH_MIN_FREQ * Math.pow(GRAPH_MAX_FREQ / GRAPH_MIN_FREQ, freqRatio),
        GRAPH_MIN_FREQ,
        GRAPH_MAX_FREQ,
      );
      const gainDb = clamp(
        gainRatio * GRAPH_MAX_DB * 2 - GRAPH_MAX_DB,
        -GRAPH_MAX_DB,
        GRAPH_MAX_DB,
      );

      dispatch(
        setFxSlotGraphicEqPoint({
          insertId: activeInsertId,
          slotId: activeSlotId,
          pointIndex,
          frequencyHz,
          gainDb,
        }),
      );
    },
    [activeInsertId, activeSlotId, dispatch],
  );

  useEffect(
    function () {
      if (draggingPointIndex === null) {
        return;
      }

      const onMouseMove = function (event) {
        updatePointFromClient(event.clientX, event.clientY, draggingPointIndex);
      };

      const onMouseUp = function () {
        setDraggingPointIndex(null);
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);

      return function () {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };
    },
    [draggingPointIndex, updatePointFromClient],
  );

  if (!activeInsert || !activeSlot) {
    return (
      <section className="fx-plugin-panel fx-window-panel">
        <div className="fx-empty-slot">
          <p>No FX slot selected.</p>
          <p>Click a slot in the Mixer to open the effect editor.</p>
        </div>
      </section>
    );
  }

  if (activeSlot.effectType !== FX_EFFECT_GRAPHIC_EQ) {
    return (
      <section className="fx-plugin-panel fx-window-panel">
        <div
          className={
            "fx-empty-slot" + (isEmptyDropTarget ? " is-drop-target" : "")
          }
          onDragOver={onEmptySlotDragOver}
          onDragLeave={onEmptySlotDragLeave}
          onDrop={onEmptySlotDrop}
        >
          <p>This slot is empty.</p>
          <p>Drag an effect from Browser/Plugins/Effects and drop it here.</p>
        </div>
      </section>
    );
  }

  const graphLeft = GRAPH_PADDING.left;
  const graphRight = GRAPH_PADDING.right;
  const graphTop = GRAPH_PADDING.top;
  const graphBottom = GRAPH_PADDING.bottom;
  const graphInnerWidth = Math.max(1, GRAPH_WIDTH - graphLeft - graphRight);
  const graphInnerHeight = Math.max(1, GRAPH_HEIGHT - graphTop - graphBottom);
  const dbGridValues = Array.from({
    length: GRAPH_GRID_ROWS_PER_SIDE * 2 + 1,
  }).map(function (_, index) {
    const t = index / (GRAPH_GRID_ROWS_PER_SIDE * 2);
    return -GRAPH_MAX_DB + t * GRAPH_MAX_DB * 2;
  });
  const getFrequencyGridX = function (frequencyHz) {
    const safeFreq = clamp(frequencyHz, GRAPH_MIN_FREQ, GRAPH_MAX_FREQ);
    const ratio =
      Math.log(safeFreq / GRAPH_MIN_FREQ) /
      Math.log(GRAPH_MAX_FREQ / GRAPH_MIN_FREQ);
    return graphLeft + ratio * graphInnerWidth;
  };

  const adjustPointShapeByWheel = function (event, pointIndex) {
    const targetTagName = String(event.target?.tagName || "").toUpperCase();
    if (targetTagName === "SELECT" || targetTagName === "OPTION") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const point = eqParams.points[pointIndex];
    if (!point) {
      return;
    }

    const currentPercent = getPointShapePercent(point);
    const direction = event.deltaY < 0 ? 1 : -1;
    const nextPercent = clamp(
      currentPercent + direction * WHEEL_SHAPE_STEP_PERCENT,
      0,
      100,
    );
    const nextQ = getQFromShapePercent(point.bandType, nextPercent);

    if (!activeInsertId || !activeSlotId) {
      return;
    }

    dispatch(
      setFxSlotGraphicEqPoint({
        insertId: activeInsertId,
        slotId: activeSlotId,
        pointIndex,
        q: nextQ,
      }),
    );
  };

  const beginInlineEdit = function (point, pointIndex, field) {
    if (field === "frequency") {
      setEditingValue(String(Math.round(point.frequencyHz)));
    } else if (field === "gain") {
      setEditingValue(Number(point.gainDb || 0).toFixed(1));
    } else {
      setEditingValue(String(getPointShapePercent(point)));
    }

    setEditingField({
      pointIndex,
      field,
    });
  };

  const cancelInlineEdit = function () {
    setEditingField(null);
    setEditingValue("");
  };

  const commitInlineEdit = function () {
    if (!editingField) {
      return;
    }

    const point = eqParams.points[editingField.pointIndex];
    if (!point) {
      cancelInlineEdit();
      return;
    }

    if (!activeInsertId || !activeSlotId) {
      cancelInlineEdit();
      return;
    }

    if (editingField.field === "frequency") {
      const nextFrequencyHz = parseFrequencyInput(editingValue);
      if (nextFrequencyHz !== null) {
        dispatch(
          setFxSlotGraphicEqPoint({
            insertId: activeInsertId,
            slotId: activeSlotId,
            pointIndex: editingField.pointIndex,
            frequencyHz: nextFrequencyHz,
          }),
        );
      }
    } else if (editingField.field === "gain") {
      const nextGainDb = parseDbInput(editingValue);
      if (nextGainDb !== null) {
        dispatch(
          setFxSlotGraphicEqPoint({
            insertId: activeInsertId,
            slotId: activeSlotId,
            pointIndex: editingField.pointIndex,
            gainDb: nextGainDb,
          }),
        );
      }
    } else {
      const nextPercent = parseShapePercentInput(editingValue);
      if (nextPercent !== null) {
        dispatch(
          setFxSlotGraphicEqPoint({
            insertId: activeInsertId,
            slotId: activeSlotId,
            pointIndex: editingField.pointIndex,
            q: getQFromShapePercent(point.bandType, nextPercent),
          }),
        );
      }
    }

    cancelInlineEdit();
  };

  const onInlineEditKeyDown = function (event) {
    if (event.key === "Enter") {
      event.preventDefault();
      commitInlineEdit();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      cancelInlineEditRef.current = true;
      cancelInlineEdit();
    }
  };

  const onInlineEditBlur = function () {
    if (cancelInlineEditRef.current) {
      cancelInlineEditRef.current = false;
      return;
    }

    commitInlineEdit();
  };

  return (
    <section className="fx-plugin-panel fx-window-panel">
      <div className="fx-proq-shell">
        <div className="fx-proq-graph-wrap">
          <svg
            ref={graphRef}
            className="fx-proq-graph"
            viewBox={"0 0 " + GRAPH_WIDTH + " " + GRAPH_HEIGHT}
            preserveAspectRatio="none"
            aria-label="Parametric EQ response"
          >
            {dbGridValues.map(function (dbValue) {
              const y =
                graphTop +
                (1 - (dbValue + GRAPH_MAX_DB) / (GRAPH_MAX_DB * 2)) *
                  graphInnerHeight;
              return (
                <line
                  key={"db-" + dbValue}
                  x1={graphLeft}
                  y1={y}
                  x2={GRAPH_WIDTH - graphRight}
                  y2={y}
                  className="fx-proq-grid-line"
                />
              );
            })}

            {GRAPH_FREQUENCY_GUIDES.map(function (frequencyHz) {
              const x = getFrequencyGridX(frequencyHz);
              return (
                <line
                  key={"freq-" + frequencyHz}
                  x1={x}
                  y1={graphTop}
                  x2={x}
                  y2={GRAPH_HEIGHT - graphBottom}
                  className="fx-proq-grid-line"
                />
              );
            })}

            {GRAPH_FREQUENCY_GUIDES.map(function (frequencyHz, markerIndex) {
              const x = getFrequencyGridX(frequencyHz);
              const isFirst = markerIndex === 0;
              const isLast = markerIndex === GRAPH_FREQUENCY_GUIDES.length - 1;

              return (
                <text
                  key={"freq-label-" + frequencyHz}
                  className="fx-proq-frequency-label"
                  x={x}
                  y={GRAPH_HEIGHT - 8}
                  textAnchor={isFirst ? "start" : isLast ? "end" : "middle"}
                >
                  {toFrequencyLabel(frequencyHz)}
                </text>
              );
            })}

            {spectrumPaths.fillPath ? (
              <path
                d={spectrumPaths.fillPath}
                className="fx-proq-spectrum-fill"
              />
            ) : null}

            {spectrumPaths.linePath ? (
              <path
                d={spectrumPaths.linePath}
                className="fx-proq-spectrum-line"
              />
            ) : null}

            <path d={eqCurvePath} className="fx-proq-curve" />

            {pointCoordinates.map(function (point, index) {
              return (
                <g
                  key={"eq-point-" + index}
                  className={
                    "fx-proq-point" +
                    (draggingPointIndex === index ? " is-active" : "")
                  }
                  transform={
                    "translate(" +
                    point.x.toFixed(2) +
                    " " +
                    point.y.toFixed(2) +
                    ")"
                  }
                  onWheel={function (event) {
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
                  <text
                    className="fx-proq-point-index"
                    textAnchor="middle"
                    dy="4"
                  >
                    {index + 1}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        <div className="fx-proq-readouts">
          {eqParams.points.map(function (point, index) {
            return (
              <div
                key={"readout-" + index}
                className={
                  "fx-proq-readout" +
                  (draggingPointIndex === index ? " is-active" : "")
                }
                onWheel={function (event) {
                  adjustPointShapeByWheel(event, index);
                }}
              >
                <span>P{index + 1}</span>
                {editingField?.pointIndex === index &&
                editingField.field === "frequency" ? (
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
                {editingField?.pointIndex === index &&
                editingField.field === "gain" ? (
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
                {editingField?.pointIndex === index &&
                editingField.field === "shape" ? (
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
                <select
                  className="fx-proq-band-type"
                  value={point.bandType}
                  onChange={function (event) {
                    dispatch(
                      setFxSlotGraphicEqPoint({
                        insertId: activeInsertId,
                        slotId: activeSlotId,
                        pointIndex: index,
                        bandType: event.target.value,
                      }),
                    );
                  }}
                >
                  {GRAPHIC_EQ_BAND_TYPES.map(function (bandType) {
                    return (
                      <option key={bandType.value} value={bandType.value}>
                        {bandType.label}
                      </option>
                    );
                  })}
                </select>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
