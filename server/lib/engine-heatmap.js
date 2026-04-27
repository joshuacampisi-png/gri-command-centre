/**
 * engine-heatmap.js
 *
 * Hour × Day-of-Week heatmap — last 28 days hourly performance.
 * Identifies dead zones (negative ROAS hours), peak conversion windows,
 * and scheduling opportunities.
 */

import { getGadsCustomer } from './gads-client.js'

let _cache = { data: null, ts: 0 }
const CACHE_TTL_MS = 30 * 60 * 1000

const fmt = (d) => d.toISOString().slice(0, 10)
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return fmt(d) }

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export async function buildHeatmap({ skipCache = false, days = 28 } = {}) {
  const now = Date.now()
  if (!skipCache && _cache.data && (now - _cache.ts) < CACHE_TTL_MS) {
    return { ..._cache.data, fromCache: true }
  }

  const customer = getGadsCustomer()
  const start = daysAgo(days)
  const end = daysAgo(1)

  const rows = await customer.query(`
    SELECT segments.day_of_week, segments.hour,
           metrics.cost_micros, metrics.clicks, metrics.impressions,
           metrics.conversions, metrics.conversions_value
    FROM campaign
    WHERE segments.date BETWEEN '${start}' AND '${end}'
      AND campaign.status = 'ENABLED'
  `)

  // Build a 7×24 grid
  // segments.day_of_week comes back as enum number (1=Mon..7=Sun typically)
  // Map to JS Sunday=0
  const dowMap = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 0, MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4, FRIDAY: 5, SATURDAY: 6, SUNDAY: 0 }

  const grid = []
  for (let d = 0; d < 7; d++) {
    grid[d] = []
    for (let h = 0; h < 24; h++) {
      grid[d][h] = { spend: 0, clicks: 0, imp: 0, conv: 0, val: 0 }
    }
  }

  for (const r of rows) {
    const dowRaw = r.segments?.day_of_week
    const hour = r.segments?.hour
    if (hour == null) continue
    const dow = dowMap[dowRaw] ?? dowMap[String(dowRaw).toUpperCase()] ?? null
    if (dow == null) continue
    const cell = grid[dow][hour]
    cell.spend += Number(r.metrics?.cost_micros || 0) / 1e6
    cell.clicks += Number(r.metrics?.clicks || 0)
    cell.imp += Number(r.metrics?.impressions || 0)
    cell.conv += Number(r.metrics?.conversions || 0)
    cell.val += Number(r.metrics?.conversions_value || 0)
  }

  // Compute roas per cell + find max for colour scaling
  let maxSpend = 0, maxRoas = 0
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      const c = grid[d][h]
      c.roas = c.spend > 0 ? c.val / c.spend : 0
      maxSpend = Math.max(maxSpend, c.spend)
      maxRoas = Math.max(maxRoas, c.roas)
    }
  }

  // Find best/worst hours
  const cells = []
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      cells.push({ dow: d, dowName: DAYS[d], hour: h, ...grid[d][h] })
    }
  }
  const productive = cells.filter(c => c.spend >= 5)
  productive.sort((a, b) => b.roas - a.roas)
  const topHours = productive.slice(0, 5)
  const deadHours = productive.filter(c => c.roas < 1).slice(0, 5)

  const data = {
    generatedAt: new Date().toISOString(),
    fromCache: false,
    window: { start, end, days },
    days: DAYS,
    grid,
    maxSpend,
    maxRoas,
    topHours,
    deadHours,
  }
  _cache = { data, ts: now }
  return data
}
