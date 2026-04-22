// Converts `#rrggbb` to RGB channels; returns theme-safe default on bad input.
export function hexToRgb(hexColor) {
  const safe = String(hexColor || "")
    .trim()
    .replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(safe)) {
    return { r: 75, g: 239, b: 159 };
  }

  return {
    r: Number.parseInt(safe.slice(0, 2), 16),
    g: Number.parseInt(safe.slice(2, 4), 16),
    b: Number.parseInt(safe.slice(4, 6), 16),
  };
}

// Convenience helper for alpha color variants used by clip preview styles.
export function withAlpha(hexColor, alpha) {
  const rgb = hexToRgb(hexColor);
  return "rgba(" + rgb.r + ", " + rgb.g + ", " + rgb.b + ", " + alpha + ")";
}
