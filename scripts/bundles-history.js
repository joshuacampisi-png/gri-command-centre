import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const c = getGadsCustomer()

const BUNDLES_ID = 22841772135

// 90 days of daily Bundles data
const end = new Date().toISOString().slice(0,10)
const start = new Date(Date.now()-90*86400000).toISOString().slice(0,10)

const rows = await c.query(`SELECT segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM campaign WHERE campaign.id=${BUNDLES_ID} AND segments.date BETWEEN '${start}' AND '${end}' ORDER BY segments.date`)

console.log(`\n=== PMAX BUNDLES — 90 DAY HISTORY ===\n`)
console.log(`Campaign: GRI PMAX | Bundles (${BUNDLES_ID})`)
console.log(`Window: ${start} → ${end}\n`)
console.log('Date       | Imp   | Clk | Spend   | Conv | Value   | ROAS')
console.log('-----------+-------+-----+---------+------+---------+------')
const apr14 = new Date('2026-04-14').getTime()
let pre={sp:0,val:0,conv:0,clk:0,imp:0,days:0}, post={sp:0,val:0,conv:0,clk:0,imp:0,days:0}
let weekly = []
for (const r of rows) {
  const date = r.segments?.date
  const imp = Number(r.metrics?.impressions||0)
  if (imp===0) continue
  const clk = Number(r.metrics?.clicks||0)
  const sp = Number(r.metrics?.cost_micros||0)/1e6
  const conv = Number(r.metrics?.conversions||0)
  const val = Number(r.metrics?.conversions_value||0)
  const roas = sp?(val/sp).toFixed(2):'-'
  console.log(`${date} | ${String(imp).padStart(5)} | ${String(clk).padStart(3)} | $${sp.toFixed(0).padStart(6)} | ${conv.toFixed(0).padStart(4)} | $${val.toFixed(0).padStart(6)} | ${roas}x`)
  const d = new Date(date).getTime()
  const bucket = d < apr14 ? pre : post
  bucket.imp+=imp; bucket.clk+=clk; bucket.sp+=sp; bucket.conv+=conv; bucket.val+=val; bucket.days+=1
}

console.log(`\n=== AVERAGES ===\n`)
console.log(`PRE Apr 14 (${pre.days} days):  $${(pre.sp/Math.max(pre.days,1)).toFixed(0)}/day avg | Total $${pre.sp.toFixed(0)} | ${pre.sp?(pre.val/pre.sp).toFixed(2):'-'}x ROAS | ${pre.conv.toFixed(0)} total conv`)
console.log(`POST Apr 14 (${post.days} days): $${(post.sp/Math.max(post.days,1)).toFixed(0)}/day avg | Total $${post.sp.toFixed(0)} | ${post.sp?(post.val/post.sp).toFixed(2):'-'}x ROAS | ${post.conv.toFixed(0)} total conv`)

const dailyDelta = (post.sp/Math.max(post.days,1)) - (pre.sp/Math.max(pre.days,1))
const dailyPct = pre.sp ? dailyDelta/(pre.sp/Math.max(pre.days,1))*100 : 0
console.log(`\nΔ Daily spend: ${dailyDelta>0?'+':''}$${dailyDelta.toFixed(0)}/day (${dailyPct>0?'+':''}${dailyPct.toFixed(0)}%)`)

process.exit(0)
