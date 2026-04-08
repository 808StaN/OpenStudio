import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  setFxSlotEffectType,
  setFxSlotGraphicEqPoint,
  setFxSlotMaximizerParam,
  setFxSlotReverbParam,
  toggleFxSlot,
} from "../store";

const FX_EFFECT_GRAPHIC_EQ = "graphic-eq";
const FX_EFFECT_REVERB = "reverb";
const FX_EFFECT_MAXIMIZER = "maximizer";
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

function isSupportedEffectType(effectType) {
  return (
    effectType === FX_EFFECT_GRAPHIC_EQ ||
    effectType === FX_EFFECT_REVERB ||
    effectType === FX_EFFECT_MAXIMIZER
  );
}

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

function getSafeReverbParams(raw) {
  const base = {
    decayTime: 2.8,
    preDelayMs: 24,
    size: 0.62,
    damping: 0.45,
    hiCutHz: 9000,
    loCutHz: 130,
    earlyReflections: 0.38,
    diffusion: 0.72,
    modulationDepth: 0.22,
    modulationRateHz: 0.35,
    width: 0.9,
    dryWet: 0.34,
    freeze: false,
    ...(raw || {}),
  };

  return {
    decayTime: clamp(Number(base.decayTime ?? 2.8), 0.2, 20),
    preDelayMs: clamp(Number(base.preDelayMs ?? 24), 0, 250),
    size: clamp(Number(base.size ?? 0.62), 0, 1),
    damping: clamp(Number(base.damping ?? 0.45), 0, 1),
    hiCutHz: clamp(Number(base.hiCutHz ?? 9000), 1200, 18000),
    loCutHz: clamp(Number(base.loCutHz ?? 130), 20, 1200),
    earlyReflections: clamp(Number(base.earlyReflections ?? 0.38), 0, 1),
    diffusion: clamp(Number(base.diffusion ?? 0.72), 0, 1),
    modulationDepth: clamp(Number(base.modulationDepth ?? 0.22), 0, 1),
    modulationRateHz: clamp(Number(base.modulationRateHz ?? 0.35), 0, 8),
    width: clamp(Number(base.width ?? 0.9), 0, 1),
    dryWet: clamp(Number(base.dryWet ?? 0.34), 0, 1),
    freeze: Boolean(base.freeze),
  };
}

const MAXIMIZER_MODES = [
  { value: "irc-ll", label: "IRC LL" },
  { value: "irc-i", label: "IRC I" },
  { value: "irc-ii", label: "IRC II" },
  { value: "irc-iii", label: "IRC III" },
  { value: "irc-iv", label: "IRC IV" },
];

function sanitizeMaximizerMode(rawMode) {
  const requested = String(rawMode || "")
    .trim()
    .toLowerCase();

  const supported = MAXIMIZER_MODES.some(function (mode) {
    return mode.value === requested;
  });

  return supported ? requested : "irc-ii";
}

function getSafeMaximizerParams(raw) {
  const legacyThreshold = Number(raw?.thresholdDb);
  const legacyCeiling = Number(raw?.ceilingDb);
  const legacyCharacter = Number(raw?.character);
  const legacyMode = sanitizeMaximizerMode(raw?.mode);
  const isLegacyDefault =
    Number.isFinite(legacyThreshold) &&
    Number.isFinite(legacyCeiling) &&
    Number.isFinite(legacyCharacter) &&
    Math.abs(legacyThreshold + 6) < 0.001 &&
    Math.abs(legacyCeiling + 0.1) < 0.001 &&
    Math.abs(legacyCharacter - 0.58) < 0.001 &&
    legacyMode === "irc-ii" &&
    Boolean(raw?.truePeakEnabled ?? true);

  const base = {
    mode: "irc-ii",
    truePeakEnabled: true,
    thresholdDb: 0,
    ceilingDb: -1,
    character: 0.5,
    ...(raw || {}),
  };

  if (isLegacyDefault) {
    base.thresholdDb = 0;
    base.ceilingDb = -1;
    base.character = 0.5;
  }

  return {
    mode: sanitizeMaximizerMode(base.mode),
    truePeakEnabled: Boolean(base.truePeakEnabled),
    thresholdDb: clamp(Number(base.thresholdDb ?? 0), -24, 0),
    ceilingDb: clamp(Number(base.ceilingDb ?? -1), -18, 0),
    character: clamp(Number(base.character ?? 0.5), 0, 1),
  };
}

