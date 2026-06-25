// Lightweight stats for trends. No dependencies.
export function mean(arr) {
  const v = (arr || []).filter((x) => typeof x === 'number' && !isNaN(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export function slope(values) {
  const pts = (values || [])
    .map((y, x) => [x, y])
    .filter(([, y]) => typeof y === 'number' && !isNaN(y));
  if (pts.length < 2) return 0;
  const n = pts.length;
  const sx = pts.reduce((a, [x]) => a + x, 0);
  const sy = pts.reduce((a, [, y]) => a + y, 0);
  const sxx = pts.reduce((a, [x]) => a + x * x, 0);
  const sxy = pts.reduce((a, [x, y]) => a + x * y, 0);
  const denom = n * sxx - sx * sx;
  return denom === 0 ? 0 : (n * sxy - sx * sy) / denom;
}

export function round(n, dp = 0) {
  if (n == null || isNaN(n)) return null;
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

export function minMax(arr) {
  const v = (arr || []).filter((x) => typeof x === 'number' && !isNaN(x));
  return v.length ? [Math.min(...v), Math.max(...v)] : [null, null];
}
