/**
 * 7-day account health vs prior 7 days
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'

const customer = getGadsCustomer()

const POST = { start:'2026-05-16', end:'2026-05-22', label:'Last 7d' }
const PRE  = { start:'2026-05-09', end:'2026-05-15', label:'Prior 7d' }

async function pull(start, end) {
  const rows = await customer.query(`
    SELECT campaign.name, campaign.advertising_channel_type, campaign.status,
           metrics.cost_micros, metrics.clicks, metrics.impressions,
           metrics.conversions, metrics.conversions_value,
           metrics.all_conversions, metrics.all_conversions_value,
           metrics.search_impression_share, metrics.search_budget_lost_impression_share,
           metrics.search_rank_lost_impression_share
    FROM campaign
    WHERE segments.date BETWEEN '${start}' AND '${end}'
      AND campaign.status != 'REMOVED'
  `)
  const byCamp = new Map()
  const tot = { spend:0, clicks:0, imp:0, conv:0, value:0, allConv:0, allValue:0 }
  for (const r of rows) {
    const name = r.campaign?.name || '?'
    if (!byCamp.has(name)) byCamp.set(name, { spend:0, clicks:0, imp:0, conv:0, value:0, allConv:0, allValue:0,
      isList:[], lbList:[], lrList:[], channel:r.campaign?.advertising_channel_type, status:r.campaign?.status })
    const c = byCamp.get(name)
    const spend = Number(r.metrics?.cost_micros||0)/1e6
    const clicks = Number(r.metrics?.clicks||0)
    const imp = Number(r.metrics?.impressions||0)
    const conv = Number(r.metrics?.conversions||0)
    const value = Number(r.metrics?.conversions_value||0)
    const allConv = Number(r.metrics?.all_conversions||0)
    const allValue = Number(r.metrics?.all_conversions_value||0)
    c.spend += spend; c.clicks += clicks; c.imp += imp; c.conv += conv; c.value += value
    c.allConv += allConv; c.allValue += allValue
    if (r.metrics?.search_impression_share != null) c.isList.push(Number(r.metrics.search_impression_share))
    if (r.metrics?.search_budget_lost_impression_share != null) c.lbList.push(Number(r.metrics.search_budget_lost_impression_share))
    if (r.metrics?.search_rank_lost_impression_share != null) c.lrList.push(Number(r.metrics.search_rank_lost_impression_share))
    tot.spend += spend; tot.clicks += clicks; tot.imp += imp; tot.conv += conv; tot.value += value
    tot.allConv += allConv; tot.allValue += allValue
  }
  return { byCamp, tot }
}

const avg = a => a.length ? a.reduce((x,y)=>x+y,0)/a.length : null
const pct = n => n==null ? '—' : (n*100).toFixed(1)+'%'
const d = (a,b) => b===0 ? (a>0?'+∞':'—') : (((a-b)/b*100)>=0?'+':'')+((a-b)/b*100).toFixed(1)+'%'

console.log(`\n=== 7-DAY ACCOUNT HEALTH ===`)
console.log(`${POST.label}:  ${POST.start} → ${POST.end}`)
console.log(`${PRE.label}: ${PRE.start} → ${PRE.end}\n`)

const [post, pre] = await Promise.all([pull(POST.start, POST.end), pull(PRE.start, PRE.end)])
const t1 = post.tot, t0 = pre.tot

const roas1 = t1.spend>0 ? t1.value/t1.spend : 0
const roas0 = t0.spend>0 ? t0.value/t0.spend : 0
const aMer1 = t1.spend>0 ? t1.allValue/t1.spend : 0
const aMer0 = t0.spend>0 ? t0.allValue/t0.spend : 0
const cpc1 = t1.clicks>0 ? t1.spend/t1.clicks : 0
const cpc0 = t0.clicks>0 ? t0.spend/t0.clicks : 0
const ctr1 = t1.imp>0 ? t1.clicks/t1.imp : 0
const ctr0 = t0.imp>0 ? t0.clicks/t0.imp : 0
const cvr1 = t1.clicks>0 ? t1.conv/t1.clicks : 0
const cvr0 = t0.clicks>0 ? t0.conv/t0.clicks : 0
const cpa1 = t1.conv>0 ? t1.spend/t1.conv : 0
const cpa0 = t0.conv>0 ? t0.spend/t0.conv : 0
const aov1 = t1.conv>0 ? t1.value/t1.conv : 0
const aov0 = t0.conv>0 ? t0.value/t0.conv : 0

console.log(`---- HEADLINE METRICS ----`)
console.log('Metric              | Last 7d        | Prior 7d       | Δ        | Health')
console.log('--------------------+----------------+----------------+----------+--------')
const trafficLight = (delta, isGoodWhenUp=true) => {
  if (delta == null || delta === 0) return '⚪'
  const positive = isGoodWhenUp ? delta > 0 : delta < 0
  return positive ? '🟢' : '🔴'
}
const rows2 = [
  ['Spend',         `$${t1.spend.toFixed(0)}`, `$${t0.spend.toFixed(0)}`, d(t1.spend,t0.spend), '⚪'],
  ['Impressions',   t1.imp.toLocaleString(), t0.imp.toLocaleString(), d(t1.imp,t0.imp), trafficLight(t1.imp-t0.imp,true)],
  ['Clicks',        t1.clicks.toLocaleString(), t0.clicks.toLocaleString(), d(t1.clicks,t0.clicks), trafficLight(t1.clicks-t0.clicks,true)],
  ['CTR',           (ctr1*100).toFixed(2)+'%', (ctr0*100).toFixed(2)+'%', d(ctr1,ctr0), trafficLight(ctr1-ctr0,true)],
  ['CPC',           `$${cpc1.toFixed(2)}`, `$${cpc0.toFixed(2)}`, d(cpc1,cpc0), trafficLight(cpc1-cpc0,false)],
  ['Conversions',   t1.conv.toFixed(1), t0.conv.toFixed(1), d(t1.conv,t0.conv), trafficLight(t1.conv-t0.conv,true)],
  ['CVR',           (cvr1*100).toFixed(2)+'%', (cvr0*100).toFixed(2)+'%', d(cvr1,cvr0), trafficLight(cvr1-cvr0,true)],
  ['CPA',           `$${cpa1.toFixed(2)}`, `$${cpa0.toFixed(2)}`, d(cpa1,cpa0), trafficLight(cpa1-cpa0,false)],
  ['Revenue (GA4)', `$${t1.value.toFixed(0)}`, `$${t0.value.toFixed(0)}`, d(t1.value,t0.value), trafficLight(t1.value-t0.value,true)],
  ['AOV',           `$${aov1.toFixed(0)}`, `$${aov0.toFixed(0)}`, d(aov1,aov0), trafficLight(aov1-aov0,true)],
  ['ROAS',          roas1.toFixed(2)+'x', roas0.toFixed(2)+'x', d(roas1,roas0), trafficLight(roas1-roas0,true)],
  ['All-Conv value',`$${t1.allValue.toFixed(0)}`, `$${t0.allValue.toFixed(0)}`, d(t1.allValue,t0.allValue), trafficLight(t1.allValue-t0.allValue,true)],
  ['aMER',          aMer1.toFixed(2)+'x', aMer0.toFixed(2)+'x', d(aMer1,aMer0), trafficLight(aMer1-aMer0,true)],
]
for (const r of rows2) console.log(`${r[0].padEnd(19)} | ${r[1].padEnd(14)} | ${r[2].padEnd(14)} | ${r[3].padStart(7)} | ${r[4]}`)

// Daily trend
console.log(`\n---- DAILY TREND (last 7d) ----`)
const daily = await customer.query(`
  SELECT segments.date, metrics.cost_micros, metrics.clicks, metrics.conversions, metrics.conversions_value
  FROM campaign
  WHERE segments.date BETWEEN '${POST.start}' AND '${POST.end}'
`)
const byDate = new Map()
for (const r of daily) {
  const date = r.segments?.date
  if (!byDate.has(date)) byDate.set(date, { spend:0, clicks:0, conv:0, value:0 })
  const x = byDate.get(date)
  x.spend += Number(r.metrics?.cost_micros||0)/1e6
  x.clicks += Number(r.metrics?.clicks||0)
  x.conv += Number(r.metrics?.conversions||0)
  x.value += Number(r.metrics?.conversions_value||0)
}
console.log('Date       | Day | Spend  | Clk | Conv | Rev    | ROAS  | CPA')
console.log('-'.repeat(70))
const dayName = ds => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(ds).getUTCDay()]
for (const [date, x] of [...byDate.entries()].sort()) {
  const roas = x.spend>0 ? (x.value/x.spend).toFixed(2)+'x' : '—'
  const cpa = x.conv>0 ? '$'+(x.spend/x.conv).toFixed(0) : '—'
  console.log(`${date} | ${dayName(date)} | $${x.spend.toFixed(0).padStart(5)} | ${String(x.clicks).padStart(3)} | ${x.conv.toFixed(1).padStart(4)} | $${x.value.toFixed(0).padStart(5)} | ${roas.padStart(5)} | ${cpa.padStart(4)}`)
}

// Per-campaign
console.log(`\n---- PER-CAMPAIGN (last 7d) ----`)
console.log('Campaign                              | Spend         | Conv          | ROAS          | CPA       | Verdict')
console.log('-'.repeat(120))
const allNames = new Set([...post.byCamp.keys(), ...pre.byCamp.keys()])
const sorted = [...allNames].sort((a,b)=>(post.byCamp.get(b)?.spend||0)-(post.byCamp.get(a)?.spend||0))
for (const name of sorted) {
  const c1 = post.byCamp.get(name) || {spend:0,conv:0,value:0,clicks:0}
  const c0 = pre.byCamp.get(name)  || {spend:0,conv:0,value:0,clicks:0}
  if (c1.spend===0 && c0.spend===0) continue
  const r1 = c1.spend>0 ? c1.value/c1.spend : 0
  const r0 = c0.spend>0 ? c0.value/c0.spend : 0
  const cpaC = c1.conv>0 ? '$'+(c1.spend/c1.conv).toFixed(0) : '—'
  let verdict = '🟡 Hold'
  if (r1 >= 3.5 && c1.conv >= 3) verdict = '🟢 SCALE'
  else if (r1 < 1 && c1.spend > 30) verdict = '🔴 BLEEDING'
  else if (r1 >= 2 && r1 < 3.5) verdict = '🟢 Healthy'
  else if (c1.conv === 0 && c1.spend > 30) verdict = '🔴 0 conv'
  console.log(
    `${name.slice(0,37).padEnd(37)} | $${c1.spend.toFixed(0).padStart(4)}→$${c0.spend.toFixed(0).padStart(4)} ${d(c1.spend,c0.spend).padStart(7)} | ${c1.conv.toFixed(1).padStart(4)}→${c0.conv.toFixed(1).padStart(4)} ${d(c1.conv,c0.conv).padStart(7)} | ${r1.toFixed(2)+'x'}→${r0.toFixed(2)+'x'} ${d(r1,r0).padStart(7)} | ${cpaC.padStart(6)} | ${verdict}`
  )
}

// Impression share check (search only)
console.log(`\n---- SEARCH IMPRESSION SHARE (last 7d, where data returned) ----`)
let anyIS = false
for (const [name, c] of post.byCamp.entries()) {
  if (c.channel !== 'SEARCH') continue
  if (c.spend === 0) continue
  const is = avg(c.isList), lb = avg(c.lbList), lr = avg(c.lrList)
  if (is == null && lb == null && lr == null) continue
  anyIS = true
  let verdict = '✅ Healthy'
  if (lb != null && lb > 0.10) verdict = '💰 BUDGET-LIMITED'
  else if (lr != null && lr > 0.30) verdict = '🎯 RANK-LIMITED'
  else if (is != null && is > 0.80) verdict = '🧱 CEILING'
  console.log(`  ${name.padEnd(37)} | IS ${pct(is).padStart(6)} | Lost-Budget ${pct(lb).padStart(6)} | Lost-Rank ${pct(lr).padStart(6)} | ${verdict}`)
}
if (!anyIS) console.log('  (no IS data returned — volume below threshold)')

// Headline summary
console.log(`\n---- ACCOUNT HEALTH VERDICT ----`)
let score = 0, notes = []
if (roas1 >= 3) { score++; notes.push('✅ ROAS ≥3x') } else notes.push(`🔴 ROAS ${roas1.toFixed(2)}x below 3x`)
if (roas1 > roas0) { score++; notes.push('✅ ROAS trending up vs prior 7d') } else notes.push('🔴 ROAS regressed vs prior 7d')
if (t1.value > t0.value) { score++; notes.push('✅ Revenue up') } else notes.push('🔴 Revenue down')
if (cpa1 < cpa0 || cpa0 === 0) { score++; notes.push('✅ CPA improving') } else notes.push('🔴 CPA rising')
if (aov1 > aov0 * 0.9) { score++; notes.push('✅ AOV stable/up') } else notes.push('🟡 AOV down >10%')

console.log(`Score: ${score}/5`)
for (const n of notes) console.log(`  ${n}`)
process.exit(0)
