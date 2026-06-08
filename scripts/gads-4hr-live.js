/**
 * GADS 4-HOUR LIVE PULSE — Sat May 16 2026
 * Post-rollback monitoring. All Phase 3 changes shipped Fri 21:13 AEST.
 * Hour-by-hour today + comparison to yesterday hours.
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'

const c = getGadsCustomer()
const fmt = (d) => d.toISOString().slice(0, 10)
const days = (n) => fmt(new Date(Date.now() - n*86400000))
const today = days(0)
const yesterday = days(1)

console.log(`\n========== LIVE PULSE — ${new Date().toISOString().slice(0,16)}Z (Sat AEST) ==========\n`)

// Hour-by-hour TODAY
console.log('--- HOUR-BY-HOUR TODAY (Sat May 16 AEST) ---')
const todayRows = await c.query(`
  SELECT campaign.name, segments.hour,
         metrics.clicks, metrics.impressions, metrics.cost_micros,
         metrics.conversions, metrics.conversions_value
  FROM campaign
  WHERE segments.date = '${today}' AND campaign.status = 'ENABLED'
  ORDER BY segments.hour
`)
const byHour = new Map()
for (const r of todayRows) {
  const h = r.segments?.hour
  if (h == null) continue
  const cur = byHour.get(h) || { clk: 0, imp: 0, sp: 0, conv: 0, val: 0 }
  cur.clk += Number(r.metrics?.clicks || 0)
  cur.imp += Number(r.metrics?.impressions || 0)
  cur.sp += Number(r.metrics?.cost_micros || 0) / 1e6
  cur.conv += Number(r.metrics?.conversions || 0)
  cur.val += Number(r.metrics?.conversions_value || 0)
  byHour.set(h, cur)
}
console.log('Hour | Spend | Clicks | Imp    | Conv | Value | ROAS | CVR')
console.log('-----+-------+--------+--------+------+-------+------+-----')
let tSp = 0, tVal = 0, tConv = 0, tClk = 0
for (const [h, x] of [...byHour.entries()].sort((a,b)=>a[0]-b[0])) {
  tSp += x.sp; tVal += x.val; tConv += x.conv; tClk += x.clk
  const roas = x.sp ? (x.val/x.sp).toFixed(2) : '-'
  const cvr = x.clk ? (x.conv/x.clk*100).toFixed(1) : '-'
  console.log(`${String(h).padStart(2)}:00| $${x.sp.toFixed(0).padStart(4)} | ${String(x.clk).padStart(6)} | ${String(x.imp).padStart(6)} | ${x.conv.toFixed(0).padStart(4)} | $${x.val.toFixed(0).padStart(4)} | ${roas.padStart(4)}x | ${cvr}%`)
}
console.log(`---- TOTAL: $${tSp.toFixed(0)} | ${tClk}clk | ${tConv.toFixed(0)}c | $${tVal.toFixed(0)} val | ${tSp ? (tVal/tSp).toFixed(2) : '-'}x ROAS ----`)

// Hour-by-hour YESTERDAY (for same-hour comparison)
console.log('\n--- HOUR-BY-HOUR YESTERDAY (Fri May 15 AEST) ---')
const yRows = await c.query(`
  SELECT campaign.name, segments.hour, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value
  FROM campaign WHERE segments.date = '${yesterday}' AND campaign.status = 'ENABLED'
  ORDER BY segments.hour
`)
const yHour = new Map()
for (const r of yRows) {
  const h = r.segments?.hour
  if (h == null) continue
  const cur = yHour.get(h) || { clk: 0, sp: 0, conv: 0, val: 0 }
  cur.clk += Number(r.metrics?.clicks || 0)
  cur.sp += Number(r.metrics?.cost_micros || 0) / 1e6
  cur.conv += Number(r.metrics?.conversions || 0)
  cur.val += Number(r.metrics?.conversions_value || 0)
  yHour.set(h, cur)
}
console.log('Hour | Spend | Clicks | Conv | Value | ROAS')
let ySp = 0, yVal = 0, yConv = 0, yClk = 0
for (const [h, x] of [...yHour.entries()].sort((a,b)=>a[0]-b[0])) {
  ySp += x.sp; yVal += x.val; yConv += x.conv; yClk += x.clk
  const roas = x.sp ? (x.val/x.sp).toFixed(2) : '-'
  console.log(`${String(h).padStart(2)}:00| $${x.sp.toFixed(0).padStart(4)} | ${String(x.clk).padStart(6)} | ${x.conv.toFixed(0).padStart(4)} | $${x.val.toFixed(0).padStart(4)} | ${roas}x`)
}
console.log(`---- FULL DAY: $${ySp.toFixed(0)} | ${yClk}clk | ${yConv.toFixed(0)}c | $${yVal.toFixed(0)} val | ${ySp ? (yVal/ySp).toFixed(2) : '-'}x ROAS ----`)

// PER-CAMPAIGN TODAY SO FAR
console.log('\n--- PER-CAMPAIGN TODAY SO FAR ---')
const campRows = await c.query(`
  SELECT campaign.name, campaign.id, metrics.clicks, metrics.impressions,
         metrics.cost_micros, metrics.conversions, metrics.conversions_value,
         metrics.search_impression_share, metrics.search_top_impression_share,
         metrics.search_absolute_top_impression_share
  FROM campaign
  WHERE segments.date = '${today}' AND campaign.status = 'ENABLED'
`)
const camps = new Map()
for (const r of campRows) {
  const k = r.campaign?.name
  const cur = camps.get(k) || { clk: 0, imp: 0, sp: 0, conv: 0, val: 0, is_n: 0, is_sum: 0, top_sum: 0, abs_sum: 0 }
  cur.clk += Number(r.metrics?.clicks || 0)
  cur.imp += Number(r.metrics?.impressions || 0)
  cur.sp += Number(r.metrics?.cost_micros || 0) / 1e6
  cur.conv += Number(r.metrics?.conversions || 0)
  cur.val += Number(r.metrics?.conversions_value || 0)
  if (r.metrics?.search_impression_share != null) {
    cur.is_sum += Number(r.metrics.search_impression_share)
    cur.top_sum += Number(r.metrics.search_top_impression_share || 0)
    cur.abs_sum += Number(r.metrics.search_absolute_top_impression_share || 0)
    cur.is_n++
  }
  camps.set(k, cur)
}
for (const [name, x] of camps) {
  if (x.sp < 0.5) continue
  const roas = x.sp ? (x.val/x.sp).toFixed(2) : '-'
  const cvr = x.clk ? (x.conv/x.clk*100).toFixed(1) : '-'
  const is = x.is_n ? (x.is_sum/x.is_n*100).toFixed(0) : '-'
  const top = x.is_n ? (x.top_sum/x.is_n*100).toFixed(0) : '-'
  const abs = x.is_n ? (x.abs_sum/x.is_n*100).toFixed(0) : '-'
  console.log(`  ${name.padEnd(38)} $${x.sp.toFixed(0).padStart(4)} | ${x.clk}clk ${cvr}%CVR | ${x.conv.toFixed(0)}c $${x.val.toFixed(0)} ${roas}x | IS:${is}% Top:${top}% Abs:${abs}%`)
}

// LANDING PAGE TODAY
console.log('\n--- TOP LANDING PAGES TODAY ---')
const lpRows = await c.query(`
  SELECT landing_page_view.unexpanded_final_url, metrics.clicks, metrics.cost_micros,
         metrics.conversions, metrics.conversions_value
  FROM landing_page_view
  WHERE segments.date = '${today}' AND metrics.clicks > 0
  ORDER BY metrics.cost_micros DESC
  LIMIT 12
`)
for (const r of lpRows) {
  const clk = Number(r.metrics?.clicks || 0)
  const sp = Number(r.metrics?.cost_micros || 0) / 1e6
  const conv = Number(r.metrics?.conversions || 0)
  const val = Number(r.metrics?.conversions_value || 0)
  const cvr = clk ? (conv/clk*100).toFixed(1) : '-'
  const roas = sp ? (val/sp).toFixed(2) : '-'
  const path = (r.landing_page_view?.unexpanded_final_url || '').replace('https://genderrevealideas.com.au', '')
  console.log(`  ${String(clk).padStart(3)}clk ${(cvr+'%').padStart(5)} ${(roas+'x').padStart(5)} $${sp.toFixed(0).padStart(3)} | ${path.slice(0, 90)}`)
}

process.exit(0)
