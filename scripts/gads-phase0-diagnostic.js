/**
 * PHASE 0 DIAGNOSTIC — May 15 2026
 * All read-only data pulls needed before Phase 1 execution.
 *
 * Pulls:
 * 1. Auction Insights YoY (which domains gained ground?)
 * 2. CPC YoY top terms
 * 3. CVR YoY per campaign
 * 4. PMAX product-level performance (Cannon & Powder)
 * 5. "gender reveal poppers" search-term breakdown
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
import { writeFileSync, mkdirSync } from 'fs'

const c = getGadsCustomer()
mkdirSync('data/snapshots/gads-phase0', { recursive: true })

const today = new Date()
const fmt = (d) => d.toISOString().slice(0, 10)
const days = (n) => fmt(new Date(today.getTime() - n*86400000))

const A_start = '2025-04-15', A_end = '2025-05-14'   // YoY-prior
const B_start = '2026-04-15', B_end = '2026-05-14'   // current

console.log(`\n========== PHASE 0 DIAGNOSTIC — ${fmt(today)} ==========\n`)

// ============= 1. AUCTION INSIGHTS YoY =============
console.log('--- 1. AUCTION INSIGHTS YoY (top competitors at the auction) ---')
async function pullAI(start, end, label) {
  try {
    const rows = await c.query(`
      SELECT campaign.name, ad_group_ad.ad_group,
             auction_insight_domain.domain,
             metrics.impression_share,
             metrics.outranking_share,
             metrics.top_of_page_rate,
             metrics.overlap_rate
      FROM ad_group_auction_insight
      WHERE segments.date BETWEEN '${start}' AND '${end}'
    `)
    if (!rows.length) {
      console.log(`  ${label}: no rows`)
      return new Map()
    }
    const dom = new Map()
    for (const r of rows) {
      const k = r.auction_insight_domain?.domain
      if (!k) continue
      const cur = dom.get(k) || { is: 0, outrank: 0, top: 0, overlap: 0, n: 0 }
      cur.is += Number(r.metrics?.impression_share || 0)
      cur.outrank += Number(r.metrics?.outranking_share || 0)
      cur.top += Number(r.metrics?.top_of_page_rate || 0)
      cur.overlap += Number(r.metrics?.overlap_rate || 0)
      cur.n++
      dom.set(k, cur)
    }
    console.log(`  ${label}:`)
    const sorted = [...dom.entries()].sort((a,b) => (b[1].is/b[1].n) - (a[1].is/a[1].n))
    for (const [d, x] of sorted.slice(0, 15)) {
      console.log(`    ${d.padEnd(40)} IS:${(x.is/x.n*100).toFixed(1)}% Outrank:${(x.outrank/x.n*100).toFixed(1)}% Overlap:${(x.overlap/x.n*100).toFixed(1)}%`)
    }
    return dom
  } catch (e) {
    console.log(`  ${label} error:`, e.message?.slice(0, 200))
    return new Map()
  }
}
await pullAI(A_start, A_end, 'A: May 2025 same window')
await pullAI(B_start, B_end, 'B: May 2026 same window')

// ============= 2. CPC YoY TOP TERMS =============
console.log('\n--- 2. CPC YoY (account-level CPCs by month) ---')
const cpcRows = await c.query(`
  SELECT segments.month, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value
  FROM customer
  WHERE segments.date BETWEEN '2025-04-01' AND '${B_end}'
`)
const byMonth = new Map()
for (const r of cpcRows) {
  const m = r.segments?.month
  const cur = byMonth.get(m) || { clk: 0, sp: 0, conv: 0, val: 0 }
  cur.clk += Number(r.metrics?.clicks || 0)
  cur.sp += Number(r.metrics?.cost_micros || 0) / 1e6
  cur.conv += Number(r.metrics?.conversions || 0)
  cur.val += Number(r.metrics?.conversions_value || 0)
  byMonth.set(m, cur)
}
console.log('  Month    | CPC   | CVR   | AOV   | ROAS')
console.log('  ---------+-------+-------+-------+------')
for (const [m, x] of [...byMonth.entries()].sort()) {
  const cpc = x.clk > 0 ? (x.sp / x.clk).toFixed(2) : '-'
  const cvr = x.clk > 0 ? (x.conv / x.clk * 100).toFixed(1) : '-'
  const aov = x.conv > 0 ? (x.val / x.conv).toFixed(0) : '-'
  const roas = x.sp > 0 ? (x.val / x.sp).toFixed(2) : '-'
  console.log(`  ${m} | $${cpc.padStart(4)} | ${cvr.padStart(4)}% | $${aov.padStart(3)} | ${roas}x`)
}

// ============= 3. CVR YoY per campaign =============
console.log('\n--- 3. CAMPAIGN-LEVEL CVR YoY ---')
async function campMetrics(start, end) {
  const rows = await c.query(`
    SELECT campaign.name, metrics.clicks, metrics.conversions, metrics.cost_micros, metrics.conversions_value
    FROM campaign WHERE segments.date BETWEEN '${start}' AND '${end}' AND campaign.status = 'ENABLED'
  `)
  const m = new Map()
  for (const r of rows) {
    const k = r.campaign?.name
    const cur = m.get(k) || { clk: 0, conv: 0, sp: 0, val: 0 }
    cur.clk += Number(r.metrics?.clicks || 0)
    cur.conv += Number(r.metrics?.conversions || 0)
    cur.sp += Number(r.metrics?.cost_micros || 0) / 1e6
    cur.val += Number(r.metrics?.conversions_value || 0)
    m.set(k, cur)
  }
  return m
}
const ay = await campMetrics(A_start, A_end)
const by = await campMetrics(B_start, B_end)
console.log('  Campaign                                  | A (2025) CVR  ROAS | B (2026) CVR  ROAS | Δ CVR  Δ ROAS')
const allKeys = new Set([...ay.keys(), ...by.keys()])
for (const k of allKeys) {
  const a = ay.get(k) || { clk: 0, conv: 0, sp: 0, val: 0 }
  const b = by.get(k) || { clk: 0, conv: 0, sp: 0, val: 0 }
  const acvr = a.clk > 0 ? a.conv / a.clk * 100 : 0
  const bcvr = b.clk > 0 ? b.conv / b.clk * 100 : 0
  const aroas = a.sp > 0 ? a.val / a.sp : 0
  const broas = b.sp > 0 ? b.val / b.sp : 0
  if (a.sp < 50 && b.sp < 50) continue
  console.log(`  ${k.padEnd(40)} | ${acvr.toFixed(1).padStart(4)}% ${aroas.toFixed(2).padStart(4)}x | ${bcvr.toFixed(1).padStart(4)}% ${broas.toFixed(2).padStart(4)}x | ${(bcvr-acvr).toFixed(1).padStart(5)}% ${(broas-aroas).toFixed(2).padStart(5)}x`)
}

// ============= 4. PMAX PRODUCT-LEVEL PERFORMANCE =============
console.log('\n--- 4. PMAX PRODUCT-LEVEL ROAS (last 30d, all PMAX campaigns) ---')
const prodRows = await c.query(`
  SELECT campaign.name, segments.product_item_id, segments.product_title,
         metrics.cost_micros, metrics.conversions, metrics.conversions_value,
         metrics.impressions, metrics.clicks
  FROM shopping_performance_view
  WHERE segments.date BETWEEN '${B_start}' AND '${B_end}'
  ORDER BY metrics.cost_micros DESC
`)
const byProd = new Map()
for (const r of prodRows) {
  const k = `${r.campaign?.name}|${r.segments?.product_item_id}|${r.segments?.product_title}`
  const cur = byProd.get(k) || { sp: 0, val: 0, conv: 0, imp: 0, clk: 0 }
  cur.sp += Number(r.metrics?.cost_micros || 0) / 1e6
  cur.val += Number(r.metrics?.conversions_value || 0)
  cur.conv += Number(r.metrics?.conversions || 0)
  cur.imp += Number(r.metrics?.impressions || 0)
  cur.clk += Number(r.metrics?.clicks || 0)
  byProd.set(k, cur)
}
const products = [...byProd.entries()].map(([k, v]) => {
  const [camp, pid, title] = k.split('|')
  return { camp, pid, title, ...v, roas: v.sp > 0 ? v.val / v.sp : 0 }
}).filter(p => p.sp > 0)
products.sort((a, b) => b.sp - a.sp)

console.log(`\n  TOP 25 PMAX PRODUCTS BY SPEND (30d):`)
for (const p of products.slice(0, 25)) {
  console.log(`    $${p.sp.toFixed(0).padStart(4)} → $${p.val.toFixed(0).padStart(4)} (${p.roas.toFixed(2)}x) ${p.conv.toFixed(0)}c | ${p.pid} | ${p.title?.slice(0, 50)} | ${p.camp?.slice(0, 30)}`)
}

console.log(`\n  BOTTOM-QUARTILE BLEEDERS (>$30 spent, <1.5x ROAS):`)
const bleeders = products.filter(p => p.sp > 30 && p.roas < 1.5).sort((a,b) => a.roas - b.roas)
let bleedSpend = 0, bleedVal = 0
for (const p of bleeders) {
  bleedSpend += p.sp; bleedVal += p.val
  console.log(`    $${p.sp.toFixed(0).padStart(4)} → $${p.val.toFixed(0).padStart(4)} (${p.roas.toFixed(2)}x) | ${p.pid} | ${p.title?.slice(0, 50)} | ${p.camp?.slice(0, 30)}`)
}
console.log(`\n  TOTAL BLEEDER SPEND: $${bleedSpend.toFixed(0)} | Value: $${bleedVal.toFixed(0)} | Loss: $${(bleedSpend - bleedVal).toFixed(0)}`)

writeFileSync('data/snapshots/gads-phase0/products-30d.json', JSON.stringify(products, null, 2))

// ============= 5. SEARCH TERMS FOR "GENDER REVEAL POPPERS" =============
console.log('\n--- 5. "GENDER REVEAL POPPERS" SEARCH-TERM BREAKDOWN (90d) ---')
const stRows = await c.query(`
  SELECT search_term_view.search_term, campaign.name, ad_group.name,
         metrics.impressions, metrics.clicks, metrics.cost_micros,
         metrics.conversions, metrics.conversions_value
  FROM search_term_view
  WHERE segments.date BETWEEN '${days(90)}' AND '${B_end}'
    AND ad_group_criterion.keyword.text = 'gender reveal poppers'
  ORDER BY metrics.cost_micros DESC
`)
let totSp = 0, totVal = 0, totConv = 0
for (const r of stRows) {
  const sp = Number(r.metrics?.cost_micros || 0) / 1e6
  const val = Number(r.metrics?.conversions_value || 0)
  const conv = Number(r.metrics?.conversions || 0)
  const imp = Number(r.metrics?.impressions || 0)
  const clk = Number(r.metrics?.clicks || 0)
  const roas = sp > 0 ? (val / sp).toFixed(2) : '-'
  totSp += sp; totVal += val; totConv += conv
  console.log(`  ${imp.toString().padStart(4)}imp ${clk.toString().padStart(3)}clk $${sp.toFixed(0).padStart(4)} ${conv.toFixed(0).padStart(2)}c $${val.toFixed(0).padStart(4)} ${roas.padStart(5)}x — "${r.search_term_view?.search_term}"`)
}
console.log(`\n  TOTAL on "gender reveal poppers" keyword: $${totSp.toFixed(0)} spend, ${totConv.toFixed(0)} conv, $${totVal.toFixed(0)} val, ${totSp > 0 ? (totVal/totSp).toFixed(2) : '-'}x ROAS`)
writeFileSync('data/snapshots/gads-phase0/poppers-search-terms.json', JSON.stringify(stRows, null, 2))

console.log('\n========== DIAGNOSTIC COMPLETE ==========\n')
process.exit(0)
