import { getSafeMaximizerParams } from "../../audio/domain/fxParams";
import { clamp } from "./fxNumericUtils";

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
