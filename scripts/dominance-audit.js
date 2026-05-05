/**
 * dominance-audit.js
 * Brutal honest audit: are we dominating gender reveal search?
 * Paid side: Google Ads. Organic side: Search Console (if configured).
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'

const customer = getGadsCustomer()

const fmt = (d) => d.toISOString().slice(0, 10)
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return fmt(d) }
const start = daysAgo(30)
const end = daysAgo(1)

console.log(`\n========== PAID DOMINANCE AUDIT (${start} → ${end}) ==========\n`)

// 1. Top gender reveal search terms — what we win and lose
const stRows = await customer.query(`
  SELECT search_term_view.search_term, campaign.name,
    metrics.impressions, metrics.clicks, metrics.conversions,
    metrics.conversions_value, metrics.cost_micros, metrics.average_cpc
  FROM search_term_view
  WHERE segments.date BETWEEN '${start}' AND '${end}'
    AND metrics.impressions > 5
  ORDER BY metrics.impressions DESC
  LIMIT 60
`)

const byTerm = new Map()
for (const r of stRows) {
  const term = (r.search_term_view?.search_term || '').toLowerCase()
  if (!term.includes('gender') && !term.includes('reveal') && !term.includes('cannon') && !term.includes('blaster') && !term.includes('powder') && !term.includes('smoke') && !term.includes('confetti')) continue
  const cur = byTerm.get(term) || { imp: 0, clk: 0, conv: 0, val: 0, spend: 0 }
  cur.imp += Number(r.metrics?.impressions || 0)
  cur.clk += Number(r.metrics?.clicks || 0)
  cur.conv += Number(r.metrics?.conversions || 0)
  cur.val += Number(r.metrics?.conversions_value || 0)
  cur.spend += Number(r.metrics?.cost_micros || 0) / 1e6
  byTerm.set(term, cur)
}

console.log('--- TOP 20 GENDER-REVEAL TERMS WE WIN ON (by impressions) ---')
const sorted = [...byTerm.entries()].sort((a, b) => b[1].imp - a[1].imp).slice(0, 20)
for (const [term, m] of sorted) {
  const ctr = m.imp > 0 ? (m.clk / m.imp * 100).toFixed(1) : '0'
  const roas = m.spend > 0 ? (m.val / m.spend).toFixed(2) : '-'
  console.log(`  "${term}" — ${m.imp} imp, ${m.clk} clk (${ctr}% CTR), ${m.conv.toFixed(0)} conv, ${roas}x ROAS`)
}

// 2. Account-level Impression Share — the real dominance metric
console.log('\n--- IMPRESSION SHARE PER CAMPAIGN (30d) ---')
const isRows = await customer.query(`
  SELECT campaign.name, campaign.advertising_channel_type,
    metrics.impressions, metrics.clicks,
    metrics.search_impression_share,
    metrics.search_top_impression_share,
    metrics.search_absolute_top_impression_share,
    metrics.search_budget_lost_impression_share,
    metrics.search_rank_lost_impression_share
  FROM campaign
  WHERE segments.date BETWEEN '${start}' AND '${end}'
    AND campaign.status = 'ENABLED'
`)
const byCamp = new Map()
for (const r of isRows) {
  const name = r.campaign?.name
  if (!name) continue
  const cur = byCamp.get(name) || { imp: 0, clk: 0, isSum: 0, topSum: 0, absSum: 0, budgetSum: 0, rankSum: 0, n: 0 }
  cur.imp += Number(r.metrics?.impressions || 0)
  cur.clk += Number(r.metrics?.clicks || 0)
  if (r.metrics?.search_impression_share != null) {
    cur.isSum += Number(r.metrics.search_impression_share || 0)
    cur.topSum += Number(r.metrics.search_top_impression_share || 0)
    cur.absSum += Number(r.metrics.search_absolute_top_impression_share || 0)
    cur.budgetSum += Number(r.metrics.search_budget_lost_impression_share || 0)
    cur.rankSum += Number(r.metrics.search_rank_lost_impression_share || 0)
    cur.n += 1
  }
  byCamp.set(name, cur)
}
for (const [name, m] of byCamp) {
  if (m.imp < 100) continue
  const pct = (x) => m.n > 0 ? ((x / m.n) * 100).toFixed(0) + '%' : '—'
  console.log(`\n  ${name}`)
  console.log(`    IS got:           ${pct(m.isSum)}`)
  console.log(`    Top IS:           ${pct(m.topSum)}`)
  console.log(`    Absolute Top IS:  ${pct(m.absSum)}`)
  console.log(`    Lost to budget:   ${pct(m.budgetSum)}`)
  console.log(`    Lost to RANK:     ${pct(m.rankSum)}`)
}

// 3. Top product titles by impressions on Shopping (proxy for Shopping share of voice)
console.log('\n\n--- TOP 15 SHOPPING PRODUCTS BY IMPRESSIONS (30d) ---')
const prodRows = await customer.query(`
  SELECT segments.product_title,
    metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value, metrics.cost_micros
  FROM shopping_performance_view
  WHERE segments.date BETWEEN '${start}' AND '${end}'
  ORDER BY metrics.impressions DESC
  LIMIT 15
`)
for (const r of prodRows) {
  const m = r.metrics
  const spend = Number(m.cost_micros || 0) / 1e6
  const roas = spend > 0 ? (Number(m.conversions_value || 0) / spend).toFixed(2) : '-'
  console.log(`  ${(r.segments?.product_title || '').substring(0, 55).padEnd(56)} ${String(m.impressions).padStart(6)} imp · ${roas}x`)
}

process.exit(0)
