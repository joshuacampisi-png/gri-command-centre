/**
 * engine-anomaly.js
 *
 * Anomaly detector — compares yesterday's per-campaign metrics against
 * the 4-week same-day-of-week baseline. Flags when:
 *   - Spend >2σ above baseline (overspend risk)
 *   - Spend <50% of baseline (campaign died)
 *   - ROAS drops >40% from baseline
 *   - Conversions = 0 when baseline > 1
 *   - CTR drops >50%
 *   - Impressions drop >50%
 *
 * Modeled on Google's Account Anomaly Detector script approach but adapted
 * for the GRI account profile (low daily volume, weekend variance).
 */

import { getGadsCustomer } from './gads-client.js'

let _cache = { data: null, ts: 0 }
const CACHE_TTL_MS = 15 * 60 * 1000

const fmt = (d) => d.toISOString().slice(0, 10)
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return fmt(d) }

function dayOfWeek(date) {
  return new Date(date).getDay() // 0=Sun..6=Sat
}

// Standard deviation
function stdDev(values) {
  const n = values.length
  if (n < 2) return 0
  const mean = values.reduce((s, v) => s + v, 0) / n
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1)
  return Math.sqrt(variance)
}

export async function detectAnomalies({ skipCache = false } = {}) {
  const now = Date.now()
  if (!skipCache && _cache.data && (now - _cache.ts) < CACHE_TTL_MS) {
    return { ..._cache.data, fromCache: true }
  }

  const customer = getGadsCustomer()
  const yesterday = daysAgo(1)
  const yesterdayDow = dayOfWeek(yesterday)

  // Pull last 35 days (5 weeks) of per-campaign per-day data
  const start35 = daysAgo(35)
  const rows = await customer.query(`
    SELECT segments.date, campaign.id, campaign.name, campaign.status,
           metrics.cost_micros, metrics.clicks, metrics.impressions,
           metrics.conversions, metrics.conversions_value, metrics.ctr
    FROM campaign
    WHERE segments.date BETWEEN '${start35}' AND '${yesterday}'
      AND campaign.status IN ('ENABLED', 'PAUSED')
  `)

  // Group by campaign, then by date
  const byCamp = new Map()
  for (const r of rows) {
    const id = r.campaign?.id
    const date = r.segments?.date
    if (!id || !date) continue
    const camp = byCamp.get(id) || { id, name: r.campaign?.name, status: r.campaign?.status, days: new Map() }
    const cur = camp.days.get(date) || { spend: 0, clicks: 0, imp: 0, conv: 0, val: 0 }
    cur.spend += Number(r.metrics?.cost_micros || 0) / 1e6
    cur.clicks += Number(r.metrics?.clicks || 0)
    cur.imp += Number(r.metrics?.impressions || 0)
    cur.conv += Number(r.metrics?.conversions || 0)
    cur.val += Number(r.metrics?.conversions_value || 0)
    camp.days.set(date, cur)
    byCamp.set(id, camp)
  }

  const anomalies = []
  for (const [id, camp] of byCamp) {
    const ydData = camp.days.get(yesterday)
    if (!ydData) continue
    if (ydData.spend < 1) continue // skip dead campaigns

    // Baseline: same day of week, prior 4 weeks (excluding yesterday)
    const baselineDates = []
    for (let w = 1; w <= 4; w++) {
      const d = new Date(yesterday)
      d.setDate(d.getDate() - w * 7)
      baselineDates.push(fmt(d))
    }
    const baselineDays = baselineDates.map((d) => camp.days.get(d)).filter(Boolean)
    if (baselineDays.length < 2) continue

    const baseSpend = baselineDays.reduce((s, d) => s + d.spend, 0) / baselineDays.length
    const baseConv = baselineDays.reduce((s, d) => s + d.conv, 0) / baselineDays.length
    const baseVal = baselineDays.reduce((s, d) => s + d.val, 0) / baselineDays.length
    const baseImp = baselineDays.reduce((s, d) => s + d.imp, 0) / baselineDays.length
    const baseClicks = baselineDays.reduce((s, d) => s + d.clicks, 0) / baselineDays.length
    const baseCtr = baseImp > 0 ? baseClicks / baseImp : 0
    const baseRoas = baseSpend > 0 ? baseVal / baseSpend : 0

    const ydCtr = ydData.imp > 0 ? ydData.clicks / ydData.imp : 0
    const ydRoas = ydData.spend > 0 ? ydData.val / ydData.spend : 0

    const spendStdDev = stdDev(baselineDays.map(d => d.spend))
    const spendZ = spendStdDev > 0 ? (ydData.spend - baseSpend) / spendStdDev : 0

    // Anomaly detection rules
    const flags = []

    // Spend anomaly (>2σ above baseline)
    if (spendZ > 2 && ydData.spend > baseSpend * 1.5) {
      flags.push({
        type: 'spend_spike',
        severity: 'high',
        message: `Spend ${(ydData.spend / baseSpend * 100).toFixed(0)}% of baseline (z=${spendZ.toFixed(1)}σ)`,
        actual: ydData.spend, baseline: baseSpend,
      })
    }

    // Spend collapse (<50% of baseline)
    if (baseSpend > 5 && ydData.spend < baseSpend * 0.5) {
      flags.push({
        type: 'spend_collapse',
        severity: 'medium',
        message: `Spend dropped to ${(ydData.spend / baseSpend * 100).toFixed(0)}% of baseline`,
        actual: ydData.spend, baseline: baseSpend,
      })
    }

    // ROAS drop (>40% below baseline)
    if (baseRoas > 1 && ydRoas < baseRoas * 0.6) {
      flags.push({
        type: 'roas_drop',
        severity: ydRoas < baseRoas * 0.3 ? 'critical' : 'high',
        message: `ROAS ${ydRoas.toFixed(2)}x vs ${baseRoas.toFixed(2)}x baseline (-${((1 - ydRoas/baseRoas) * 100).toFixed(0)}%)`,
        actual: ydRoas, baseline: baseRoas,
      })
    }

    // Conversions = 0 when baseline expected
    if (baseConv >= 1 && ydData.conv === 0 && ydData.spend > 5) {
      flags.push({
        type: 'zero_conversions',
        severity: baseConv >= 3 ? 'critical' : 'high',
        message: `0 conv yesterday vs ${baseConv.toFixed(1)} baseline (spend $${ydData.spend.toFixed(0)})`,
        actual: 0, baseline: baseConv,
      })
    }

    // CTR drop >50%
    if (baseCtr > 0.02 && ydCtr < baseCtr * 0.5) {
      flags.push({
        type: 'ctr_drop',
        severity: 'medium',
        message: `CTR ${(ydCtr*100).toFixed(2)}% vs ${(baseCtr*100).toFixed(2)}% baseline`,
        actual: ydCtr, baseline: baseCtr,
      })
    }

    // Impression collapse
    if (baseImp > 100 && ydData.imp < baseImp * 0.5) {
      flags.push({
        type: 'impressions_drop',
        severity: 'medium',
        message: `Impressions ${ydData.imp} vs ${Math.round(baseImp)} baseline (-${((1 - ydData.imp/baseImp) * 100).toFixed(0)}%)`,
        actual: ydData.imp, baseline: baseImp,
      })
    }

    if (flags.length > 0) {
      anomalies.push({
        campaignId: id,
        campaignName: camp.name,
        flags,
        yesterday: { date: yesterday, ...ydData, ctr: ydCtr, roas: ydRoas },
        baseline: { spend: baseSpend, conv: baseConv, val: baseVal, imp: baseImp, ctr: baseCtr, roas: baseRoas, days: baselineDays.length },
      })
    }
  }

  // Sort by severity then flag count
  const sevOrder = { critical: 4, high: 3, medium: 2, low: 1 }
  anomalies.sort((a, b) => {
    const aMax = Math.max(...a.flags.map(f => sevOrder[f.severity] || 0))
    const bMax = Math.max(...b.flags.map(f => sevOrder[f.severity] || 0))
    return bMax - aMax || b.flags.length - a.flags.length
  })

  const data = {
    generatedAt: new Date().toISOString(),
    fromCache: false,
    yesterday,
    dayOfWeek: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][yesterdayDow],
    counts: {
      total: anomalies.reduce((s, a) => s + a.flags.length, 0),
      critical: anomalies.reduce((s, a) => s + a.flags.filter(f => f.severity === 'critical').length, 0),
      high: anomalies.reduce((s, a) => s + a.flags.filter(f => f.severity === 'high').length, 0),
      medium: anomalies.reduce((s, a) => s + a.flags.filter(f => f.severity === 'medium').length, 0),
    },
    campaigns: anomalies,
  }
  _cache = { data, ts: now }
  return data
}
