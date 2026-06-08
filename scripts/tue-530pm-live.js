import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const c = getGadsCustomer()
const today = new Date().toISOString().slice(0,10)
const yesterday = new Date(Date.now()-86400000).toISOString().slice(0,10)
const lastTue = new Date(Date.now()-7*86400000).toISOString().slice(0,10)

console.log(`\n=== LIVE PULSE — ${new Date().toISOString().slice(0,16)}Z (Tue 5:30pm AEST) ===\n`)

// Hourly account today
const hour = await c.query(`SELECT segments.hour, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM customer WHERE segments.date='${today}' ORDER BY segments.hour`)
const byH = new Map()
for (const r of hour) {
  const h = r.segments?.hour
  if (h==null) continue
  const cur = byH.get(h) || { imp:0,clk:0,sp:0,conv:0,val:0 }
  cur.imp+=Number(r.metrics?.impressions||0)
  cur.clk+=Number(r.metrics?.clicks||0)
  cur.sp+=Number(r.metrics?.cost_micros||0)/1e6
  cur.conv+=Number(r.metrics?.conversions||0)
  cur.val+=Number(r.metrics?.conversions_value||0)
  byH.set(h,cur)
}
console.log('Hour  | Imp  | Clk | Spend | Conv | Value | ROAS')
let tSp=0,tConv=0,tVal=0,tClk=0,tImp=0
for (const [h,x] of [...byH.entries()].sort((a,b)=>a[0]-b[0])) {
  tSp+=x.sp; tConv+=x.conv; tVal+=x.val; tClk+=x.clk; tImp+=x.imp
  const roas = x.sp?(x.val/x.sp).toFixed(2):'-'
  console.log(`${String(h).padStart(2)}:00 | ${String(x.imp).padStart(4)} | ${String(x.clk).padStart(3)} | $${x.sp.toFixed(0).padStart(4)} | ${x.conv.toFixed(0).padStart(4)} | $${x.val.toFixed(0).padStart(4)} | ${roas}x`)
}
console.log(`---- TOTAL: $${tSp.toFixed(0)} | ${tClk}clk | ${tConv.toFixed(0)}c | $${tVal.toFixed(0)} val | ROAS ${tSp?(tVal/tSp).toFixed(2):'-'}x ----`)

// Same-window last Tue and yesterday Mon (full day comparison)
const sameWindow = async (date) => {
  const rows = await c.query(`SELECT metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM customer WHERE segments.date='${date}'`)
  let i=0,c2=0,s=0,cv=0,v=0
  for (const r of rows) { i+=Number(r.metrics?.impressions||0); c2+=Number(r.metrics?.clicks||0); s+=Number(r.metrics?.cost_micros||0)/1e6; cv+=Number(r.metrics?.conversions||0); v+=Number(r.metrics?.conversions_value||0) }
  return { imp:i, clk:c2, sp:s, conv:cv, val:v, roas:s?v/s:0, cvr:c2?cv/c2*100:0 }
}
const y = await sameWindow(yesterday)
const lt = await sameWindow(lastTue)
console.log(`\n=== SAME-WEEKDAY COMPARE (full days) ===`)
console.log(`Yesterday (Mon full):  $${y.sp.toFixed(0)} | ${y.clk}clk | ${y.conv.toFixed(0)}c | $${y.val.toFixed(0)} | ${y.roas.toFixed(2)}x | ${y.cvr.toFixed(1)}%CVR`)
console.log(`Last Tue (7d ago):     $${lt.sp.toFixed(0)} | ${lt.clk}clk | ${lt.conv.toFixed(0)}c | $${lt.val.toFixed(0)} | ${lt.roas.toFixed(2)}x | ${lt.cvr.toFixed(1)}%CVR`)
console.log(`TODAY so far (17.5h):  $${tSp.toFixed(0)} | ${tClk}clk | ${tConv.toFixed(0)}c | $${tVal.toFixed(0)} | ${tSp?(tVal/tSp).toFixed(2):'-'}x | ${tClk?(tConv/tClk*100).toFixed(1):'-'}%CVR`)

// Per campaign today
console.log(`\n=== PER-CAMPAIGN TODAY ===`)
const camps = await c.query(`SELECT campaign.name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM campaign WHERE campaign.status='ENABLED' AND segments.date='${today}'`)
const m = new Map()
for (const r of camps) {
  const k = r.campaign?.name
  const cur = m.get(k) || { imp:0,clk:0,sp:0,conv:0,val:0 }
  cur.imp+=Number(r.metrics?.impressions||0)
  cur.clk+=Number(r.metrics?.clicks||0)
  cur.sp+=Number(r.metrics?.cost_micros||0)/1e6
  cur.conv+=Number(r.metrics?.conversions||0)
  cur.val+=Number(r.metrics?.conversions_value||0)
  m.set(k,cur)
}
for (const [n,x] of [...m.entries()].sort((a,b)=>b[1].sp-a[1].sp)) {
  const cvr = x.clk?(x.conv/x.clk*100).toFixed(1):'-'
  const roas = x.sp?(x.val/x.sp).toFixed(2):'-'
  console.log(`  ${n.padEnd(38)} | ${String(x.imp).padStart(5)}imp ${String(x.clk).padStart(3)}clk $${x.sp.toFixed(0).padStart(4)} | ${x.conv.toFixed(0)}c $${x.val.toFixed(0).padStart(4)} | ${cvr}%CVR ${roas}x`)
}

// Top landing pages today
console.log(`\n=== TOP LANDING PAGES TODAY ===`)
const lp = await c.query(`SELECT landing_page_view.unexpanded_final_url, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM landing_page_view WHERE segments.date='${today}' AND metrics.clicks>0 ORDER BY metrics.cost_micros DESC LIMIT 15`)
for (const r of lp) {
  const clk=Number(r.metrics?.clicks||0), sp=Number(r.metrics?.cost_micros||0)/1e6, conv=Number(r.metrics?.conversions||0), val=Number(r.metrics?.conversions_value||0)
  const cvr=clk?(conv/clk*100).toFixed(1):'-', roas=sp?(val/sp).toFixed(2):'-'
  console.log(`  ${String(clk).padStart(3)}clk ${String(cvr).padStart(5)}% ${String(roas).padStart(5)}x $${sp.toFixed(0).padStart(3)} | ${(r.landing_page_view?.unexpanded_final_url||'').replace('https://genderrevealideas.com.au','').slice(0,75)}`)
}
process.exit(0)
