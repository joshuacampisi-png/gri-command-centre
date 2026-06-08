/**
 * 72hr weekend report — May 22-24 vs prior matching window May 15-17
 * Same Fri-Sat-Sun day-of-week alignment per the weekend-comparison rule
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'

const customer = getGadsCustomer()
const POST = ['2026-05-22','2026-05-23','2026-05-24'] // Fri-Sat-Sun
const PRE  = ['2026-05-15','2026-05-16','2026-05-17'] // Fri-Sat-Sun (matching)

async function pull(dates) {
  const start = dates[0], end = dates[dates.length-1]
  const rows = await customer.query(`
    SELECT segments.date, campaign.name, campaign.advertising_channel_type,
           metrics.cost_micros, metrics.clicks, metrics.impressions,
           metrics.conversions, metrics.conversions_value,
           metrics.all_conversions, metrics.all_conversions_value
    FROM campaign
    WHERE segments.date BETWEEN '${start}' AND '${end}'
      AND campaign.status != 'REMOVED'
  `)
  const byCamp = new Map()
  const byDate = new Map()
  let tot = { spend:0, clicks:0, imp:0, conv:0, value:0, allConv:0, allValue:0 }
  for (const r of rows) {
    const name = r.campaign?.name || '?'
    if (!byCamp.has(name)) byCamp.set(name, { spend:0, clicks:0, imp:0, conv:0, value:0, allConv:0, allValue:0, channel:r.campaign?.advertising_channel_type })
    const c = byCamp.get(name)
    const spend = Number(r.metrics?.cost_micros||0)/1e6
    const clicks = Number(r.metrics?.clicks||0)
    const imp = Number(r.metrics?.impressions||0)
    const conv = Number(r.metrics?.conversions||0)
    const value = Number(r.metrics?.conversions_value||0)
    const allConv = Number(r.metrics?.all_conversions||0)
    const allValue = Number(r.metrics?.all_conversions_value||0)
    c.spend+=spend; c.clicks+=clicks; c.imp+=imp; c.conv+=conv; c.value+=value; c.allConv+=allConv; c.allValue+=allValue
    tot.spend+=spend; tot.clicks+=clicks; tot.imp+=imp; tot.conv+=conv; tot.value+=value; tot.allConv+=allConv; tot.allValue+=allValue
    const date = r.segments?.date
    if (!byDate.has(date)) byDate.set(date,{spend:0,clicks:0,conv:0,value:0,allConv:0,allValue:0})
    const d = byDate.get(date)
    d.spend+=spend; d.clicks+=clicks; d.conv+=conv; d.value+=value; d.allConv+=allConv; d.allValue+=allValue
  }
  return { byCamp, byDate, tot }
}

const d = (a,b) => b===0 ? (a>0?'+∞':'—') : (((a-b)/b*100)>=0?'+':'')+((a-b)/b*100).toFixed(1)+'%'
const dayName = ds => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(ds).getUTCDay()]

console.log(`\n=== 72-HOUR WEEKEND REPORT — Post Negative-Keyword Removal ===`)
console.log(`This window:  ${POST.join(' · ')}`)
console.log(`Prior window: ${PRE.join(' · ')}  (matching Fri-Sat-Sun)\n`)

const [post, pre] = await Promise.all([pull(POST), pull(PRE)])
const t1 = post.tot, t0 = pre.tot

// HEADLINE
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
console.log('Metric              | This 3d        | Prior 3d       | Δ        | Read')
console.log('--------------------+----------------+----------------+----------+-------------')
const print = (label, a, b, dlt) => console.log(`${label.padEnd(19)} | ${String(a).padEnd(14)} | ${String(b).padEnd(14)} | ${dlt.padStart(7)} |`)
print('Spend',         `$${t1.spend.toFixed(0)}`,           `$${t0.spend.toFixed(0)}`,           d(t1.spend,t0.spend))
print('Impressions',   t1.imp.toLocaleString(),             t0.imp.toLocaleString(),             d(t1.imp,t0.imp))
print('Clicks',        t1.clicks.toLocaleString(),          t0.clicks.toLocaleString(),          d(t1.clicks,t0.clicks))
print('CTR',           (ctr1*100).toFixed(2)+'%',           (ctr0*100).toFixed(2)+'%',           d(ctr1,ctr0))
print('CPC',           `$${cpc1.toFixed(2)}`,               `$${cpc0.toFixed(2)}`,               d(cpc1,cpc0))
print('Conversions',   t1.conv.toFixed(1),                  t0.conv.toFixed(1),                  d(t1.conv,t0.conv))
print('CVR',           (cvr1*100).toFixed(2)+'%',           (cvr0*100).toFixed(2)+'%',           d(cvr1,cvr0))
print('CPA',           `$${cpa1.toFixed(2)}`,               `$${cpa0.toFixed(2)}`,               d(cpa1,cpa0))
print('Revenue',       `$${t1.value.toFixed(0)}`,           `$${t0.value.toFixed(0)}`,           d(t1.value,t0.value))
print('AOV',           `$${aov1.toFixed(0)}`,               `$${aov0.toFixed(0)}`,               d(aov1,aov0))
print('ROAS',          roas1.toFixed(2)+'x',                roas0.toFixed(2)+'x',                d(roas1,roas0))
print('All-Conv $',    `$${t1.allValue.toFixed(0)}`,        `$${t0.allValue.toFixed(0)}`,        d(t1.allValue,t0.allValue))
print('aMER',          aMer1.toFixed(2)+'x',                aMer0.toFixed(2)+'x',                d(aMer1,aMer0))

// DAILY TREND — side-by-side day-of-week
console.log(`\n---- DAILY TREND (day-aligned vs prior week) ----`)
console.log('Day | This week                              | Prior week')
console.log('    | Date       | Spend  | Conv | Rev   | RO | Date       | Spend  | Conv | Rev   | RO')
console.log('-'.repeat(110))
for (let i=0; i<3; i++) {
  const dt1 = POST[i], dt0 = PRE[i]
  const a = post.byDate.get(dt1) || {spend:0,conv:0,value:0}
  const b = pre.byDate.get(dt0)  || {spend:0,conv:0,value:0}
  const r1 = a.spend>0 ? (a.value/a.spend).toFixed(2)+'x' : '—'
  const r0 = b.spend>0 ? (b.value/b.spend).toFixed(2)+'x' : '—'
  console.log(`${dayName(dt1)} | ${dt1} | $${a.spend.toFixed(0).padStart(5)} | ${a.conv.toFixed(1).padStart(4)} | $${a.value.toFixed(0).padStart(4)} | ${r1.padEnd(4)} | ${dt0} | $${b.spend.toFixed(0).padStart(5)} | ${b.conv.toFixed(1).padStart(4)} | $${b.value.toFixed(0).padStart(4)} | ${r0}`)
}

// CAMPAIGN BREAKDOWN
console.log(`\n---- PER-CAMPAIGN (this 3d vs prior 3d) ----`)
console.log('Campaign                              | Spend          | Conv          | ROAS          | Verdict')
console.log('-'.repeat(115))
const allNames = new Set([...post.byCamp.keys(), ...pre.byCamp.keys()])
const sorted = [...allNames].sort((a,b)=>(post.byCamp.get(b)?.spend||0)-(post.byCamp.get(a)?.spend||0))
for (const name of sorted) {
  const c1 = post.byCamp.get(name) || {spend:0,conv:0,value:0}
  const c0 = pre.byCamp.get(name)  || {spend:0,conv:0,value:0}
  if (c1.spend===0 && c0.spend===0) continue
  const r1 = c1.spend>0 ? c1.value/c1.spend : 0
  const r0 = c0.spend>0 ? c0.value/c0.spend : 0
  let verdict = '🟡 Hold'
  if (r1 >= 3.5 && c1.conv >= 3) verdict = '🟢 STRONG'
  else if (r1 < 1 && c1.spend > 30) verdict = '🔴 BLEEDING'
  else if (r1 >= 2) verdict = '🟢 Healthy'
  else if (c1.conv === 0 && c1.spend > 30) verdict = '🔴 0 conv'
  console.log(`${name.slice(0,37).padEnd(37)} | $${c1.spend.toFixed(0).padStart(4)}→$${c0.spend.toFixed(0).padStart(4)} ${d(c1.spend,c0.spend).padStart(7)} | ${c1.conv.toFixed(1).padStart(4)}→${c0.conv.toFixed(1).padStart(4)} ${d(c1.conv,c0.conv).padStart(7)} | ${r1.toFixed(2)+'x'}→${r0.toFixed(2)+'x'} ${d(r1,r0).padStart(7)} | ${verdict}`)
}

// HEALTH VERDICT
console.log(`\n---- VERDICT ----`)
const checks = []
checks.push([roas1 >= 3, `ROAS ${roas1.toFixed(2)}x ${roas1>=3?'≥':'<'} 3x`])
checks.push([roas1 > roas0, `ROAS ${roas1>roas0?'up':'down'} vs prior weekend (${roas0.toFixed(2)}x)`])
checks.push([t1.value > t0.value, `Revenue ${t1.value>t0.value?'up':'down'}: $${t1.value.toFixed(0)} vs $${t0.value.toFixed(0)}`])
checks.push([cpa1 < cpa0 || cpa0===0, `CPA ${cpa1<cpa0?'improved':'worsened'}: $${cpa1.toFixed(0)} vs $${cpa0.toFixed(0)}`])
checks.push([aov1 >= aov0 * 0.9, `AOV ${aov1>=aov0*0.9?'stable/up':'down >10%'}: $${aov1.toFixed(0)} vs $${aov0.toFixed(0)}`])
const passing = checks.filter(c=>c[0]).length
console.log(`Score: ${passing}/5`)
for (const [ok, label] of checks) console.log(`  ${ok?'✅':'🔴'} ${label}`)

process.exit(0)