function formatPercent(value) {
  return Math.round(Number(value || 0) * 100) + "%";
}

function formatMs(value) {
  return Math.round(Number(value || 0)) + " ms";
}

function formatSeconds(value) {
  return (
    Number(value || 0)
      .toFixed(2)
      .replace(/\.00$/, "") + " s"
  );
}

function roundToStep(value, step) {
  const safeStep = Math.max(0.000001, Number(step || 0.01));
  return Math.round(Number(value || 0) / safeStep) * safeStep;
}

function parseNumericInput(raw) {
  if (raw === null || raw === undefined) {
    return null;
  }

  const normalized = String(raw)
    .trim()
    .replace(/,/g, ".")
    .replace(/[^0-9+\-.]/g, "");

  if (!normalized) {
    return null;
  }

  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  return numeric;
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

function buildWaveformPath(waveform, width, height) {
  const values = Array.isArray(waveform)
    ? waveform.filter(function (value) {
        return Number.isFinite(Number(value));
      })
    : [];

  if (values.length < 2) {
    return "";
  }

  const centerY = height * 0.5;
  const amplitude = Math.max(1, height * 0.44);

  return values
    .map(function (value, index) {
      const x =
        values.length > 1
          ? (1 - index / (values.length - 1)) * width
          : width * 0.5;
      const normalized = clamp(Number(value || 0), -1, 1);
      const y = centerY - normalized * amplitude;
      const prefix = index === 0 ? "M" : "L";
      return prefix + " " + x.toFixed(2) + " " + y.toFixed(2);
    })
    .join(" ");
}

function buildWaveformReductionPath(waveform, width, height, limitAmplitude) {
  const values = Array.isArray(waveform)
    ? waveform.filter(function (value) {
        return Number.isFinite(Number(value));
      })
    : [];

  if (values.length < 2) {
    return "";
  }

  const centerY = height * 0.5;
  const amplitude = Math.max(1, height * 0.44);
  const threshold = clamp(Number(limitAmplitude || 1), 0, 1);
  const segments = [];
  let active = [];

  values.forEach(function (value, index) {
    const normalized = clamp(Number(value || 0), -1, 1);
    const x =
      values.length > 1
        ? (1 - index / (values.length - 1)) * width
        : width * 0.5;
    const y = centerY - normalized * amplitude;
    const isReduced = Math.abs(normalized) >= threshold;

    if (isReduced) {
      active.push({
        x,
        y,
      });
      return;
    }

    if (active.length >= 2) {
      segments.push(active);
    }
    active = [];
  });

  if (active.length >= 2) {
    segments.push(active);
  }

  return segments
    .map(function (segment) {
      return segment
        .map(function (point, index) {
          const prefix = index === 0 ? "M" : "L";
          return prefix + " " + point.x.toFixed(2) + " " + point.y.toFixed(2);
        })
        .join(" ");
    })
    .join(" ");
}

function buildMaximizerTransferPath(params, width, height) {
  const safe = getSafeMaximizerParams(params);
  const thresholdNorm = (safe.thresholdDb + 24) / 24;
  const ceilingNorm = (safe.ceilingDb + 18) / 18;
  const knee = 0.08 + safe.character * 0.18;
  const points = [];

  for (let i = 0; i <= 120; i += 1) {
    const xNorm = i / 120;
    let yNorm = xNorm;
    if (xNorm > thresholdNorm) {
      const over = xNorm - thresholdNorm;
      const compressed = thresholdNorm + over * (0.14 + (1 - safe.character) * 0.52);
      const t = clamp(over / Math.max(0.0001, 1 - thresholdNorm), 0, 1);
      yNorm = compressed * (1 - knee * t) + ceilingNorm * knee * t;
    }
    yNorm = Math.min(yNorm, ceilingNorm);
    points.push({
      x: xNorm * width,
      y: height - yNorm * height,
    });
  }

  return points
    .map(function (point, index) {
      const prefix = index === 0 ? "M" : "L";
      return prefix + " " + point.x.toFixed(2) + " " + point.y.toFixed(2);
    })
    .join(" ");
}

export function FxPluginWindow() {
  const dispatch = useDispatch();
  const graphRef = useRef(null);
  const cancelInlineEditRef = useRef(false);
  const reverbDragRef = useRef(null);
  const [draggingPointIndex, setDraggingPointIndex] = useState(null);
  const [editingField, setEditingField] = useState(null);
  const [editingValue, setEditingValue] = useState("");
  const [draggingReverbParam, setDraggingReverbParam] = useState("");
  const [editingReverbParam, setEditingReverbParam] = useState("");
  const [editingReverbText, setEditingReverbText] = useState("");
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
          isSupportedEffectType(payload.effectType)
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

  const reverbParams = useMemo(
    function () {
      return getSafeReverbParams(activeSlot?.params);
    },
    [activeSlot?.params],
  );

  const eqParams = useMemo(
    function () {
      return getSafeGraphicEqParams(activeSlot?.params);
    },
    [activeSlot?.params],
  );

  const maximizerParams = useMemo(
    function () {
      return getSafeMaximizerParams(activeSlot?.params);
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
    [activeInsert],
  );

  const maximizerWaveformPath = useMemo(
    function () {
      return buildWaveformPath(
        Array.isArray(activeInsert?.meterWaveform)
          ? activeInsert.meterWaveform
          : null,
        520,
        152,
      );
    },
    [activeInsert],
  );

  const maximizerTransferPath = useMemo(
    function () {
      return buildMaximizerTransferPath(maximizerParams, 520, 152);
    },
    [maximizerParams],
  );

  const maximizerThresholdWavePath = useMemo(
    function () {
      const thresholdAmplitude = clamp(
        Math.pow(10, Number(maximizerParams.thresholdDb || 0) / 20),
        0,
        1,
      );
      return buildWaveformReductionPath(
        Array.isArray(activeInsert?.meterWaveform)
          ? activeInsert.meterWaveform
          : null,
        520,
        152,
        thresholdAmplitude,
      );
    },
    [activeInsert, maximizerParams.thresholdDb],
  );

  const maximizerOutDb = useMemo(
    function () {
      if (Number.isFinite(Number(activeInsert?.maximizerOutputDb))) {
        return clamp(Number(activeInsert.maximizerOutputDb), -96, 6);
      }
      return -96;
    },
    [activeInsert],
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

  const setReverbValue = function (param, value) {
    if (!activeInsertId || !activeSlotId) {
      return;
    }

    dispatch(
      setFxSlotReverbParam({
        insertId: activeInsertId,
        slotId: activeSlotId,
        param,
        value,
      }),
    );
  };

  const setMaximizerValue = function (param, value) {
    if (!activeInsertId || !activeSlotId) {
      return;
    }

    dispatch(
      setFxSlotMaximizerParam({
        insertId: activeInsertId,
        slotId: activeSlotId,
        param,
        value,
      }),
    );
  };

  const reverbControls = [
    {
      param: "decayTime",
      label: "Decay",
      min: 0.2,
      max: 20,
      step: 0.01,
      defaultValue: 2.8,
      format: formatSeconds,
    },
    {
      param: "preDelayMs",
      label: "PreDelay",
      min: 0,
      max: 250,
      step: 1,
      defaultValue: 24,
      format: formatMs,
    },
    {
      param: "size",
      label: "Size",
      min: 0,
      max: 1,
      step: 0.01,
      defaultValue: 0.62,
      format: formatPercent,
    },
    {
      param: "damping",
      label: "Damping",
      min: 0,
      max: 1,
      step: 0.01,
      defaultValue: 0.45,
      format: formatPercent,
    },
    {
      param: "hiCutHz",
      label: "HiCut",
      min: 1200,
      max: 18000,
      step: 10,
      defaultValue: 9000,
      format: function (value) {
        return Math.round(Number(value || 0)) + " Hz";
      },
    },
    {
      param: "loCutHz",
      label: "LoCut",
      min: 20,
      max: 1200,
      step: 1,
      defaultValue: 130,
      format: function (value) {
        return Math.round(Number(value || 0)) + " Hz";
      },
    },
    {
      param: "earlyReflections",
      label: "Early",
      min: 0,
      max: 1,
      step: 0.01,
      defaultValue: 0.38,
      format: formatPercent,
    },
    {
      param: "diffusion",
      label: "Diffusion",
      min: 0,
      max: 1,
      step: 0.01,
      defaultValue: 0.72,
      format: formatPercent,
    },
    {
      param: "modulationDepth",
      label: "Mod Depth",
      min: 0,
      max: 1,
      step: 0.01,
      defaultValue: 0.22,
      format: formatPercent,
    },
    {
      param: "modulationRateHz",
      label: "Mod Rate",
      min: 0,
      max: 8,
      step: 0.01,
      defaultValue: 0.35,
      format: function (value) {
        return Number(value || 0).toFixed(2) + " Hz";
      },
    },
    {
      param: "width",
      label: "Width",
      min: 0,
      max: 1,
      step: 0.01,
      defaultValue: 0.9,
      format: formatPercent,
    },
    {
      param: "dryWet",
      label: "Mix",
      min: 0,
      max: 1,
      step: 0.01,
      defaultValue: 0.34,
      format: formatPercent,
    },
  ];

  const beginReverbDrag = function (event, control) {
    event.preventDefault();

    const startValue = Number(reverbParams[control.param] || 0);
    reverbDragRef.current = {
      param: control.param,
      startY: event.clientY,
      startValue,
      control,
    };
    setDraggingReverbParam(control.param);
  };

  const adjustReverbValue = function (control, rawValue) {
    const clampedValue = clamp(rawValue, control.min, control.max);
    const stepped = roundToStep(clampedValue, control.step);
    setReverbValue(control.param, stepped);
  };

  const onReverbWheel = function (event, control) {
    event.preventDefault();
    const direction = event.deltaY < 0 ? 1 : -1;
    const current = Number(reverbParams[control.param] || 0);
    const wheelFactor = event.shiftKey ? 0.4 : 2;
    adjustReverbValue(
      control,
      current + direction * control.step * wheelFactor,
    );
  };

  const resetReverbControl = function (control) {
    adjustReverbValue(control, Number(control.defaultValue));
  };

  const beginReverbEdit = function (control) {
    const raw = Number(reverbParams[control.param] || 0);
    setEditingReverbParam(control.param);
    setEditingReverbText(String(roundToStep(raw, control.step)));
  };

  const commitReverbEdit = function (control) {
    const parsed = parseNumericInput(editingReverbText);
    if (parsed !== null) {
      adjustReverbValue(control, parsed);
    }
    setEditingReverbParam("");
    setEditingReverbText("");
  };

  useEffect(
    function () {
      if (!draggingReverbParam || !reverbDragRef.current) {
        return;
      }

      const onMouseMove = function (event) {
        const drag = reverbDragRef.current;
        if (!drag) {
          return;
        }

        const range = drag.control.max - drag.control.min;
        const delta = drag.startY - event.clientY;
        const valuePerPixel = range / (event.shiftKey ? 700 : 160);
        adjustReverbValue(
          drag.control,
          drag.startValue + delta * valuePerPixel,
        );
      };

      const onMouseUp = function () {
        reverbDragRef.current = null;
        setDraggingReverbParam("");
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);

      return function () {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };
    },
    [draggingReverbParam],
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

  if (activeSlot.effectType === FX_EFFECT_MAXIMIZER) {
    const thresholdPosition =
      clamp(((maximizerParams.thresholdDb + 24) / 24) * 100, 0, 98.05);
    const ceilingPosition = clamp(
      ((maximizerParams.ceilingDb + 18) / 18) * 100,
      0,
      98.05,
    );
    const characterDisplay = (Number(maximizerParams.character || 0) * 10)
      .toFixed(2)
      .replace(".", ",");
    const reductionDb = Math.max(
      0,
      Number(activeInsert?.maximizerReduction || 0),
    );
    const stereoMeter = activeInsert?.maximizerStereoMeter || {};
    const toVolumeHeight = function (db) {
      const safeDb = clamp(Number(db ?? -96), -96, 0);
      return ((safeDb + 96) / 96) * 100;
    };
    const toReductionHeight = function (db) {
      const safeDb = clamp(Number(db ?? 0), 0, 24);
      const normalized = clamp(safeDb / 12, 0, 1);
      const shaped = Math.pow(normalized, 0.75);
      return shaped * 100;
    };
    const leftVolumeHeight = toVolumeHeight(stereoMeter.leftVolumeDb);
    const rightVolumeHeight = toVolumeHeight(stereoMeter.rightVolumeDb);
    const leftReductionRaw = Number(stereoMeter.leftReductionDb ?? reductionDb);
    const rightReductionRaw = Number(stereoMeter.rightReductionDb ?? reductionDb);
    const leftReductionHeight = toReductionHeight(
      Math.max(leftReductionRaw, reductionDb * 0.9),
    );
    const rightReductionHeight = toReductionHeight(
      Math.max(rightReductionRaw, reductionDb * 0.9),
    );

    return (
      <section className="fx-plugin-panel fx-window-panel">
        <div className="fx-maximizer-shell">
          <div className="fx-maximizer-graph-wrap">
            <div className="fx-maximizer-graph-header">
              <span>Limiter Trace</span>
              <span>
                Reduction: {reductionDb.toFixed(1)} dB | Out:{" "}
                {toDbLabel(maximizerOutDb)}
              </span>
            </div>
            <svg
              className="fx-maximizer-graph"
              viewBox="0 0 520 152"
              preserveAspectRatio="none"
              aria-label="Maximizer waveform and limiting graph"
            >
              <line x1="0" y1="76" x2="520" y2="76" className="fx-max-center" />
              {maximizerWaveformPath ? (
                <path d={maximizerWaveformPath} className="fx-max-wave-input" />
              ) : null}
              {maximizerThresholdWavePath ? (
                <path
                  d={maximizerThresholdWavePath}
                  className="fx-max-wave-reduction"
                />
              ) : null}
              <path d={maximizerTransferPath} className="fx-max-transfer-line" />
            </svg>
          </div>

          <div className="fx-maximizer-controls">
            <section className="fx-max-limiter-panel">
              <label className="fx-max-true-peak">
                <input
                  type="checkbox"
                  checked={maximizerParams.truePeakEnabled}
                  onChange={function (event) {
                    setMaximizerValue("truePeakEnabled", event.target.checked);
                  }}
                />
                <span>True Peak</span>
              </label>

              <div className="fx-max-limiter-meter">
                <div className="fx-max-limiter-combined">
                  <div className="fx-max-combined-cell" title="Left Volume">
                    <div
                      className="fx-max-combined-fill is-volume"
                      style={{ height: leftVolumeHeight + "%" }}
                    />
                  </div>
                  <div className="fx-max-combined-cell" title="Left Reduction">
                    <div
                      className="fx-max-combined-fill is-reduction"
                      style={{ height: leftReductionHeight + "%" }}
                    />
                  </div>
                  <div className="fx-max-combined-cell" title="Right Reduction">
                    <div
                      className="fx-max-combined-fill is-reduction"
                      style={{ height: rightReductionHeight + "%" }}
                    />
                  </div>
                  <div className="fx-max-combined-cell" title="Right Volume">
                    <div
                      className="fx-max-combined-fill is-volume"
                      style={{ height: rightVolumeHeight + "%" }}
                    />
                  </div>
                  <div
                    className="fx-max-threshold-line"
                    style={{ bottom: thresholdPosition + "%" }}
                  />
                  <div
                    className="fx-max-ceiling-line"
                    style={{ bottom: ceilingPosition + "%" }}
                  />
                </div>
                <div className="fx-max-limiter-sliders">
                  <input
                    type="range"
                    min="-24"
                    max="0"
                    step="0.1"
                    value={maximizerParams.thresholdDb}
                    onChange={function (event) {
                      setMaximizerValue("thresholdDb", Number(event.target.value));
                    }}
                    className="fx-max-vertical"
                    title="Threshold"
                  />
                  <input
                    type="range"
                    min="-18"
                    max="0"
                    step="0.1"
                    value={maximizerParams.ceilingDb}
                    onChange={function (event) {
                      setMaximizerValue("ceilingDb", Number(event.target.value));
                    }}
                    className="fx-max-vertical"
                    title="Ceiling"
                  />
                </div>
              </div>

              <div className="fx-max-limiter-readouts">
                <span>Threshold {maximizerParams.thresholdDb.toFixed(1)} dB</span>
                <span>Ceiling {maximizerParams.ceilingDb.toFixed(1)} dB</span>
              </div>
            </section>

            <section className="fx-max-character-panel">
              <h4>Character</h4>
              <div className="fx-max-character-slider">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={maximizerParams.character}
                  onChange={function (event) {
                    setMaximizerValue("character", Number(event.target.value));
                  }}
                  className="fx-max-character-vertical"
                />
              </div>
              <div className="fx-max-character-scale">
                <strong>{characterDisplay}</strong>
              </div>
            </section>
          </div>
        </div>
      </section>
    );
  }

  if (activeSlot.effectType === FX_EFFECT_REVERB) {
    return (
      <section className="fx-plugin-panel fx-window-panel">
        <div className="fx-reverb-shell">
          <div className="fx-reverb-grid">
            {reverbControls.map(function (control) {
              const value = Number(reverbParams[control.param] || 0);
              const ratio =
                control.max > control.min
                  ? (value - control.min) / (control.max - control.min)
                  : 0;
              const clampedRatio = clamp(ratio, 0, 1);

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

