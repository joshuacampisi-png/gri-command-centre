// Local persistence for blood test results. On-device only (AsyncStorage).
// A "result" is one marker value on one date. Grouped into panels in the UI.
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'blood_results_v1';

// Minimal id generator (no crypto dep needed for local data).
function uid() {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export async function getAllResults() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeAll(results) {
  await AsyncStorage.setItem(KEY, JSON.stringify(results));
}

// result: { markerId, value, unit, date (YYYY-MM-DD), lab?, note? }
export async function addResult(result) {
  const all = await getAllResults();
  const entry = { id: uid(), createdAt: Date.now(), ...result };
  all.push(entry);
  await writeAll(all);
  return entry;
}

export async function updateResult(id, patch) {
  const all = await getAllResults();
  const next = all.map((r) => (r.id === id ? { ...r, ...patch } : r));
  await writeAll(next);
}

export async function deleteResult(id) {
  const all = await getAllResults();
  await writeAll(all.filter((r) => r.id !== id));
}

// All results for one marker, oldest -> newest.
export async function historyFor(markerId) {
  const all = await getAllResults();
  return all
    .filter((r) => r.markerId === markerId)
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Distinct test dates, newest first — each becomes a "panel" card.
export async function getPanels() {
  const all = await getAllResults();
  const byDate = {};
  for (const r of all) {
    if (!byDate[r.date]) byDate[r.date] = [];
    byDate[r.date].push(r);
  }
  return Object.keys(byDate)
    .sort((a, b) => b.localeCompare(a))
    .map((date) => ({ date, results: byDate[date] }));
}

// Bulk import (e.g. seeding several markers from one blood draw).
export async function addMany(results) {
  const all = await getAllResults();
  const stamped = results.map((r) => ({ id: uid(), createdAt: Date.now(), ...r }));
  await writeAll(all.concat(stamped));
  return stamped;
}
