import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const c = getGadsCustomer()
const fmt = d => d.toISOString().slice(0,10)
const today = fmt(new Date())
const y1 = fmt(new Date(Date.now()-86400000))
const lastSameDay = fmt(new Date(Date.now()-7*86400000))

console.log(`\n=== TODAY'S PULSE — ${new Date().toISOString().slice(0,16)}Z ===\n`)
console.log(`Today: ${today} | Yesterday: ${y1} | Same DOW last week: ${lastSameDay}\n`)

const acct = async (date) => {
  const r = await c.query(`SELECT metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM customer WHERE segments.date='${date}'`)
  let i=0,cl=0,sp=0,co=0,v=0
  for (const x of r) { i+=Number(x.metrics?.impressions||0); cl+=Number(x.metrics?.clicks||0); sp+=Number(x.metrics?.cost_micros||0)/1e6; co+=Number(x.metrics?.conversions||0); v+=Number(x.metrics?.conversions_value||0) }
  return {i,cl,sp,co,v, roas:sp?v/sp:0, cvr:cl?co/cl*100:0, ctr:i?cl/i*100:0, cpc:cl?sp/cl:0, aov:co?v/co:0}
}

const t = await acct(today)
const y = await acct(y1)
const w = await acct(lastSameDay)

console.log('Window    | Imp    | Clk  | Spend | Conv | Revenue | CTR  | CVR  | ROAS  | CPC   | AOV ')
console.log('----------+--------+------+-------+------+---------+------+------+-------+-------+------')
const row = (l,x) => console.log(`${l.padEnd(9)} | ${String(x.i).padStart(6)} | ${String(x.cl).padStart(4)} | $${x.sp.toFixed(0).padStart(4)} | ${x.co.toFixed(0).padStart(4)} | $${x.v.toFixed(0).padStart(6)} | ${x.ctr.toFixed(2).padStart(4)}% | ${x.cvr.toFixed(2).padStart(4)}% | ${x.roas.toFixed(2).padStart(4)}x | $${x.cpc.toFixed(2).padStart(4)} | $${x.aov.toFixed(0).padStart(3)}`)
row('TODAY', t)
row('YESTERDAY', y)
row('Last DOW', w)

const pct = (n,o) => o ? ((n-o)/o*100).toFixed(0) : '-'
console.log(`\nDeltas:`)
console.log(`  Today vs Yesterday: Spend ${pct(t.sp,y.sp)}% | Clicks ${pct(t.cl,y.cl)}% | Conv ${pct(t.co,y.co)}% | Revenue ${pct(t.v,y.v)}% | ROAS ${pct(t.roas,y.roas)}%`)
console.log(`  Today vs last Wed:  Spend ${pct(t.sp,w.sp)}% | Clicks ${pct(t.cl,w.cl)}% | Conv ${pct(t.co,w.co)}% | Revenue ${pct(t.v,w.v)}% | ROAS ${pct(t.roas,w.roas)}%`)

// Hourly today
console.log(`\n--- HOURLY TODAY ---`)
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
console.log('Hour  | Imp  | Clk | Spend | Conv | Value | ROAS')
for (const [h,x] of [...byH.entries()].sort((a,b)=>a[0]-b[0])) {
  const roas=x.sp?(x.val/x.sp).toFixed(2):'-'
  console.log(`${String(h).padStart(2)}:00 | ${String(x.imp).padStart(4)} | ${String(x.clk).padStart(3)} | $${x.sp.toFixed(0).padStart(4)} | ${x.conv.toFixed(0).padStart(4)} | $${x.val.toFixed(0).padStart(4)} | ${roas}x`)
}

// Per-campaign today
console.log(`\n--- PER-CAMPAIGN TODAY ---`)
const camp = await c.query(`SELECT campaign.name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM campaign WHERE campaign.status='ENABLED' AND segments.date='${today}'`)
const m = new Map()
for (const r of camp) {
  const k = r.campaign?.name
  const cur = m.get(k)||{imp:0,clk:0,sp:0,conv:0,val:0}
  cur.imp+=Number(r.metrics?.impressions||0)
  cur.clk+=Number(r.metrics?.clicks||0)
  cur.sp+=Number(r.metrics?.cost_micros||0)/1e6
  cur.conv+=Number(r.metrics?.conversions||0)
  cur.val+=Number(r.metrics?.conversions_value||0)
  m.set(k,cur)
}
for (const [n,x] of [...m.entries()].sort((a,b)=>b[1].sp-a[1].sp)) {
  const cvr=x.clk?(x.conv/x.clk*100).toFixed(1):'-'
  const roas=x.sp?(x.val/x.sp).toFixed(2):'-'
  console.log(`  ${n.slice(0,38).padEnd(38)} | ${String(x.imp).padStart(5)}imp ${String(x.clk).padStart(3)}clk $${x.sp.toFixed(0).padStart(4)} | ${x.conv.toFixed(0)}c $${x.val.toFixed(0).padStart(4)} | ${cvr}%CVR ${roas}x`)
}
process.exit(0)
