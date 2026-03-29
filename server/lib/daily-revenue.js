import fs from 'fs'
import { dataFile } from './data-dir.js'
import { getShopifyOrdersRange } from '../connectors/shopify.js'

const BASELINE_FILE = dataFile('ytd-baseline.json')

/**
 * Load YTD baseline — revenue from orders outside the Shopify 60-day API window.
 * This gets combined with live API data to produce the full YTD figure.
 */
export function loadBaseline(year) {
  try {
    const baselines = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'))
    return baselines[String(year)] || { revenue: 0, orders: 0, shipping: 0, through: null }
  } catch {
    return { revenue: 0, orders: 0, shipping: 0, through: null }
  }
}

/**
 * Save YTD baseline for a year.
 * `through` = last date covered by baseline (e.g. "2026-01-28")
 */
export function saveBaseline(year, data) {
  let baselines = {}
  try { baselines = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8')) } catch {}
  baselines[String(year)] = data
  fs.writeFileSync(BASELINE_FILE, JSON.stringify(baselines, null, 2))
}

/**
 * Roll baseline forward: fetch the day that's about to fall off the 60-day API window
 * and add its revenue to the baseline. Run daily via cron.
 */
export async function rollBaselineForward() {
  const now = new Date()
  const aestNow = new Date(now.getTime() + (10 * 60 * 60 * 1000))
  const year = aestNow.toISOString().slice(0, 4)
  const baseline = loadBaseline(year)

  // The day that's about to fall off: 60 days ago
  const cutoffDate = new Date(aestNow.getTime() - (60 * 24 * 60 * 60 * 1000))
  const cutoffStr = cutoffDate.toISOString().slice(0, 10)

  // Only roll forward if this day is after what baseline already covers
  if (baseline.through && cutoffStr <= baseline.through) {
    return { rolled: false, reason: `baseline already covers through ${baseline.through}` }
  }

  // Fetch just the day that's falling off
  const nextDay = baseline.through
    ? nextDateStr(baseline.through)
    : `${year}-01-01`

  // Fetch from nextDay through cutoffStr
  if (nextDay > cutoffStr) {
    return { rolled: false, reason: 'no gap to fill' }
  }

  try {
    const data = await getShopifyOrdersRange(nextDay, cutoffStr)
    if (data.ok !== false) {
      baseline.revenue = Math.round(((baseline.revenue || 0) + (data.revenue || 0)) * 100) / 100
      baseline.orders = (baseline.orders || 0) + (data.orders || 0)
      baseline.shipping = Math.round(((baseline.shipping || 0) + (data.shipping || 0)) * 100) / 100
      baseline.through = cutoffStr
      saveBaseline(year, baseline)
      console.log(`[Revenue] Rolled baseline forward to ${cutoffStr}: +$${data.revenue?.toFixed(2)} (${data.orders} orders). Total: $${baseline.revenue}`)
      return { rolled: true, through: cutoffStr, added: data.revenue, totalBaseline: baseline.revenue }
    }
  } catch (e) {
    console.error(`[Revenue] Baseline roll failed:`, e.message)
  }
  return { rolled: false, reason: 'API error' }
}

function nextDateStr(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z')
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}
