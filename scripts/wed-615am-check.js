/**
 * Wed 6:15am AEST overnight check
 * - Did Brand Defence start serving?
 * - Bundles after $60 budget cut
 * - Account total vs yesterday
 * - Tuesday full day final numbers
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const c = getGadsCustomer()
const fmt = d => d.toISOString().slice(0,10)
const today = fmt(new Date())
const yesterday = fmt(new Date(Date.now()-86400000))
const lastWedToTue = fmt(new Date(Date.now()-7*86400000))

console.log(`\n=== WED 6:15am AEST CHECK — ${today} (vs ${yesterday}) ===\n`)

// 1. Account total
const acct = async (date) => {
  const rows = await c.query(`SELECT metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM customer WHERE segments.date='${date}'`)
  let imp=0,clk=0,sp=0,conv=0,val=0
  for (const r of rows) {
    imp+=Number(r.metrics?.impressions||0)
    clk+=Number(r.metrics?.clicks||0)
    sp+=Number(r.metrics?.cost_micros||0)/1e6
    conv+=Number(r.metrics?.conversions||0)
    val+=Number(r.metrics?.conversions_value||0)
  }
  return { imp,clk,sp,conv,val, roas: sp?val/sp:0, cvr: clk?conv/clk*100:0 }
}
const t = await acct(today)
const y = await acct(yesterday)
const lastWk = await acct(lastWedToTue)
console.log('--- ACCOUNT TOTAL ---')
console.log(`TODAY (Wed early AM):  $${t.sp.toFixed(0)} | ${t.clk}clk | ${t.conv.toFixed(0)}c | $${t.val.toFixed(0)} | ${t.roas.toFixed(2)}x | ${t.cvr.toFixed(1)}%CVR`)
console.log(`YESTERDAY (Tue full):  $${y.sp.toFixed(0)} | ${y.clk}clk | ${y.conv.toFixed(0)}c | $${y.val.toFixed(0)} | ${y.roas.toFixed(2)}x | ${y.cvr.toFixed(1)}%CVR`)
console.log(`Last Tue (same DOW):   $${lastWk.sp.toFixed(0)} | ${lastWk.clk}clk | ${lastWk.conv.toFixed(0)}c | $${lastWk.val.toFixed(0)} | ${lastWk.roas.toFixed(2)}x | ${lastWk.cvr.toFixed(1)}%CVR`)

// 2. Per campaign yesterday + today
console.log(`\n--- PER CAMPAIGN — TUE FULL DAY vs WED EARLY AM ---`)
const camp = async (date) => {
  const r = await c.query(`SELECT campaign.id, campaign.name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM campaign WHERE campaign.status='ENABLED' AND segments.date='${date}'`)
  const m = new Map()
  for (const row of r) {
    const k = row.campaign?.name
    const cur = m.get(k) || { imp:0, clk:0, sp:0, conv:0, val:0 }
    cur.imp+=Number(row.metrics?.impressions||0)
    cur.clk+=Number(row.metrics?.clicks||0)
    cur.sp+=Number(row.metrics?.cost_micros||0)/1e6
    cur.conv+=Number(row.metrics?.conversions||0)
    cur.val+=Number(row.metrics?.conversions_value||0)
    m.set(k, cur)
  }
  return m
}
const tueC = await camp(yesterday)
const wedC = await camp(today)
console.log('Campaign                        | Tue full   | Wed AM     | Δ')
for (const [name, ty] of tueC) {
  const we = wedC.get(name) || {imp:0,clk:0,sp:0,conv:0,val:0}
  const tueR = ty.sp?(ty.val/ty.sp).toFixed(2):'-'
  const wedR = we.sp?(we.val/we.sp).toFixed(2):'-'
  console.log(`${name.slice(0,30).padEnd(30)} | $${ty.sp.toFixed(0).padStart(4)} ${ty.conv.toFixed(0)}c ${tueR}x | $${we.sp.toFixed(0).padStart(4)} ${we.conv.toFixed(0)}c ${wedR}x`)
}

// 3. Brand Defence specifically — any impressions on the new ad?
console.log(`\n--- BRAND DEFENCE STATUS (post-policy-safe RSA ship) ---`)
const bd = await c.query(`SELECT segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM campaign WHERE campaign.id=23425232813 AND segments.date BETWEEN '${new Date(Date.now()-3*86400000).toISOString().slice(0,10)}' AND '${today}' ORDER BY segments.date`)
for (const r of bd) {
  console.log(`  ${r.segments?.date}: ${r.metrics?.impressions||0}imp ${r.metrics?.clicks||0}clk $${(Number(r.metrics?.cost_micros||0)/1e6).toFixed(2)} ${Number(r.metrics?.conversions||0).toFixed(0)}c`)
}
const bdAd = await c.query(`SELECT ad_group_ad.ad.id, ad_group_ad.status FROM ad_group_ad WHERE ad_group.id=193897092609 AND ad_group_ad.status='ENABLED'`)
console.log(`  Active ads in ad group: ${bdAd.length}`)

// 4. Bundles new budget effect
console.log(`\n--- BUNDLES — POST BUDGET CUT ($75 → $60) ---`)
const bndStart = new Date(Date.now()-3*86400000).toISOString().slice(0,10)
const bndRows = await c.query(`SELECT segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM campaign WHERE campaign.id=22841772135 AND segments.date BETWEEN '${bndStart}' AND '${today}' ORDER BY segments.date`)
for (const r of bndRows) {
  const sp = Number(r.metrics?.cost_micros||0)/1e6
  const val = Number(r.metrics?.conversions_value||0)
  const roas = sp?(val/sp).toFixed(2):'-'
  console.log(`  ${r.segments?.date}: $${sp.toFixed(0)} | ${Number(r.metrics?.conversions||0).toFixed(0)}c | $${val.toFixed(0)} | ${roas}x`)
}

// 5. Hourly today
console.log(`\n--- HOURLY TODAY (Wed early AM) ---`)
const hr = await c.query(`SELECT segments.hour, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM customer WHERE segments.date='${today}' ORDER BY segments.hour`)
const byH = new Map()
for (const r of hr) {
  const h = r.segments?.hour
  if (h==null) continue
  const cur = byH.get(h)||{imp:0,clk:0,sp:0,conv:0,val:0}
  cur.imp+=Number(r.metrics?.impressions||0)
  cur.clk+=Number(r.metrics?.clicks||0)
  cur.sp+=Number(r.metrics?.cost_micros||0)/1e6
  cur.conv+=Number(r.metrics?.conversions||0)
  cur.val+=Number(r.metrics?.conversions_value||0)
  byH.set(h,cur)
}
for (const [h,x] of [...byH.entries()].sort((a,b)=>a[0]-b[0])) {
  const roas=x.sp?(x.val/x.sp).toFixed(2):'-'
  console.log(`  ${String(h).padStart(2)}:00 | ${String(x.imp).padStart(4)}imp ${String(x.clk).padStart(3)}clk $${x.sp.toFixed(0)} ${x.conv.toFixed(0)}c $${x.val.toFixed(0)} ${roas}x`)
}
process.exit(0)
