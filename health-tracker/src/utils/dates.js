// Date helpers. Oura date-based endpoints use YYYY-MM-DD in the user's local day.
// We keep everything in the device local timezone for display.

export function isoDate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function daysAgo(n, from = new Date()) {
  const d = new Date(from);
  d.setDate(d.getDate() - n);
  return d;
}

// Inclusive range of YYYY-MM-DD strings for the last `n` days ending today.
export function lastNDays(n) {
  return { start: isoDate(daysAgo(n - 1)), end: isoDate() };
}

export function isoDateTime(d) {
  return d.toISOString();
}

// "Mon 14" style short label for charts.
export function shortLabel(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'short' });
}

export function prettyDate(iso) {
  if (!iso) return '';
  const d = new Date(iso.length <= 10 ? iso + 'T00:00:00' : iso);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

// Seconds -> "7h 32m"
export function fmtDuration(seconds) {
  if (seconds == null) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
