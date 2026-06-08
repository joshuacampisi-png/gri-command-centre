/**
 * GOOGLE ADS HEALTH SNAPSHOT — May 15 2026, post-Phase 1.1.
 * Where are we right now? What's the CVR situation by slice?
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'

const c = getGadsCustomer()
const fmt = (d) => d.toISOString().slice(0, 10)
const days = (n) => fmt(new Date(Date.now() - n*86400000))

console.log(`\n========== GADS HEALTH NOW — ${new Date().toISOString().slice(0,16)} ==========\n`)

// 1. ROLLING 7d vs PREVIOUS 7d (campaign level)
console.log('--- 1. ROLLING 7d vs PRIOR 7d (CVR + ROAS by campaign) ---')
async function campMetrics(start, end) {
  const rows = await c.query(`
    SELECT campaign.name, metrics.clicks, metrics.conversions, metrics.cost_micros, metrics.conversions_value, metrics.impressions
    FROM campaign WHERE segments.date BETWEEN '${start}' AND '${end}' AND campaign.status = 'ENABLED'
  `)
  const m = new Map()
  for (const r of rows) {
    const k = r.campaign?.name
    const cur = m.get(k) || { clk: 0, conv: 0, sp: 0, val: 0, imp: 0 }
    cur.clk += Number(r.metrics?.clicks || 0)
    cur.conv += Number(r.metrics?.conversions || 0)
    cur.sp += Number(r.metrics?.cost_micros || 0) / 1e6
    cur.val += Number(r.metrics?.conversions_value || 0)
    cur.imp += Number(r.metrics?.impressions || 0)
    m.set(k, cur)
  }
  return m
}
const cur7 = await campMetrics(days(7), days(1))
const prev7 = await campMetrics(days(14), days(8))
console.log('  Campaign                              | Now 7d:    clk  CVR  ROAS  spend  val   | Prior 7d:  clk  CVR  ROAS  spend  val')
for (const [k, n] of [...cur7.entries()].sort((a,b)=>b[1].sp-a[1].sp)) {
  if (n.sp < 20) continue
  const p = prev7.get(k) || { clk: 0, conv: 0, sp: 0, val: 0 }
  const ncvr = n.clk ? (n.conv/n.clk*100).toFixed(1) : '-'
  const pcvr = p.clk ? (p.conv/p.clk*100).toFixed(1) : '-'
  const nroas = n.sp ? (n.val/n.sp).toFixed(2) : '-'
  const proas = p.sp ? (p.val/p.sp).toFixed(2) : '-'
  console.log(`  ${k.padEnd(38)} | ${n.clk.toString().padStart(4)} ${(ncvr+'%').padStart(5)} ${(nroas+'x').padStart(5)} $${n.sp.toFixed(0).padStart(4)} $${n.val.toFixed(0).padStart(4)} | ${p.clk.toString().padStart(4)} ${(pcvr+'%').padStart(5)} ${(proas+'x').padStart(5)} $${p.sp.toFixed(0).padStart(4)} $${p.val.toFixed(0).padStart(4)}`)
}

// 2. DEVICE-LEVEL CVR (where is CVR falling?)
console.log('\n--- 2. DEVICE CVR (30d) ---')
const devRows = await c.query(`
  SELECT segments.device, metrics.clicks, metrics.conversions, metrics.cost_micros, metrics.conversions_value
  FROM customer
  WHERE segments.date BETWEEN '${days(30)}' AND '${days(1)}'
`)
const dev = new Map()
for (const r of devRows) {
  const k = r.segments?.device
  const cur = dev.get(k) || { clk: 0, conv: 0, sp: 0, val: 0 }
  cur.clk += Number(r.metrics?.clicks || 0)
  cur.conv += Number(r.metrics?.conversions || 0)
  cur.sp += Number(r.metrics?.cost_micros || 0) / 1e6
  cur.val += Number(r.metrics?.conversions_value || 0)
  dev.set(k, cur)
}
for (const [k, x] of dev) {
  const cvr = x.clk ? (x.conv/x.clk*100).toFixed(2) : '-'
  const roas = x.sp ? (x.val/x.sp).toFixed(2) : '-'
  const cpc = x.clk ? (x.sp/x.clk).toFixed(2) : '-'
  console.log(`  ${String(k).padEnd(12)} ${x.clk.toString().padStart(5)}clk CPC $${cpc} CVR ${cvr}% ROAS ${roas}x — $${x.sp.toFixed(0)} spend $${x.val.toFixed(0)} val`)
}

// 3. DEVICE CVR YoY (is mobile worse than last year?)
console.log('\n--- 3. DEVICE CVR YoY ---')
async function devYoY(start, end) {
  const rows = await c.query(`
    SELECT segments.device, metrics.clicks, metrics.conversions, metrics.cost_micros, metrics.conversions_value
    FROM customer WHERE segments.date BETWEEN '${start}' AND '${end}'
  `)
  const m = new Map()
  for (const r of rows) {
    const k = r.segments?.device
    const cur = m.get(k) || { clk: 0, conv: 0, sp: 0, val: 0 }
    cur.clk += Number(r.metrics?.clicks || 0)
    cur.conv += Number(r.metrics?.conversions || 0)
    cur.sp += Number(r.metrics?.cost_micros || 0) / 1e6
    cur.val += Number(r.metrics?.conversions_value || 0)
    m.set(k, cur)
  }
  return m
}
const a = await devYoY('2025-04-15', '2025-05-14')
const b = await devYoY('2026-04-15', '2026-05-14')
for (const k of new Set([...a.keys(), ...b.keys()])) {
  const A = a.get(k) || { clk: 0, conv: 0, sp: 0, val: 0 }
  const B = b.get(k) || { clk: 0, conv: 0, sp: 0, val: 0 }
  const Acvr = A.clk ? A.conv/A.clk*100 : 0
  const Bcvr = B.clk ? B.conv/B.clk*100 : 0
  const Aroas = A.sp ? A.val/A.sp : 0
  const Broas = B.sp ? B.val/B.sp : 0
  console.log(`  ${String(k).padEnd(12)} 2025: ${Acvr.toFixed(2)}% CVR ${Aroas.toFixed(2)}x | 2026: ${Bcvr.toFixed(2)}% CVR ${Broas.toFixed(2)}x | ΔCVR: ${(Bcvr-Acvr).toFixed(2)}% ΔROAS: ${(Broas-Aroas).toFixed(2)}x`)
}

// 4. LANDING PAGE PERFORMANCE (which LPs are converting?)
console.log('\n--- 4. TOP 15 LANDING PAGES BY SPEND (30d) ---')
const lpRows = await c.query(`
  SELECT landing_page_view.unexpanded_final_url, metrics.clicks, metrics.conversions, metrics.cost_micros, metrics.conversions_value
  FROM landing_page_view
  WHERE segments.date BETWEEN '${days(30)}' AND '${days(1)}'
    AND metrics.clicks > 5
  ORDER BY metrics.cost_micros DESC
  LIMIT 20
`)
for (const r of lpRows) {
  const clk = Number(r.metrics?.clicks || 0)
  const conv = Number(r.metrics?.conversions || 0)
  const sp = Number(r.metrics?.cost_micros || 0) / 1e6
  const val = Number(r.metrics?.conversions_value || 0)
  const cvr = clk ? (conv/clk*100).toFixed(1) : '-'
  const roas = sp ? (val/sp).toFixed(2) : '-'
  const url = (r.landing_page_view?.unexpanded_final_url || '').replace('https://genderrevealideas.com.au', '')
  console.log(`  ${clk.toString().padStart(4)}clk ${(cvr+'%').padStart(5)} ${(roas+'x').padStart(5)} $${sp.toFixed(0).padStart(4)} — ${url.slice(0, 70)}`)
}

// 5. TODAY + YESTERDAY (live pulse)
console.log('\n--- 5. LIVE PULSE (yesterday + today) ---')
for (const [start, end, label] of [[days(1), days(1), 'YESTERDAY'], [days(0), days(0), 'TODAY (so far)']]) {
  const rows = await c.query(`
    SELECT campaign.name, metrics.clicks, metrics.conversions, metrics.cost_micros, metrics.conversions_value
    FROM campaign WHERE segments.date BETWEEN '${start}' AND '${end}' AND campaign.status = 'ENABLED'
  `)
  let spT = 0, valT = 0, convT = 0, clkT = 0
  console.log(`  --- ${label} ---`)
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
  for (const [k, x] of m) {
    if (x.sp < 1) continue
    spT += x.sp; valT += x.val; convT += x.conv; clkT += x.clk
    const cvr = x.clk ? (x.conv/x.clk*100).toFixed(1) : '-'
    const roas = x.sp ? (x.val/x.sp).toFixed(2) : '-'
    console.log(`    ${k.padEnd(40)} $${x.sp.toFixed(0).padStart(4)} ${x.clk}clk ${cvr}% CVR ${x.conv.toFixed(0)}c $${x.val.toFixed(0)} val ${roas}x`)
  }
  const cvrT = clkT ? (convT/clkT*100).toFixed(1) : '-'
  const roasT = spT ? (valT/spT).toFixed(2) : '-'
  console.log(`    TOTAL: $${spT.toFixed(0)} ${clkT}clk ${cvrT}% CVR ${convT.toFixed(0)}c $${valT.toFixed(0)} val ${roasT}x`)
}

console.log('\n========== DONE ==========\n')
process.exit(0)
