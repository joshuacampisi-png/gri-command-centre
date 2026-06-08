/**
 * Re-run with correct dates: today is Thursday May 28
 * Last 48h (completed days) = May 26 Tue + May 27 Wed
 * Prior 48h = May 24 Sun + May 25 Mon
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const customer = getGadsCustomer()
const POST = ['2026-05-26','2026-05-27']  // Tue + Wed
const PRE  = ['2026-05-24','2026-05-25']  // Sun + Mon
const LAST_7 = ['2026-05-21','2026-05-22','2026-05-23','2026-05-24','2026-05-25','2026-05-26','2026-05-27']

const d = (a,b) => b===0 ? (a>0?'+∞':'—') : (((a-b)/b*100)>=0?'+':'')+((a-b)/b*100).toFixed(1)+'%'
const pct = n => n==null ? '—' : (n*100).toFixed(1)+'%'
const avg = a => a.length ? a.reduce((x,y)=>x+y,0)/a.length : null
const strCh = c => typeof c === 'string' ? c : (c?.name || String(c||''))

async function pull(start,end) {
  const rows = await customer.query(`
    SELECT segments.date, campaign.name, campaign.advertising_channel_type,
           metrics.cost_micros, metrics.clicks, metrics.impressions,
           metrics.conversions, metrics.conversions_value,
           metrics.all_conversions, metrics.all_conversions_value,
           metrics.search_impression_share, metrics.search_budget_lost_impression_share,
           metrics.search_rank_lost_impression_share
    FROM campaign
    WHERE segments.date BETWEEN '${start}' AND '${end}'
      AND campaign.status != 'REMOVED'
  `)
  const byCamp = new Map(), byDay = new Map()
  let tot = {spend:0,clicks:0,imp:0,conv:0,value:0,allConv:0,allValue:0}
  for (const r of rows) {
    const n = r.campaign?.name || '?'
    const date = r.segments?.date
    if (!byCamp.has(n)) byCamp.set(n,{spend:0,clicks:0,imp:0,conv:0,value:0,allConv:0,allValue:0,channel:strCh(r.campaign?.advertising_channel_type),isList:[],lbList:[],lrList:[]})
    const c = byCamp.get(n)
    const spend = Number(r.metrics?.cost_micros||0)/1e6
    const clicks = Number(r.metrics?.clicks||0)
    const imp = Number(r.metrics?.impressions||0)
    const conv = Number(r.metrics?.conversions||0)
    const value = Number(r.metrics?.conversions_value||0)
    const allConv = Number(r.metrics?.all_conversions||0)
    const allValue = Number(r.metrics?.all_conversions_value||0)
    c.spend+=spend;c.clicks+=clicks;c.imp+=imp;c.conv+=conv;c.value+=value;c.allConv+=allConv;c.allValue+=allValue
    if (r.metrics?.search_impression_share!=null) c.isList.push(Number(r.metrics.search_impression_share))
    if (r.metrics?.search_budget_lost_impression_share!=null) c.lbList.push(Number(r.metrics.search_budget_lost_impression_share))
    if (r.metrics?.search_rank_lost_impression_share!=null) c.lrList.push(Number(r.metrics.search_rank_lost_impression_share))
    tot.spend+=spend;tot.clicks+=clicks;tot.imp+=imp;tot.conv+=conv;tot.value+=value;tot.allConv+=allConv;tot.allValue+=allValue
    if (!byDay.has(date)) byDay.set(date,{spend:0,clicks:0,imp:0,conv:0,value:0})
    const dd = byDay.get(date)
    dd.spend+=spend;dd.clicks+=clicks;dd.imp+=imp;dd.conv+=conv;dd.value+=value
  }
  return { byCamp, byDay, tot }
}

console.log(`\n=== CORRECT 48h DIAG — Today Thu 28 May ===`)
console.log(`Last 48h:  ${POST.join(', ')}  (Tue + Wed)`)
console.log(`Prior 48h: ${PRE.join(', ')}  (Sun + Mon)\n`)

const [post, pre] = await Promise.all([pull(POST[0],POST[1]), pull(PRE[0],PRE[1])])
const t1=post.tot, t0=pre.tot
const cpc1 = t1.clicks>0 ? t1.spend/t1.clicks : 0, cpc0 = t0.clicks>0 ? t0.spend/t0.clicks : 0
const ctr1 = t1.imp>0 ? t1.clicks/t1.imp : 0, ctr0 = t0.imp>0 ? t0.clicks/t0.imp : 0
const cvr1 = t1.clicks>0 ? t1.conv/t1.clicks : 0, cvr0 = t0.clicks>0 ? t0.conv/t0.clicks : 0
const cpa1 = t1.conv>0 ? t1.spend/t1.conv : 0, cpa0 = t0.conv>0 ? t0.spend/t0.conv : 0
const roas1 = t1.spend>0 ? t1.value/t1.spend : 0, roas0 = t0.spend>0 ? t0.value/t0.spend : 0
const aov1 = t1.conv>0 ? t1.value/t1.conv : 0, aov0 = t0.conv>0 ? t0.value/t0.conv : 0
const aMer1 = t1.spend>0 ? t1.allValue/t1.spend : 0, aMer0 = t0.spend>0 ? t0.allValue/t0.spend : 0

console.log('---- ACCOUNT TOTALS ----')
console.log('Metric        | Last 48h  | Prior 48h | Δ')
console.log('--------------+-----------+-----------+--------')
const rows = [
  ['Spend',       `$${t1.spend.toFixed(0)}`,         `$${t0.spend.toFixed(0)}`,         d(t1.spend,t0.spend)],
  ['Impressions', t1.imp.toLocaleString(),           t0.imp.toLocaleString(),           d(t1.imp,t0.imp)],
  ['Clicks',      t1.clicks.toLocaleString(),        t0.clicks.toLocaleString(),        d(t1.clicks,t0.clicks)],
  ['CTR',         (ctr1*100).toFixed(2)+'%',         (ctr0*100).toFixed(2)+'%',         d(ctr1,ctr0)],
  ['CPC',         `$${cpc1.toFixed(2)}`,             `$${cpc0.toFixed(2)}`,             d(cpc1,cpc0)],
  ['Conv',        t1.conv.toFixed(1),                t0.conv.toFixed(1),                d(t1.conv,t0.conv)],
  ['CVR',         (cvr1*100).toFixed(2)+'%',         (cvr0*100).toFixed(2)+'%',         d(cvr1,cvr0)],
  ['CPA',         `$${cpa1.toFixed(2)}`,             `$${cpa0.toFixed(2)}`,             d(cpa1,cpa0)],
  ['Revenue',     `$${t1.value.toFixed(0)}`,         `$${t0.value.toFixed(0)}`,         d(t1.value,t0.value)],
  ['AOV',         `$${aov1.toFixed(0)}`,             `$${aov0.toFixed(0)}`,             d(aov1,aov0)],
  ['ROAS',        roas1.toFixed(2)+'x',              roas0.toFixed(2)+'x',              d(roas1,roas0)],
  ['All-Conv $',  `$${t1.allValue.toFixed(0)}`,      `$${t0.allValue.toFixed(0)}`,      d(t1.allValue,t0.allValue)],
  ['aMER',        aMer1.toFixed(2)+'x',              aMer0.toFixed(2)+'x',              d(aMer1,aMer0)]
]
for (const r of rows) console.log(`${r[0].padEnd(13)} | ${r[1].padEnd(9)} | ${r[2].padEnd(9)} | ${r[3]}`)

// 7-day daily trend
console.log(`\n---- 7-DAY DAILY TREND (with correct labels) ----`)
const dailyRows = await customer.query(`
  SELECT segments.date, metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions, metrics.conversions_value
  FROM campaign
  WHERE segments.date BETWEEN '${LAST_7[0]}' AND '${LAST_7[LAST_7.length-1]}'
`)
const byDay = new Map()
for (const r of dailyRows) {
  const date = r.segments?.date
  if (!byDay.has(date)) byDay.set(date,{spend:0,clicks:0,imp:0,conv:0,value:0})
  const x = byDay.get(date)
  x.spend += Number(r.metrics?.cost_micros||0)/1e6
  x.clicks += Number(r.metrics?.clicks||0)
  x.imp += Number(r.metrics?.impressions||0)
  x.conv += Number(r.metrics?.conversions||0)
  x.value += Number(r.metrics?.conversions_value||0)
}
const dayName = ds => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(ds).getUTCDay()]
console.log('Date       | Day | Imp    | Clk  | CTR   | Spend  | Conv | Rev    | ROAS')
console.log('-'.repeat(85))
for (const [date, x] of [...byDay.entries()].sort()) {
  const ctr = x.imp>0 ? (x.clicks/x.imp*100).toFixed(2)+'%' : '—'
  const roas = x.spend>0 ? (x.value/x.spend).toFixed(2)+'x' : '—'
  console.log(`${date} | ${dayName(date)} | ${String(x.imp).padStart(6)} | ${String(x.clicks).padStart(4)} | ${ctr.padStart(5)} | $${x.spend.toFixed(0).padStart(5)} | ${x.conv.toFixed(1).padStart(4)} | $${x.value.toFixed(0).padStart(5)} | ${roas.padStart(5)}`)
}

// Per-campaign
console.log(`\n---- PER-CAMPAIGN 48h vs PRIOR ----`)
console.log('Campaign                            | Imp Last→Prior      | Clk Last→Prior      | Spend Last→Prior      | IS now→prior')
console.log('-'.repeat(135))
const all = new Set([...post.byCamp.keys(), ...pre.byCamp.keys()])
const sorted = [...all].sort((a,b)=>(post.byCamp.get(b)?.spend||0)-(post.byCamp.get(a)?.spend||0))
for (const n of sorted) {
  const c1 = post.byCamp.get(n) || {spend:0,imp:0,clicks:0,conv:0,value:0,isList:[]}
  const c0 = pre.byCamp.get(n) || {spend:0,imp:0,clicks:0,conv:0,value:0,isList:[]}
  if (c1.spend===0 && c0.spend===0) continue
  const is1 = avg(c1.isList||[]), is0 = avg(c0.isList||[])
  console.log(`${n.slice(0,36).padEnd(36)} | ${String(c1.imp).padStart(5)}→${String(c0.imp).padStart(5)} ${d(c1.imp,c0.imp).padStart(8)} | ${String(c1.clicks).padStart(3)}→${String(c0.clicks).padStart(3)} ${d(c1.clicks,c0.clicks).padStart(8)} | $${c1.spend.toFixed(0).padStart(4)}→$${c0.spend.toFixed(0).padStart(4)} ${d(c1.spend,c0.spend).padStart(8)} | ${pct(is0).padStart(6)}→${pct(is1).padStart(6)}`)
}
process.exit(0)
