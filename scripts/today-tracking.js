/**
 * STATUS TRACKING — all changes shipped today
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const c = getGadsCustomer()
const today = new Date().toISOString().slice(0,10)
const yesterday = new Date(Date.now()-86400000).toISOString().slice(0,10)

console.log(`\n========== TODAY'S TRACKING — ${new Date().toISOString().slice(0,16)} (${today}) ==========\n`)

// 1. Brand Defence campaign performance since activation
console.log(`--- 1. GRI | Search | Brand Defence (activated ~02:46 UTC today) ---`)
const brandRows = await c.query(`
  SELECT segments.hour, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value, metrics.search_impression_share
  FROM campaign WHERE campaign.id = 23425232813 AND segments.date = '${today}'
  ORDER BY segments.hour
`)
if (!brandRows.length) console.log('  No impressions yet today (campaign may still be in 1-4hr serving warmup)')
let bImp=0,bClk=0,bSp=0,bConv=0,bVal=0
for (const r of brandRows) {
  const h=r.segments?.hour, imp=Number(r.metrics?.impressions||0), clk=Number(r.metrics?.clicks||0), sp=Number(r.metrics?.cost_micros||0)/1e6
  const conv=Number(r.metrics?.conversions||0), val=Number(r.metrics?.conversions_value||0)
  bImp+=imp; bClk+=clk; bSp+=sp; bConv+=conv; bVal+=val
  if (imp>0) console.log(`  ${String(h).padStart(2)}:00 → ${imp}imp ${clk}clk $${sp.toFixed(2)} ${conv}c $${val.toFixed(2)}`)
}
console.log(`  TOTAL: ${bImp}imp ${bClk}clk $${bSp.toFixed(2)} ${bConv}c $${bVal.toFixed(2)}`)

// 2. PMAX campaigns today vs yesterday (same partial-day comparison)
console.log(`\n--- 2. PMAX SHOPPING ROAS — TODAY vs YESTERDAY (same hours so far) ---`)
const PMAX = {'21113841118':'All Products','21511998936':'Cannon & Powder','22841772135':'Bundles'}
const nowHour = new Date().getUTCHours()  // AEST = UTC+10 but Google Ads reports in account timezone (likely AEST already)
console.log(`Current hour: ${nowHour} UTC`)

for (const [id,name] of Object.entries(PMAX)) {
  const tRows = await c.query(`SELECT metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM campaign WHERE campaign.id=${id} AND segments.date='${today}'`)
  const yRows = await c.query(`SELECT metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM campaign WHERE campaign.id=${id} AND segments.date='${yesterday}'`)
  let tSp=0,tVal=0,tImp=0, ySp=0,yVal=0,yImp=0
  for (const r of tRows) { tImp+=Number(r.metrics?.impressions||0); tSp+=Number(r.metrics?.cost_micros||0)/1e6; tVal+=Number(r.metrics?.conversions_value||0) }
  for (const r of yRows) { yImp+=Number(r.metrics?.impressions||0); ySp+=Number(r.metrics?.cost_micros||0)/1e6; yVal+=Number(r.metrics?.conversions_value||0) }
  const tRoas = tSp?(tVal/tSp).toFixed(2):'-', yRoas = ySp?(yVal/ySp).toFixed(2):'-'
  console.log(`  ${name.padEnd(18)}: TODAY ${tImp}imp $${tSp.toFixed(0)} → $${tVal.toFixed(0)} (${tRoas}x) | YESTERDAY ${yImp}imp $${ySp.toFixed(0)} → $${yVal.toFixed(0)} (${yRoas}x)`)
}

// 3. Account total
console.log(`\n--- 3. ACCOUNT TOTAL — today so far ---`)
const total = await c.query(`SELECT metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM customer WHERE segments.date='${today}'`)
let aImp=0,aClk=0,aSp=0,aConv=0,aVal=0
for (const r of total) { aImp+=Number(r.metrics?.impressions||0); aClk+=Number(r.metrics?.clicks||0); aSp+=Number(r.metrics?.cost_micros||0)/1e6; aConv+=Number(r.metrics?.conversions||0); aVal+=Number(r.metrics?.conversions_value||0) }
console.log(`  Spend: $${aSp.toFixed(2)} | Imp: ${aImp} | Clk: ${aClk} | Conv: ${aConv} | Value: $${aVal.toFixed(0)} | ROAS: ${aSp?(aVal/aSp).toFixed(2):'-'}x`)

const yTotal = await c.query(`SELECT metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM customer WHERE segments.date='${yesterday}'`)
let yaImp=0,yaSp=0,yaVal=0
for (const r of yTotal) { yaImp+=Number(r.metrics?.impressions||0); yaSp+=Number(r.metrics?.cost_micros||0)/1e6; yaVal+=Number(r.metrics?.conversions_value||0) }
console.log(`  YESTERDAY FULL DAY: $${yaSp.toFixed(0)} spend, ${yaImp} imp, $${yaVal.toFixed(0)} val, ${yaSp?(yaVal/yaSp).toFixed(2):'-'}x ROAS`)

process.exit(0)
