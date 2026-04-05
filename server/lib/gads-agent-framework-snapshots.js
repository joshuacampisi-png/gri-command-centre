/**
 * gads-agent-framework-snapshots.js
 *
 * Persists daily snapshots of the framework metrics computed by
 * gads-agent-framework-metrics.js so the rules engine can reason about
 * multi-day trends.
 *
 * The framework PAUSE gate ("FOV/CAC < 1.0 for 3+ days") and sponge alert
 * ("new customers down >20% WoW while spend flat/up") both need history —
 * point-in-time metrics alone can't prove persistence or compare to a
 * prior week.
 *
 * One row per UTC calendar day. Scans run multiple times per day so the
 * row is upserted — the latest scan within a day overwrites the row for
 * that day. This keeps the history small and each daily value
 * representative of the most recent computation.
 *
 * Retention: last 180 days. Enough for framework baseline work and well
 * beyond the 3-day persistence window the PAUSE gate needs.
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'fs'
import { dataFile, dataDir } from './data-dir.js'

dataDir('gads-agent')
const FILE = dataFile('gads-agent/framework-snapshots.json')
const MAX_ROWS = 180

function load() {
  if (!existsSync(FILE)) return []
  try {
    const raw = readFileSync(FILE, 'utf8')
    if (!raw || !raw.trim()) return []
    return JSON.parse(raw)
  } catch {
    const bak = FILE + '.bak'
    if (existsSync(bak)) {
      try { return JSON.parse(readFileSync(bak, 'utf8')) } catch { /* ok */ }
    }
    console.error('[GadsFrameworkSnapshots] store unrecoverable, starting fresh')
    return []
  }
}

function save(rows) {
  try {
    if (existsSync(FILE)) {
      try { copyFileSync(FILE, FILE + '.bak') } catch { /* ok on first write */ }
    }
    writeFileSync(FILE, JSON.stringify(rows, null, 2))
  } catch (err) {
    console.error('[GadsFrameworkSnapshots] save failed:', err.message)
  }
}

function todayKey() {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Upsert today's framework snapshot. Safe to call on every scan — if today
 * already has a row it gets overwritten with the latest values. Returns the
 * row that was written, or null if the supplied metrics object was empty
 * or carried an error flag.
 */
export function recordFrameworkSnapshot(metrics) {
  if (!metrics || metrics.error) return null
  const date = todayKey()
  const row = {
    date,
    computedAt: metrics.computedAt || new Date().toISOString(),
    windowDays: metrics.window?.days ?? null,

    // Layer 1
    cm: metrics.layer1?.cm?.value ?? null,
    cmStatus: metrics.layer1?.cm?.status ?? null,
    costOfDelivery: metrics.layer1?.costOfDelivery?.total ?? null,

    // Layer 3 — nCAC
    ncac: metrics.layer3?.ncac?.value ?? null,
    ncacStatus: metrics.layer3?.ncac?.status ?? null,
    ncacHistoricalAvg: metrics.layer3?.ncac?.historicalAvg ?? null,

    // Layer 3 — FOV/CAC
    fovCac: metrics.layer3?.fovCac?.value ?? null,
    fovCacStatus: metrics.layer3?.fovCac?.status ?? null,

    // Layer 3 — aMER
    aMer: metrics.layer3?.aMer?.value ?? null,
    aMerStatus: metrics.layer3?.aMer?.status ?? null,

    // Layer 3 — new customer trend
    newCustomerCount: metrics.layer3?.newCustomerCount?.total ?? null,
    newCustomerThisWeek: metrics.layer3?.newCustomerCount?.thisWeek ?? null,
    newCustomerLastWeek: metrics.layer3?.newCustomerCount?.lastWeek ?? null,
    newCustomerWowChangePct: metrics.layer3?.newCustomerCount?.wowChangePct ?? null,

    // Spend breakdown — needed for sponge alert's WoW spend comparison
    googleSpend: metrics.spend?.google ?? null,
    metaSpend: metrics.spend?.meta ?? null,
    blendedSpend: metrics.spend?.blended ?? null,
  }

  const rows = load()
  const idx = rows.findIndex(r => r.date === date)
  if (idx >= 0) rows[idx] = row
  else rows.push(row)

  rows.sort((a, b) => a.date.localeCompare(b.date))
  if (rows.length > MAX_ROWS) rows.splice(0, rows.length - MAX_ROWS)
  save(rows)
  return row
}

/**
 * Return the most recent snapshots sorted chronologically (oldest first,
 * newest last). Pass `days` to trim to the last N rows; omit to get all
 * retained history.
 */
export function getFrameworkSnapshots(days = null) {
  const rows = load()
  if (!days || days >= rows.length) return rows
  return rows.slice(-days)
}
