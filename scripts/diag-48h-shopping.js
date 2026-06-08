/**
 * 48-hour Google Ads + Shopping diagnostic
 *  1. Account-wide metrics last 48h vs prior 48h
 *  2. Per-campaign Shopping impression share + lost IS reasons
 *  3. PMAX shopping-specific drill
 *  4. Daily trend (last 7 days) to spot when the dip started
 *  5. Search term + product disapproval check
 *  6. Recent change_event log (any edits in last 14 days)
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const customer = getGadsCustomer()

// Dates: today is May 27 2026. Last 48h = May 25 + May 26. Prior 48h = May 23 + May 24.
const POST = ['2026-05-25','2026-05-26']
const PRE  = ['2026-05-23','2026-05-24']
const LAST_7 = ['2026-05-20','2026-05-21','2026-05-22','2026-05-23','2026-05-24','2026-05-25','2026-05-26']

const d = (a,b) => b===0 ? (a>0?'+∞':'—') : (((a-b)/b*100)>=0?'+':'')+((a-b)/b*100).toFixed(1)+'%'
const pct = n => n==null ? '—' : (n*100).toFixed(1)+'%'

async function pullCampaign(dates) {
  const start = dates[0], end = dates[dates.length-1]
  const rows = await customer.query(`
    SELECT segments.date, campaign.name, campaign.advertising_channel_type,
           metrics.cost_micros, metrics.clicks, metrics.impressions,
           metrics.conversions, metrics.conversions_value,
           metrics.all_conversions, metrics.all_conversions_value,
           metrics.search_impression_share, metrics.search_budget_lost_impression_share,
           metrics.search_rank_lost_impression_share, metrics.search_top_impression_share,
           metrics.search_absolute_top_impression_share
    FROM campaign
    WHERE segments.date BETWEEN '${start}' AND '${end}'
      AND campaign.status != 'REMOVED'
  `)
  const byCamp = new Map()
  const byDate = new Map()
  let tot = { spend:0,clicks:0,imp:0,conv:0,value:0,allConv:0,allValue:0 }
  for (const r of rows) {
    const n = r.campaign?.name || '?'
    const date = r.segments?.date
    if (!byCamp.has(n)) byCamp.set(n,{spend:0,clicks:0,imp:0,conv:0,value:0,allConv:0,allValue:0,channel:r.campaign?.advertising_channel_type,isList:[],lbList:[],lrList:[],topList:[],absTopList:[]})
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
    if (r.metrics?.search_top_impression_share!=null) c.topList.push(Number(r.metrics.search_top_impression_share))
    if (r.metrics?.search_absolute_top_impression_share!=null) c.absTopList.push(Number(r.metrics.search_absolute_top_impression_share))
    tot.spend+=spend;tot.clicks+=clicks;tot.imp+=imp;tot.conv+=conv;tot.value+=value;tot.allConv+=allConv;tot.allValue+=allValue
    if (!byDate.has(date)) byDate.set(date,{spend:0,clicks:0,imp:0,conv:0,value:0,allConv:0,allValue:0})
    const dd = byDate.get(date)
    dd.spend+=spend;dd.clicks+=clicks;dd.imp+=imp;dd.conv+=conv;dd.value+=value;dd.allConv+=allConv;dd.allValue+=allValue
  }
  return { byCamp, byDate, tot }
}

const avg = arr => arr.length ? arr.reduce((x,y)=>x+y,0)/arr.length : null

console.log(`\n=== 48-HOUR DIAGNOSTIC: POST (${POST.join(',')}) vs PRIOR (${PRE.join(',')}) ===\n`)
const [post, pre] = await Promise.all([pullCampaign(POST), pullCampaign(PRE)])
const t1=post.tot, t0=pre.tot

console.log('---- ACCOUNT TOTALS (48h vs prior 48h) ----')
console.log('Metric           | Last 48h        | Prior 48h       | Δ')
console.log('-----------------+------------------+------------------+--------')
const cpc1 = t1.clicks>0 ? t1.spend/t1.clicks : 0
const cpc0 = t0.clicks>0 ? t0.spend/t0.clicks : 0
const ctr1 = t1.imp>0 ? t1.clicks/t1.imp : 0
const ctr0 = t0.imp>0 ? t0.clicks/t0.imp : 0
const cvr1 = t1.clicks>0 ? t1.conv/t1.clicks : 0
const cvr0 = t0.clicks>0 ? t0.conv/t0.clicks : 0
const cpa1 = t1.conv>0 ? t1.spend/t1.conv : 0
const cpa0 = t0.conv>0 ? t0.spend/t0.conv : 0
const roas1 = t1.spend>0 ? t1.value/t1.spend : 0
const roas0 = t0.spend>0 ? t0.value/t0.spend : 0
const aov1 = t1.conv>0 ? t1.value/t1.conv : 0
const aov0 = t0.conv>0 ? t0.value/t0.conv : 0
const aMer1 = t1.spend>0 ? t1.allValue/t1.spend : 0
const aMer0 = t0.spend>0 ? t0.allValue/t0.spend : 0

const rows = [
  ['Spend',         `$${t1.spend.toFixed(0)}`,           `$${t0.spend.toFixed(0)}`,           d(t1.spend,t0.spend)],
  ['Impressions',   t1.imp.toLocaleString(),             t0.imp.toLocaleString(),             d(t1.imp,t0.imp)],
  ['Clicks',        t1.clicks.toLocaleString(),          t0.clicks.toLocaleString(),          d(t1.clicks,t0.clicks)],
  ['CTR',           (ctr1*100).toFixed(2)+'%',           (ctr0*100).toFixed(2)+'%',           d(ctr1,ctr0)],
  ['CPC',           `$${cpc1.toFixed(2)}`,               `$${cpc0.toFixed(2)}`,               d(cpc1,cpc0)],
  ['Conversions',   t1.conv.toFixed(1),                  t0.conv.toFixed(1),                  d(t1.conv,t0.conv)],
  ['CVR',           (cvr1*100).toFixed(2)+'%',           (cvr0*100).toFixed(2)+'%',           d(cvr1,cvr0)],
  ['CPA',           `$${cpa1.toFixed(2)}`,               `$${cpa0.toFixed(2)}`,               d(cpa1,cpa0)],
  ['Revenue',       `$${t1.value.toFixed(0)}`,           `$${t0.value.toFixed(0)}`,           d(t1.value,t0.value)],
  ['AOV',           `$${aov1.toFixed(0)}`,               `$${aov0.toFixed(0)}`,               d(aov1,aov0)],
  ['ROAS',          roas1.toFixed(2)+'x',                roas0.toFixed(2)+'x',                d(roas1,roas0)],
  ['All-Conv $',    `$${t1.allValue.toFixed(0)}`,        `$${t0.allValue.toFixed(0)}`,        d(t1.allValue,t0.allValue)],
  ['aMER',          aMer1.toFixed(2)+'x',                aMer0.toFixed(2)+'x',                d(aMer1,aMer0)]
]
for (const r of rows) console.log(`${r[0].padEnd(16)} | ${r[1].padEnd(17)} | ${r[2].padEnd(17)} | ${r[3]}`)

// ---- 7-day daily trend ----
console.log(`\n---- 7-DAY DAILY TREND (find when the dip started) ----`)
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
console.log('Date       | Day | Imp   | Clk  | CTR   | Spend  | Conv | Rev    | ROAS')
console.log('-'.repeat(85))
for (const [date, x] of [...byDay.entries()].sort()) {
  const ctr = x.imp>0 ? (x.clicks/x.imp*100).toFixed(2)+'%' : '—'
  const roas = x.spend>0 ? (x.value/x.spend).toFixed(2)+'x' : '—'
  console.log(`${date} | ${dayName(date)} | ${String(x.imp).padStart(5)} | ${String(x.clicks).padStart(4)} | ${ctr.padStart(5)} | $${x.spend.toFixed(0).padStart(5)} | ${x.conv.toFixed(1).padStart(4)} | $${x.value.toFixed(0).padStart(5)} | ${roas.padStart(5)}`)
}

// ---- PER-CAMPAIGN (focus on Shopping/PMAX) ----
console.log(`\n---- PER-CAMPAIGN 48h vs 48h (sorted by spend) ----`)
const allNames = new Set([...post.byCamp.keys(), ...pre.byCamp.keys()])
const sorted = [...allNames].sort((a,b)=>(post.byCamp.get(b)?.spend||0)-(post.byCamp.get(a)?.spend||0))
console.log('Campaign                          | Channel  | Spend          | Imp          | Clk         | Conv        | ROAS')
console.log('-'.repeat(125))
for (const n of sorted) {
  const c1 = post.byCamp.get(n) || {spend:0,imp:0,clicks:0,conv:0,value:0,channel:'?'}
  const c0 = pre.byCamp.get(n)  || {spend:0,imp:0,clicks:0,conv:0,value:0}
  if (c1.spend===0 && c0.spend===0) continue
  const r1 = c1.spend>0 ? (c1.value/c1.spend).toFixed(2)+'x' : '—'
  const r0 = c0.spend>0 ? (c0.value/c0.spend).toFixed(2)+'x' : '—'
  console.log(`${n.slice(0,33).padEnd(33)} | ${(c1.channel||'').slice(0,8).padEnd(8)} | $${c1.spend.toFixed(0).padStart(4)}→$${c0.spend.toFixed(0).padStart(4)} ${d(c1.spend,c0.spend).padStart(7)} | ${String(c1.imp).padStart(4)}→${String(c0.imp).padStart(4)} ${d(c1.imp,c0.imp).padStart(7)} | ${String(c1.clicks).padStart(3)}→${String(c0.clicks).padStart(3)} ${d(c1.clicks,c0.clicks).padStart(7)} | ${c1.conv.toFixed(1).padStart(3)}→${c0.conv.toFixed(1).padStart(3)} ${d(c1.conv,c0.conv).padStart(7)} | ${r1}→${r0}`)
}

// ---- IMPRESSION SHARE (PMAX + Search) ----
console.log(`\n---- IMPRESSION SHARE LAST 48h (where data returned) ----`)
for (const [n, c] of post.byCamp.entries()) {
  if (c.spend === 0) continue
  const is = avg(c.isList)
  const lb = avg(c.lbList)
  const lr = avg(c.lrList)
  const top = avg(c.topList)
  const absTop = avg(c.absTopList)
  if (is==null && lb==null && lr==null) continue
  console.log(`  ${n.slice(0,35).padEnd(35)} | IS ${pct(is).padStart(6)} | Lost-Budget ${pct(lb).padStart(6)} | Lost-Rank ${pct(lr).padStart(6)} | Top ${pct(top).padStart(6)} | AbsTop ${pct(absTop).padStart(6)}`)
}

// ---- COMPARE IS to PRIOR 48h ----
console.log(`\n---- IMPRESSION SHARE CHANGE: Last 48h vs Prior 48h ----`)
for (const [n, c1] of post.byCamp.entries()) {
  const c0 = pre.byCamp.get(n)
  if (!c0) continue
  const is1 = avg(c1.isList), is0 = avg(c0.isList)
  const lr1 = avg(c1.lrList), lr0 = avg(c0.lrList)
  const lb1 = avg(c1.lbList), lb0 = avg(c0.lbList)
  if (is1==null && is0==null) continue
  const flag = is1!=null && is0!=null && (is0-is1) > 0.05 ? '⚠ DROPPED' : ''
  console.log(`  ${n.slice(0,35).padEnd(35)} | IS ${pct(is0).padStart(6)}→${pct(is1).padStart(6)} | LostRank ${pct(lr0).padStart(6)}→${pct(lr1).padStart(6)} | LostBudget ${pct(lb0).padStart(6)}→${pct(lb1).padStart(6)} ${flag}`)
}

// ---- CHANGE HISTORY (last 14 days) ----
console.log(`\n---- ACCOUNT CHANGE HISTORY (last 14 days) ----`)
try {
  const changes = await customer.query(`
    SELECT change_event.change_date_time, change_event.user_email, change_event.client_type,
           change_event.change_resource_type, change_event.resource_change_operation,
           campaign.name
    FROM change_event
    WHERE change_event.change_date_time DURING LAST_14_DAYS
    ORDER BY change_event.change_date_time DESC
    LIMIT 50
  `)
  if (!changes.length) console.log('  No change events.')
  for (const c of changes.slice(0,30)) {
    const dt = c.change_event?.change_date_time?.slice(0,16) || '?'
    const op = c.change_event?.resource_change_operation || '?'
    const res = c.change_event?.change_resource_type || '?'
    const who = c.change_event?.user_email || '?'
    const camp = c.campaign?.name || '-'
    console.log(`  ${dt} | ${op.padEnd(7)} ${res.padEnd(28)} | by ${who.slice(0,32).padEnd(32)} | ${camp.slice(0,28)}`)
  }
} catch(e) { console.log('  err:', e.errors?.[0]?.message || e.message) }

// ---- MERCHANT CENTER FEED HEALTH ----
console.log(`\n---- MERCHANT CENTER PRODUCT STATUS (live products serving) ----`)
try {
  const prodRows = await customer.query(`
    SELECT segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
    FROM shopping_performance_view
    WHERE segments.date BETWEEN '${POST[0]}' AND '${POST[1]}'
  `)
  let totImp=0, totClk=0, totSpend=0
  for (const r of prodRows) {
    totImp += Number(r.metrics?.impressions||0)
    totClk += Number(r.metrics?.clicks||0)
    totSpend += Number(r.metrics?.cost_micros||0)/1e6
  }
  // Compare to prior
  const prodRows0 = await customer.query(`
    SELECT segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
    FROM shopping_performance_view
    WHERE segments.date BETWEEN '${PRE[0]}' AND '${PRE[1]}'
  `)
  let totImp0=0, totClk0=0, totSpend0=0
  for (const r of prodRows0) {
    totImp0 += Number(r.metrics?.impressions||0)
    totClk0 += Number(r.metrics?.clicks||0)
    totSpend0 += Number(r.metrics?.cost_micros||0)/1e6
  }
  console.log(`  Shopping impressions: ${totImp.toLocaleString()} (vs prior ${totImp0.toLocaleString()} = ${d(totImp,totImp0)})`)
  console.log(`  Shopping clicks:      ${totClk.toLocaleString()} (vs prior ${totClk0.toLocaleString()} = ${d(totClk,totClk0)})`)
  console.log(`  Shopping spend:       $${totSpend.toFixed(0)} (vs prior $${totSpend0.toFixed(0)} = ${d(totSpend,totSpend0)})`)
} catch(e) { console.log('  shopping_performance_view err:', e.errors?.[0]?.message || e.message) }

process.exit(0)
