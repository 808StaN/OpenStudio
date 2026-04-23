import { getSafeGraphicEqParams, sanitizeEqBandType } from "../../audio/domain/fxParams";
import {
  GRAPH_MAX_DB,
  GRAPH_MAX_FREQ,
  GRAPH_MIN_FREQ,
  GRAPH_PADDING,
  PEAKING_Q_MAX,
  PEAKING_Q_MIN,
  SHELF_Q_MAX,
  SHELF_Q_MIN,
} from "./graphicEqConstants";
import { clamp } from "./fxNumericUtils";

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
