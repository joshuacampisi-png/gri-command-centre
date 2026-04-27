/**
 * engine-search-terms.js
 *
 * Search Terms Miner — pulls last 30 days of search terms from Google Ads,
 * categorises them green / yellow / red:
 *
 *   🟢 GREEN — high impressions + high CTR + converting → keep, optimise titles around
 *   🟡 YELLOW — high impressions + low CTR → title gap (rank issue)
 *   🔴 RED — high impressions + zero conversions over 30d → negative keyword candidate
 *
 * Output is the source of truth for what to inject into Shopping titles
 * and what to add as negatives.
 */

import { getGadsCustomer } from './gads-client.js'

let _cache = { data: null, ts: 0 }
const CACHE_TTL_MS = 10 * 60 * 1000

const fmt = (d) => d.toISOString().slice(0, 10)
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return fmt(d) }

export async function buildSearchTermsMine({ skipCache = false, days = 30 } = {}) {
  const now = Date.now()
  if (!skipCache && _cache.data && (now - _cache.ts) < CACHE_TTL_MS) {
    return { ..._cache.data, fromCache: true }
  }

  const customer = getGadsCustomer()
  const start = daysAgo(days)
  const end = daysAgo(1)

  const rows = await customer.query(`
    SELECT
      search_term_view.search_term,
      campaign.name,
      campaign.id,
      metrics.impressions, metrics.clicks, metrics.conversions,
      metrics.conversions_value, metrics.cost_micros, metrics.ctr
    FROM search_term_view
    WHERE segments.date BETWEEN '${start}' AND '${end}'
    ORDER BY metrics.impressions DESC
    LIMIT 500
  `)

  // Aggregate by search term (multiple rows per term across campaigns)
  const byTerm = new Map()
  for (const r of rows) {
    const term = (r.search_term_view?.search_term || '').toLowerCase().trim()
    if (!term) continue
    const cur = byTerm.get(term) || { term, imp: 0, clk: 0, conv: 0, val: 0, spend: 0, campaigns: new Set() }
    cur.imp += Number(r.metrics?.impressions || 0)
    cur.clk += Number(r.metrics?.clicks || 0)
    cur.conv += Number(r.metrics?.conversions || 0)
    cur.val += Number(r.metrics?.conversions_value || 0)
    cur.spend += Number(r.metrics?.cost_micros || 0) / 1e6
    if (r.campaign?.name) cur.campaigns.add(r.campaign.name)
    byTerm.set(term, cur)
  }

  const all = [...byTerm.values()].map(t => ({
    ...t,
    campaigns: [...t.campaigns],
    ctr: t.imp > 0 ? t.clk / t.imp : 0,
    cvr: t.clk > 0 ? t.conv / t.clk : 0,
    cpa: t.conv > 0 ? t.spend / t.conv : 0,
    roas: t.spend > 0 ? t.val / t.spend : 0,
  }))

  // Tagging logic
  const HIGH_IMP = 30 // ≥30 impressions over the window = "real" term
  const HIGH_CTR = 0.05 // 5% CTR = healthy
  const LOW_CTR = 0.025 // 2.5% = title gap

  const greens = []  // converting + healthy CTR
  const yellows = [] // high impressions, low CTR (title injection candidates)
  const reds = []    // high impressions, zero conversions (negative candidates)

  for (const t of all) {
    if (t.imp < HIGH_IMP) continue

    if (t.conv >= 1 && t.ctr >= HIGH_CTR) {
      greens.push({ ...t, tag: 'green', reason: `${t.conv.toFixed(1)} conv · ${(t.ctr*100).toFixed(1)}% CTR · ${t.roas.toFixed(2)}x ROAS` })
    } else if (t.conv === 0 && t.spend >= 5) {
      reds.push({ ...t, tag: 'red', reason: `${t.imp} imp, $${t.spend.toFixed(0)} spend, 0 conversions — negative candidate` })
    } else if (t.ctr < LOW_CTR && t.imp >= HIGH_IMP * 2) {
      yellows.push({ ...t, tag: 'yellow', reason: `${t.imp} imp but only ${(t.ctr*100).toFixed(1)}% CTR — title relevance gap` })
    } else if (t.conv >= 1) {
      greens.push({ ...t, tag: 'green', reason: `${t.conv.toFixed(1)} conv · ${t.roas.toFixed(2)}x ROAS` })
    }
  }

  greens.sort((a, b) => b.val - a.val)
  yellows.sort((a, b) => b.imp - a.imp)
  reds.sort((a, b) => b.spend - a.spend)

  const data = {
    generatedAt: new Date().toISOString(),
    fromCache: false,
    window: { start, end, days },
    totals: {
      uniqueTerms: all.length,
      totalImpressions: all.reduce((s, t) => s + t.imp, 0),
      totalSpend: all.reduce((s, t) => s + t.spend, 0),
      totalValue: all.reduce((s, t) => s + t.val, 0),
    },
    counts: { green: greens.length, yellow: yellows.length, red: reds.length },
    greens: greens.slice(0, 30),
    yellows: yellows.slice(0, 30),
    reds: reds.slice(0, 30),
  }
  _cache = { data, ts: now }
  return data
}
