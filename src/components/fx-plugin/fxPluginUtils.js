import {
  FX_EFFECT_GRAPHIC_EQ,
  FX_EFFECT_MAXIMIZER,
  FX_EFFECT_REVERB,
  getSafeGraphicEqParams,
  getSafeMaximizerParams,
  sanitizeEqBandType,
} from "../../audio/domain/fxParams";

// Dropdown options used by the EQ band-type selector.
export const GRAPHIC_EQ_BAND_TYPES = [
  { value: "peaking", label: "Bell" },
  { value: "lowshelf", label: "Low Shelf" },
  { value: "highshelf", label: "High Shelf" },
  { value: "lowpass", label: "Low Pass" },
  { value: "highpass", label: "High Pass" },
];

// Graph bounds and tuning constants for the EQ and analyzer visualizations.
export const GRAPH_WIDTH = 420;
export const GRAPH_HEIGHT = 204;
export const GRAPH_MIN_FREQ = 20;
export const GRAPH_MAX_FREQ = 20000;
export const GRAPH_MAX_DB = 18;
export const GRAPH_GRID_ROWS_PER_SIDE = 4;
export const GRAPH_FREQUENCY_GUIDES = [
  20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000,
];
export const WHEEL_SHAPE_STEP_PERCENT = 2;
export const PEAKING_Q_MIN = 0.35;
export const PEAKING_Q_MAX = 8;
export const SHELF_Q_MIN = 0.25;
export const SHELF_Q_MAX = 3.5;
export const GRAPH_PADDING = {
  left: 10,
  right: 10,
  top: 10,
  bottom: 26,
};

// We accept only these effect payloads when dropping from Browser -> Mixer slot.
export function isSupportedEffectType(effectType) {
  return (
    effectType === FX_EFFECT_GRAPHIC_EQ ||
    effectType === FX_EFFECT_REVERB ||
    effectType === FX_EFFECT_MAXIMIZER
  );
}

// Shared numeric clamp used by all curve/slider calculations.
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// Human-readable dB formatting used by multiple FX readouts.
export function toDbLabel(value) {
  const rounded = Number(value || 0).toFixed(1);
  return (Number(rounded) > 0 ? "+" : "") + rounded + " dB";
}

