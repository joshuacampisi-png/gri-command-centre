// Pure helpers turning raw Oura collections into chart/display shapes.
import { mean } from './stats';
import { shortLabel } from './dates';

export function latest(arr) {
  if (!arr || !arr.length) return null;
  return [...arr].sort((a, b) => (a.day < b.day ? 1 : -1))[0];
}

export function byDayAsc(arr) {
  return [...(arr || [])].sort((a, b) => (a.day < b.day ? -1 : 1));
}

export function series(arr, accessor) {
  return byDayAsc(arr).map((d) => ({ label: shortLabel(d.day), day: d.day, value: accessor(d) }));
}

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
  return mainSleepForDay(sleepDetail, byDay[byDay.length - 1].day);
}

export function avgHrv(sleepDetail) {
  return mean((sleepDetail || []).map((s) => s.average_hrv).filter(Boolean));
}

export function avgRestingHr(sleepDetail) {
  return mean((sleepDetail || []).map((s) => s.lowest_heart_rate).filter(Boolean));
}

export function stressHours(seconds) {
  return seconds == null ? null : seconds / 3600;
}

const RESILIENCE_RANK = { limited: 1, adequate: 2, solid: 3, strong: 4, exceptional: 5 };
export function resilienceScore(level) {
  return RESILIENCE_RANK[level] ? RESILIENCE_RANK[level] * 20 : null;
}
