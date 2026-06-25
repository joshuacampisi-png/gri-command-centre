// Lightweight stats used for trends and correlations. No external deps.

export function mean(arr) {
  const v = arr.filter((x) => typeof x === 'number' && !isNaN(x));
  if (!v.length) return null;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

export function stdev(arr) {
  const v = arr.filter((x) => typeof x === 'number' && !isNaN(x));
  if (v.length < 2) return null;
  const m = mean(v);
  const variance = v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1);
  return Math.sqrt(variance);
}

export function min(arr) {
  const v = arr.filter((x) => typeof x === 'number' && !isNaN(x));
  return v.length ? Math.min(...v) : null;
}

export function max(arr) {
  const v = arr.filter((x) => typeof x === 'number' && !isNaN(x));
  return v.length ? Math.max(...v) : null;
}

// Linear trend slope via least squares. Positive = rising over the window.
export function slope(values) {
  const pts = values
    .map((y, x) => [x, y])
    .filter(([, y]) => typeof y === 'number' && !isNaN(y));
  if (pts.length < 2) return 0;
  const n = pts.length;
  const sx = pts.reduce((a, [x]) => a + x, 0);
  const sy = pts.reduce((a, [, y]) => a + y, 0);
  const sxx = pts.reduce((a, [x]) => a + x * x, 0);
  const sxy = pts.reduce((a, [x, y]) => a + x * y, 0);
  const denom = n * sxx - sx * sx;
  if (denom === 0) return 0;
  return (n * sxy - sx * sy) / denom;
}

// Pearson correlation between two equal-length series (nulls ignored pairwise).
export function pearson(a, b) {
  const pairs = a
    .map((x, i) => [x, b[i]])
    .filter(([x, y]) => typeof x === 'number' && typeof y === 'number' && !isNaN(x) && !isNaN(y));
  if (pairs.length < 4) return null;
  const xs = pairs.map((p) => p[0]);
  const ys = pairs.map((p) => p[1]);
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < pairs.length; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  if (dx === 0 || dy === 0) return null;
  return num / Math.sqrt(dx * dy);
}

export function round(n, dp = 0) {
  if (n == null || isNaN(n)) return null;
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
