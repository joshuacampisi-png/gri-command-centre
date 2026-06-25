// Pure helpers that turn raw Oura collections into the shapes screens render.
import { mean } from './stats';
import { shortLabel } from './dates';

export function latest(arr) {
  if (!arr || !arr.length) return null;
  return [...arr].sort((a, b) => (a.day < b.day ? 1 : -1))[0];
}

export function byDayAsc(arr) {
  return [...(arr || [])].sort((a, b) => (a.day < b.day ? -1 : 1));
}

// Build chart points from a collection, reading a value via accessor.
export function series(arr, accessor) {
  return byDayAsc(arr).map((d) => ({
    label: shortLabel(d.day),
    day: d.day,
    value: accessor(d),
  }));
}

// Picks the main night's detailed-sleep doc for a given day (longest, prefer long_sleep).
export function mainSleepForDay(sleepDetail, day) {
  const docs = (sleepDetail || []).filter((s) => s.day === day);
  if (!docs.length) return null;
  const longs = docs.filter((s) => s.type === 'long_sleep');
  const pool = longs.length ? longs : docs;
  return pool.sort((a, b) => (b.total_sleep_duration || 0) - (a.total_sleep_duration || 0))[0];
}

export function latestSleep(sleepDetail) {
  const byDay = byDayAsc(sleepDetail);
  if (!byDay.length) return null;
  const lastDay = byDay[byDay.length - 1].day;
  return mainSleepForDay(sleepDetail, lastDay);
}

// Average HRV / resting HR across the window from detailed sleep docs.
export function avgHrv(sleepDetail) {
  return mean((sleepDetail || []).map((s) => s.average_hrv).filter(Boolean));
}

export function avgRestingHr(sleepDetail) {
  return mean((sleepDetail || []).map((s) => s.lowest_heart_rate).filter(Boolean));
}

const RESILIENCE_RANK = {
  limited: 1,
  adequate: 2,
  solid: 3,
  strong: 4,
  exceptional: 5,
};

export function resilienceScore(level) {
  return RESILIENCE_RANK[level] ? RESILIENCE_RANK[level] * 20 : null;
}

// Seconds of high stress -> readable hours.
export function stressHours(seconds) {
  if (seconds == null) return null;
  return seconds / 3600;
}
