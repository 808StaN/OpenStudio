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