// Parses values like "200", "2k", "2khz", "2000hz" into clamped Hz.
export function parseFrequencyInput(raw) {
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

// Parses gain text input and clamps it to the visible EQ range.
export function parseDbInput(raw) {
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

// Parses "shape" text field where users type percentages.
export function parseShapePercentInput(raw) {
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

// Converts internal Q to a UI-friendly 0-100% "shape" value.
export function getPointShapePercent(point) {
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

// Converts 0-100% shape back to Q, with different curves per band type.
export function getQFromShapePercent(bandType, percent) {
  const safeBandType = sanitizeEqBandType(bandType, "peaking");
  const t = clamp(Number(percent || 0) / 100, 0, 1);

  if (safeBandType === "peaking") {
    return PEAKING_Q_MAX - t * (PEAKING_Q_MAX - PEAKING_Q_MIN);
  }

  return SHELF_Q_MIN + t * (SHELF_Q_MAX - SHELF_Q_MIN);
}

// Compact shape text rendered in each EQ point readout card.
export function toShapeLabel(point) {
  const percent = getPointShapePercent(point);
  return percent + "%";
}

// Frequency label utility for axis ticks and point readouts.
export function toFrequencyLabel(value) {
  const hz = Number(value || 0);
  if (hz >= 1000) {
    return (hz / 1000).toFixed(2).replace(/\.00$/, "") + "k";
  }
  return Math.round(hz) + "Hz";
}

// Generic value formatters shared by reverb controls.
export function formatPercent(value) {
  return Math.round(Number(value || 0) * 100) + "%";
}

export function formatMs(value) {
  return Math.round(Number(value || 0)) + " ms";
}

export function formatSeconds(value) {
  return (
    Number(value || 0)
      .toFixed(2)
      .replace(/\.00$/, "") + " s"
  );
}

// Snaps a value to control.step precision.
export function roundToStep(value, step) {
  const safeStep = Math.max(0.000001, Number(step || 0.01));
  return Math.round(Number(value || 0) / safeStep) * safeStep;
}

// Parses user-entered numeric text (accepting comma decimal separators).
export function parseNumericInput(raw) {
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

// Evaluates and renders the combined EQ response curve path in SVG space.
export function buildGraphicEqPath(params, width, height) {
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
        const shelfDelta = logCenter - logFrequency;
        influence = 1 / (1 + Math.exp(-shelfDelta * slope));
      } else if (point.bandType === "highshelf") {
        const slope = clamp(qFactor, 0.3, 6) * 3;
        const shelfDelta = logFrequency - logCenter;
        influence = 1 / (1 + Math.exp(-shelfDelta * slope));
      } else if (point.bandType === "lowpass") {
        const slope = clamp(qFactor, 0.3, 8) * 2.4;
        const filterDelta = logFrequency - logCenter;
        influence = -1 / (1 + Math.exp(-filterDelta * slope));
      } else if (point.bandType === "highpass") {
        const slope = clamp(qFactor, 0.3, 8) * 2.4;
        const filterDelta = logCenter - logFrequency;
        influence = -1 / (1 + Math.exp(-filterDelta * slope));
      }

      db += point.gainDb * influence;
    });

    return clamp(db, -GRAPH_MAX_DB, GRAPH_MAX_DB);
  };

  const points = Array.from({ length: 121 }, function (_, index) {
    const t = index / 120;
    const frequencyHz = GRAPH_MIN_FREQ * Math.pow(GRAPH_MAX_FREQ / GRAPH_MIN_FREQ, t);
    return {
      x: toX(frequencyHz),
      y: toY(evaluateDb(frequencyHz)),
    };
  });

  return points
    .map(function (point, index) {
      const prefix = index === 0 ? "M" : "L";
      return prefix + " " + point.x.toFixed(2) + " " + point.y.toFixed(2);
    })
    .join(" ");
}

// Builds fill/line paths from live FFT levels for the analyzer backdrop.
export function buildSpectrumPaths(spectrum, width, height) {
  const values = Array.isArray(spectrum)
    ? spectrum.filter(function (value) {
        return Number.isFinite(value);
      })
    : [];

  const leftPad = GRAPH_PADDING.left;
  const rightPad = GRAPH_PADDING.right;
  const topPad = GRAPH_PADDING.top;
  const bottomPad = GRAPH_PADDING.bottom;
  const innerW = Math.max(1, width - leftPad - rightPad);
  const innerH = Math.max(1, height - topPad - bottomPad);

  if (values.length <= 1) {
    return {
      linePath: "",
      fillPath: "",
    };
  }

  const points = values.map(function (rawValue, index) {
    const t = index / (values.length - 1);
    const x = leftPad + t * innerW;
    const clamped = clamp(Number(rawValue || 0), 0, 1);
    const y = topPad + (1 - clamped) * innerH;
    return { x, y };
  });

  const maxLevel = values.reduce(function (maxValue, current) {
    return Math.max(maxValue, Number(current || 0));
  }, 0);
  if (maxLevel < 0.006) {
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

  const baselineY = topPad + innerH;
  const fillPath =
    linePath +
    " L " +
    points[points.length - 1].x.toFixed(2) +
    " " +
    baselineY.toFixed(2) +
    " L " +
    points[0].x.toFixed(2) +
    " " +
    baselineY.toFixed(2) +
    " Z";

  return {
    linePath,
    fillPath,
  };
}

// Converts waveform PCM values into a continuous svg line.
export function buildWaveformPath(waveform, width, height) {
  const values = Array.isArray(waveform)
    ? waveform.filter(function (value) {
        return Number.isFinite(value);
      })
    : [];

  if (values.length <= 1) {
    return "";
  }

  const centerY = height / 2;
  const amplitude = Math.max(8, height / 2 - 8);

  return values
    .map(function (value, index) {
      const x = (index / (values.length - 1)) * width;
      const y = centerY - clamp(Number(value || 0), -1, 1) * amplitude;
      return (index === 0 ? "M " : "L ") + x.toFixed(2) + " " + y.toFixed(2);
    })
    .join(" ");
}

// Builds overlay lines that highlight waveform sections above threshold.
export function buildWaveformReductionPath(
  waveform,
  width,
  height,
  limitAmplitude,
) {
  const values = Array.isArray(waveform)
    ? waveform.filter(function (value) {
        return Number.isFinite(value);
      })
    : [];

  if (values.length <= 1) {
    return "";
  }

  const safeLimit = clamp(Number(limitAmplitude || 0), 0.0001, 1);
  const centerY = height / 2;
  const amplitude = Math.max(8, height / 2 - 8);
  const segments = [];
  let active = null;

  values.forEach(function (value, index) {
    const sample = clamp(Number(value || 0), -1, 1);
    if (Math.abs(sample) <= safeLimit) {
      if (active && active.length > 1) {
        segments.push(active);
      }
      active = null;
      return;
    }

    const clipped = Math.sign(sample) * safeLimit;
    const x = (index / (values.length - 1)) * width;
    const y = centerY - clipped * amplitude;

    if (!active) {
      active = [];
    }
    active.push({ x, y });
  });

  if (active && active.length > 1) {
    segments.push(active);
  }

  return segments
    .map(function (segment) {
      return segment
        .map(function (point, index) {
          return (
            (index === 0 ? "M " : "L ") +
            point.x.toFixed(2) +
            " " +
            point.y.toFixed(2)
          );
        })
        .join(" ");
    })
    .join(" ");
}

// Draws the limiter transfer curve from threshold/ceiling/character params.
export function buildMaximizerTransferPath(params, width, height) {
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
