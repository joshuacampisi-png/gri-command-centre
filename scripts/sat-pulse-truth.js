/**
 * SATURDAY PULSE — TRUTH REPORT
 * Pull full today + comparisons + impression share trajectory.
 * No spin. Just data.
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'

const c = getGadsCustomer()
const fmt = (d) => d.toISOString().slice(0, 10)
const days = (n) => fmt(new Date(Date.now() - n*86400000))

async function pull(start, end) {
  const rows = await c.query(`
    SELECT campaign.name, campaign.status, metrics.clicks, metrics.impressions,
           metrics.cost_micros, metrics.conversions, metrics.conversions_value,
           metrics.search_impression_share, metrics.search_top_impression_share,
           metrics.search_absolute_top_impression_share
    FROM campaign
    WHERE segments.date BETWEEN '${start}' AND '${end}' AND campaign.status = 'ENABLED'
  `)
  const m = { totals: { clk: 0, imp: 0, sp: 0, conv: 0, val: 0 }, byCamp: new Map() }
  for (const r of rows) {
    const k = r.campaign?.name
    const cur = m.byCamp.get(k) || { clk: 0, imp: 0, sp: 0, conv: 0, val: 0, is: 0, top: 0, abs: 0, n: 0 }
    cur.clk += Number(r.metrics?.clicks || 0)
    cur.imp += Number(r.metrics?.impressions || 0)
    cur.sp += Number(r.metrics?.cost_micros || 0) / 1e6
    cur.conv += Number(r.metrics?.conversions || 0)
    cur.val += Number(r.metrics?.conversions_value || 0)
    if (r.metrics?.search_impression_share != null) {
      cur.is += Number(r.metrics.search_impression_share)
      cur.top += Number(r.metrics.search_top_impression_share || 0)
      cur.abs += Number(r.metrics.search_absolute_top_impression_share || 0)
      cur.n++
    }
    m.byCamp.set(k, cur)
    m.totals.clk += cur.clk
    m.totals.imp += cur.imp
    m.totals.sp += cur.sp
    m.totals.conv += cur.conv
    m.totals.val += cur.val
  }
  return m
}

console.log(`\n========== TRUTH PULSE — ${new Date().toISOString().slice(0,16)} ==========\n`)

// Today
console.log(`--- TODAY SO FAR (${days(0)}) ---`)
const today = await pull(days(0), days(0))
for (const [n, x] of today.byCamp) {
  if (x.sp < 0.5) continue
  const roas = x.sp ? (x.val/x.sp).toFixed(2) : '-'
  const cvr = x.clk ? (x.conv/x.clk*100).toFixed(1) : '-'
  console.log(`  ${n.padEnd(38)} $${x.sp.toFixed(0).padStart(4)} | ${x.clk}clk ${cvr}%CVR | ${x.conv.toFixed(0)}c $${x.val.toFixed(0)} val ${roas}x`)
}
let totT = today.totals
console.log(`  TOTAL: $${totT.sp.toFixed(0)} | ${totT.clk}clk | ${totT.conv.toFixed(0)}c | $${totT.val.toFixed(0)} val | ${totT.sp ? (totT.val/totT.sp).toFixed(2) : '-'}x ROAS`)

// Yesterday (full day, was post-Phase3 disaster day)
console.log(`\n--- YESTERDAY FULL DAY (${days(1)} — post-Phase3 pre-rollback) ---`)
const y = await pull(days(1), days(1))
for (const [n, x] of y.byCamp) {
  if (x.sp < 0.5) continue
  const roas = x.sp ? (x.val/x.sp).toFixed(2) : '-'
  const cvr = x.clk ? (x.conv/x.clk*100).toFixed(1) : '-'
  console.log(`  ${n.padEnd(38)} $${x.sp.toFixed(0).padStart(4)} | ${x.clk}clk ${cvr}%CVR | ${x.conv.toFixed(0)}c $${x.val.toFixed(0)} val ${roas}x`)
}
let totY = y.totals
console.log(`  TOTAL: $${totY.sp.toFixed(0)} | ${totY.clk}clk | ${totY.conv.toFixed(0)}c | $${totY.val.toFixed(0)} val | ${totY.sp ? (totY.val/totY.sp).toFixed(2) : '-'}x ROAS`)

// Last 7 days daily breakdown
console.log(`\n--- LAST 7 DAYS DAILY ROAS ---`)
const dailyRows = await c.query(`
  SELECT segments.date, metrics.cost_micros, metrics.conversions_value, metrics.conversions, metrics.clicks
  FROM customer WHERE segments.date BETWEEN '${days(7)}' AND '${days(0)}'
`)
const byDay = new Map()
for (const r of dailyRows) {
  const d = r.segments?.date
  const cur = byDay.get(d) || { sp: 0, val: 0, conv: 0, clk: 0 }
  cur.sp += Number(r.metrics?.cost_micros || 0) / 1e6
  cur.val += Number(r.metrics?.conversions_value || 0)
  cur.conv += Number(r.metrics?.conversions || 0)
  cur.clk += Number(r.metrics?.clicks || 0)
  byDay.set(d, cur)
}
const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
for (const [d, x] of [...byDay.entries()].sort()) {
  const roas = x.sp ? (x.val/x.sp).toFixed(2) : '-'
  const cvr = x.clk ? (x.conv/x.clk*100).toFixed(1) : '-'
  const dn = dayNames[new Date(d).getUTCDay()]
  const flag = (x.sp > 0 && (x.val/x.sp) < 1.5) ? ' 🔴' : (x.sp > 0 && (x.val/x.sp) >= 2.0 ? ' ✅' : '')
  console.log(`  ${d} ${dn}: $${x.sp.toFixed(0).padStart(4)} → $${x.val.toFixed(0).padStart(4)} (${roas}x) ${x.conv.toFixed(0)}c ${cvr}% CVR${flag}`)
}

// Pre-Phase-3 baseline (May 7-13)
console.log(`\n--- PRE-PHASE-3 BASELINE (May 7-13) ---`)
const baseline = await pull('2026-05-07', '2026-05-13')
let bSp = baseline.totals.sp, bVal = baseline.totals.val, bConv = baseline.totals.conv, bClk = baseline.totals.clk
console.log(`  Total spend: $${bSp.toFixed(0)} | Value: $${bVal.toFixed(0)} | Conv: ${bConv.toFixed(0)} | Clicks: ${bClk}`)
console.log(`  ROAS: ${bSp ? (bVal/bSp).toFixed(2) : '-'}x | CVR: ${bClk ? (bConv/bClk*100).toFixed(2) : '-'}% | Daily avg spend: $${(bSp/7).toFixed(0)}`)

// 30d IS metrics for trend
console.log(`\n--- 30d IS METRICS BY CAMPAIGN ---`)
const m30 = await pull(days(30), days(1))
for (const [n, x] of m30.byCamp) {
  if (x.imp < 1000) continue
  const is = x.n ? (x.is/x.n*100).toFixed(0) : '-'
  const top = x.n ? (x.top/x.n*100).toFixed(0) : '-'
  const abs = x.n ? (x.abs/x.n*100).toFixed(0) : '-'
  console.log(`  ${n.padEnd(38)} IS:${is}% Top:${top}% Abs:${abs}% (${x.imp.toLocaleString()}imp)`)
}

process.exit(0)
