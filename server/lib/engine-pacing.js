/**
 * engine-pacing.js
 *
 * Pacing tracker — month-to-date spend, projected month-end, vs target.
 * Per-campaign and account-level.
 *
 * Targets are derived from set daily budgets × days in month.
 * Status: under-pacing / on-pace / over-pacing.
 */

import { getGadsCustomer } from './gads-client.js'

let _cache = { data: null, ts: 0 }
const CACHE_TTL_MS = 10 * 60 * 1000

const fmt = (d) => d.toISOString().slice(0, 10)

export async function buildPacing({ skipCache = false } = {}) {
  const now = Date.now()
  if (!skipCache && _cache.data && (now - _cache.ts) < CACHE_TTL_MS) {
    return { ..._cache.data, fromCache: true }
  }

  const customer = getGadsCustomer()

  const today = new Date()
  const year = today.getFullYear()
  const month = today.getMonth()
  const monthStart = new Date(year, month, 1)
  const monthEnd = new Date(year, month + 1, 0)
  const dayOfMonth = today.getDate()
  const daysInMonth = monthEnd.getDate()
  const monthProgress = dayOfMonth / daysInMonth

  // Pull MTD data per-campaign
  const rows = await customer.query(`
    SELECT campaign.id, campaign.name, campaign.status,
           campaign_budget.amount_micros,
           metrics.cost_micros, metrics.conversions, metrics.conversions_value
    FROM campaign
    WHERE segments.date BETWEEN '${fmt(monthStart)}' AND '${fmt(today)}'
      AND campaign.status IN ('ENABLED', 'PAUSED')
  `)

  const byCamp = new Map()
  for (const r of rows) {
    const id = r.campaign?.id
    if (!id) continue
    const cur = byCamp.get(id) || {
      id, name: r.campaign?.name, status: r.campaign?.status,
      dailyBudget: Number(r.campaign_budget?.amount_micros || 0) / 1e6,
      spendMtd: 0, convMtd: 0, valMtd: 0,
    }
    cur.spendMtd += Number(r.metrics?.cost_micros || 0) / 1e6
    cur.convMtd += Number(r.metrics?.conversions || 0)
    cur.valMtd += Number(r.metrics?.conversions_value || 0)
    byCamp.set(id, cur)
  }

  const campaigns = [...byCamp.values()].map((c) => {
    const targetMonthBudget = c.dailyBudget * daysInMonth
    const expectedMtd = c.dailyBudget * dayOfMonth
    const projectedMonthEnd = monthProgress > 0 ? c.spendMtd / monthProgress : 0
    const pacingPct = expectedMtd > 0 ? (c.spendMtd / expectedMtd) * 100 : 0
    const pacingStatus =
      pacingPct >= 110 ? 'over' :
      pacingPct >= 90 ? 'on-pace' :
      pacingPct >= 50 ? 'under' :
      'critical-under'
    const roas = c.spendMtd > 0 ? c.valMtd / c.spendMtd : 0
    return {
      ...c,
      targetMonthBudget,
      expectedMtd,
      projectedMonthEnd,
      pacingPct: Math.round(pacingPct),
      pacingStatus,
      roas,
    }
  }).sort((a, b) => b.spendMtd - a.spendMtd)

  // Account totals
  const enabled = campaigns.filter(c => c.status === 2)
  const accountSpendMtd = campaigns.reduce((s, c) => s + c.spendMtd, 0)
  const accountValMtd = campaigns.reduce((s, c) => s + c.valMtd, 0)
  const accountConvMtd = campaigns.reduce((s, c) => s + c.convMtd, 0)
  const accountTargetMonth = enabled.reduce((s, c) => s + c.targetMonthBudget, 0)
  const accountExpectedMtd = enabled.reduce((s, c) => s + c.expectedMtd, 0)
  const accountProjectedMonthEnd = monthProgress > 0 ? accountSpendMtd / monthProgress : 0

  const data = {
    generatedAt: new Date().toISOString(),
    fromCache: false,
    month: today.toLocaleDateString('en-AU', { month: 'long', year: 'numeric', timeZone: 'Australia/Brisbane' }),
    dayOfMonth,
    daysInMonth,
    monthProgress: Math.round(monthProgress * 100),
    account: {
      spendMtd: accountSpendMtd,
      valMtd: accountValMtd,
      convMtd: accountConvMtd,
      roas: accountSpendMtd > 0 ? accountValMtd / accountSpendMtd : 0,
      targetMonthBudget: accountTargetMonth,
      expectedMtd: accountExpectedMtd,
      projectedMonthEnd: accountProjectedMonthEnd,
      pacingPct: accountExpectedMtd > 0 ? Math.round((accountSpendMtd / accountExpectedMtd) * 100) : 0,
    },
    campaigns,
  }
  _cache = { data, ts: now }
  return data
}
