/**
 * 12-MONTH HISTORY — month-by-month campaign performance + search term universe.
 * Surfaces seasonality, regression points, and the full query landscape.
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'

const c = getGadsCustomer()
const today = new Date()
const fmt = (d) => d.toISOString().slice(0, 10)
const start = fmt(new Date(today.getFullYear() - 1, today.getMonth(), today.getDate()))
const end = fmt(new Date(today.getTime() - 86400000))

console.log(`\n=== 12-MONTH HISTORY — ${start} → ${end} ===\n`)

// 1. MONTH-BY-MONTH ACCOUNT
console.log('--- ACCOUNT BY MONTH ---')
const monthRows = await c.query(`
  SELECT segments.month, metrics.cost_micros, metrics.conversions,
         metrics.conversions_value, metrics.clicks, metrics.impressions
  FROM customer
  WHERE segments.date BETWEEN '${start}' AND '${end}'
`)
const byMonth = new Map()
for (const r of monthRows) {
  const m = r.segments?.month
  const cur = byMonth.get(m) || { spend: 0, val: 0, conv: 0, clk: 0, imp: 0 }
  cur.spend += Number(r.metrics?.cost_micros || 0) / 1e6
  cur.val += Number(r.metrics?.conversions_value || 0)
  cur.conv += Number(r.metrics?.conversions || 0)
  cur.clk += Number(r.metrics?.clicks || 0)
  cur.imp += Number(r.metrics?.impressions || 0)
  byMonth.set(m, cur)
}
for (const [m, x] of [...byMonth.entries()].sort()) {
  const roas = x.spend > 0 ? (x.val / x.spend).toFixed(2) : '-'
  const cpa = x.conv > 0 ? (x.spend / x.conv).toFixed(0) : '-'
  console.log(`  ${m}: $${x.spend.toFixed(0).padStart(5)} | $${x.val.toFixed(0).padStart(5)} val | ${x.conv.toFixed(1).padStart(6)}c | ${roas}x ROAS | $${cpa} CPA | ${x.imp.toString().padStart(7)}imp`)
}

// 2. CAMPAIGN BY MONTH
console.log('\n--- TOP CAMPAIGNS BY MONTH ---')
const campMonth = await c.query(`
  SELECT campaign.name, segments.month, metrics.cost_micros, metrics.conversions_value
  FROM campaign
  WHERE segments.date BETWEEN '${start}' AND '${end}'
`)
const cm = new Map()
for (const r of campMonth) {
  const k = `${r.segments?.month}|${r.campaign?.name}`
  const cur = cm.get(k) || { spend: 0, val: 0 }
  cur.spend += Number(r.metrics?.cost_micros || 0) / 1e6
  cur.val += Number(r.metrics?.conversions_value || 0)
  cm.set(k, cur)
}
const byMonthCamp = new Map()
for (const [k, x] of cm) {
  if (x.spend < 10) continue
  const [m, name] = k.split('|')
  const arr = byMonthCamp.get(m) || []
  arr.push({ name, ...x })
  byMonthCamp.set(m, arr)
}
for (const [m, arr] of [...byMonthCamp.entries()].sort()) {
  console.log(`  ${m}:`)
  for (const x of arr.sort((a,b)=>b.spend-a.spend)) {
    const roas = (x.val / x.spend).toFixed(2)
    console.log(`    ${x.name.padEnd(40)} $${x.spend.toFixed(0).padStart(5)} → $${x.val.toFixed(0).padStart(5)} (${roas}x)`)
  }
}

// 3. ALL SEARCH TERMS — 90d, full universe
console.log('\n--- ALL SEARCH TERMS (90d, impressions > 20) ---')
const start90 = fmt(new Date(today.getTime() - 90*86400000))
const stRows = await c.query(`
  SELECT search_term_view.search_term, metrics.impressions, metrics.clicks,
         metrics.cost_micros, metrics.conversions, metrics.conversions_value
  FROM search_term_view
  WHERE segments.date BETWEEN '${start90}' AND '${end}'
    AND metrics.impressions > 20
  ORDER BY metrics.impressions DESC
  LIMIT 200
`)
let totalImp = 0, totalSp = 0, totalVal = 0
for (const r of stRows) {
  const imp = Number(r.metrics?.impressions || 0)
  const clk = Number(r.metrics?.clicks || 0)
  const sp = Number(r.metrics?.cost_micros || 0) / 1e6
  const conv = Number(r.metrics?.conversions || 0)
  const val = Number(r.metrics?.conversions_value || 0)
  totalImp += imp; totalSp += sp; totalVal += val
  const ctr = imp > 0 ? (clk / imp * 100).toFixed(0) : '-'
  const roas = sp > 0 ? (val / sp).toFixed(1) : '-'
  console.log(`  ${imp.toString().padStart(5)}imp ${ctr.padStart(2)}% $${sp.toFixed(0).padStart(4)} ${conv.toFixed(0).padStart(2)}c ${roas.padStart(4)}x — "${r.search_term_view?.search_term}"`)
}
console.log(`\n  90d total surfaced: ${totalImp}imp, $${totalSp.toFixed(0)} spend, $${totalVal.toFixed(0)} val`)

console.log('\n=== DONE ===\n')
process.exit(0)
