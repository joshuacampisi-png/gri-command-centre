import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const AUTH = 'Basic ' + Buffer.from(`${process.env.DATAFORSEO_EMAIL}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64')

// 1. Pregnancy reveal volume
const r = await fetch('https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live', {
  method:'POST', headers:{Authorization:AUTH,'Content-Type':'application/json'},
  body: JSON.stringify([{location_code:2036, language_code:'en', keywords:[
    'pregnancy reveal','pregnancy reveal ideas','pregnancy announcement','pregnancy announcement ideas',
    'pregnancy reveal gifts','pregnancy reveal party','baby announcement ideas'
  ]}])
}).then(r=>r.json())
console.log('\n=== "pregnancy reveal" family — AU volume ===')
console.log('Keyword                          | Vol/mo | CPC')
for (const x of (r.tasks?.[0]?.result||[]).sort((a,b)=>(b.search_volume||0)-(a.search_volume||0))) {
  console.log(`${x.keyword.padEnd(33)} | ${String(x.search_volume||0).padStart(6)} | $${(x.cpc||0).toFixed(2)}`)
}

// 2. Shopping impressions trend over last 120 days (weekly)
const c = getGadsCustomer()
const end = new Date().toISOString().slice(0,10)
const start = new Date(Date.now()-120*86400000).toISOString().slice(0,10)
console.log(`\n=== SHOPPING TREND (weekly, ${start} → ${end}) ===`)
const rows = await c.query(`
  SELECT segments.week, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value
  FROM shopping_performance_view
  WHERE segments.date BETWEEN '${start}' AND '${end}'
`)
const wk = new Map()
for (const r of rows) {
  const w = r.segments?.week
  if (!w) continue
  const cur = wk.get(w) || { imp:0, clk:0, sp:0, conv:0, val:0 }
  cur.imp += Number(r.metrics?.impressions||0)
  cur.clk += Number(r.metrics?.clicks||0)
  cur.sp  += Number(r.metrics?.cost_micros||0)/1e6
  cur.conv+= Number(r.metrics?.conversions||0)
  cur.val += Number(r.metrics?.conversions_value||0)
  wk.set(w, cur)
}
console.log('Week-of    | Imp     | Clk   | Spend  | Value  | ROAS  | flag')
console.log('-----------+---------+-------+--------+--------+-------+------')
const sorted = [...wk.entries()].sort((a,b)=>a[0].localeCompare(b[0]))
for (const [w,x] of sorted) {
  const roas = x.sp ? (x.val/x.sp).toFixed(2):'-'
  const flag = w >= '2026-04-13' && w <= '2026-04-27' ? '  ← Apr 14 title edit window' : ''
  console.log(`${w?.slice(0,10)} | ${String(x.imp).padStart(7)} | ${String(x.clk).padStart(5)} | $${x.sp.toFixed(0).padStart(5)} | $${x.val.toFixed(0).padStart(5)} | ${roas.padStart(4)}x${flag}`)
}

// 3. Compare 30d pre vs post Apr 14
const apr14 = new Date('2026-04-14').getTime()
let pre = {imp:0,sp:0,val:0,conv:0}, post = {imp:0,sp:0,val:0,conv:0}
const all = await c.query(`SELECT segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM shopping_performance_view WHERE segments.date BETWEEN '${start}' AND '${end}'`)
for (const r of all) {
  const d = new Date(r.segments?.date).getTime()
  const days = Math.abs(d-apr14)/86400000
  if (days > 30) continue
  const bucket = d < apr14 ? pre : post
  bucket.imp += Number(r.metrics?.impressions||0)
  bucket.sp += Number(r.metrics?.cost_micros||0)/1e6
  bucket.val += Number(r.metrics?.conversions_value||0)
  bucket.conv += Number(r.metrics?.conversions||0)
}
console.log(`\n=== Apr 14 IMPACT (±30 days) ===`)
console.log(`PRE  (Mar 15 → Apr 13): ${pre.imp} imp, $${pre.sp.toFixed(0)} sp, $${pre.val.toFixed(0)} val, ${pre.conv.toFixed(0)} conv, ${pre.sp?(pre.val/pre.sp).toFixed(2):'-'}x ROAS`)
console.log(`POST (Apr 14 → May 14): ${post.imp} imp, $${post.sp.toFixed(0)} sp, $${post.val.toFixed(0)} val, ${post.conv.toFixed(0)} conv, ${post.sp?(post.val/post.sp).toFixed(2):'-'}x ROAS`)
const impDelta = pre.imp ? ((post.imp-pre.imp)/pre.imp*100).toFixed(0) : '-'
const valDelta = pre.val ? ((post.val-pre.val)/pre.val*100).toFixed(0) : '-'
console.log(`Δ Impressions: ${impDelta}% | Δ Revenue: ${valDelta}%`)
process.exit(0)
