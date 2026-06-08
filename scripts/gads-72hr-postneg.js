/**
 * 72-hour Google Ads reading post negative-keyword removal
 * Compare last 3 days (post-change) vs prior 3 days (baseline)
 * + impression share / lost IS analysis for scale ceiling
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'

const customer = getGadsCustomer()

// Date math: today (AEST) is 2026-05-23. Yesterday is 22.
// Post window: May 20-22 (last 3 completed days)
// Baseline window: May 17-19 (prior 3 completed days)
const POST = ['2026-05-20','2026-05-21','2026-05-22']
const PRE  = ['2026-05-17','2026-05-18','2026-05-19']

async function pull(dates) {
  const start = dates[0], end = dates[dates.length-1]
  const rows = await customer.query(`
    SELECT campaign.name, campaign.advertising_channel_type, campaign.status,
           metrics.cost_micros, metrics.clicks, metrics.impressions,
           metrics.conversions, metrics.conversions_value,
           metrics.search_impression_share, metrics.search_budget_lost_impression_share,
           metrics.search_rank_lost_impression_share
    FROM campaign
    WHERE segments.date BETWEEN '${start}' AND '${end}'
      AND campaign.status != 'REMOVED'
  `)
  const byCamp = new Map()
  let tot = { spend:0, clicks:0, imp:0, conv:0, value:0 }
  for (const r of rows) {
    const name = r.campaign?.name || '?'
    if (!byCamp.has(name)) byCamp.set(name, { spend:0, clicks:0, imp:0, conv:0, value:0,
      isList:[], budgetLostList:[], rankLostList:[], channel:r.campaign?.advertising_channel_type, status:r.campaign?.status })
    const c = byCamp.get(name)
    const spend = Number(r.metrics?.cost_micros||0)/1e6
    const clicks = Number(r.metrics?.clicks||0)
    const imp = Number(r.metrics?.impressions||0)
    const conv = Number(r.metrics?.conversions||0)
    const value = Number(r.metrics?.conversions_value||0)
    c.spend += spend; c.clicks += clicks; c.imp += imp; c.conv += conv; c.value += value
    if (r.metrics?.search_impression_share != null) c.isList.push(Number(r.metrics.search_impression_share))
    if (r.metrics?.search_budget_lost_impression_share != null) c.budgetLostList.push(Number(r.metrics.search_budget_lost_impression_share))
    if (r.metrics?.search_rank_lost_impression_share != null) c.rankLostList.push(Number(r.metrics.search_rank_lost_impression_share))
    tot.spend += spend; tot.clicks += clicks; tot.imp += imp; tot.conv += conv; tot.value += value
  }
  return { byCamp, tot }
}

function avg(arr){ return arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : null }
function pct(n){ return n==null ? '—' : (n*100).toFixed(1)+'%' }
function delta(a,b){ if(b===0) return a>0?'+∞':'—'; const d=((a-b)/b*100); return (d>=0?'+':'')+d.toFixed(1)+'%' }

console.log(`\n=== 72-HOUR POST NEGATIVE-KEYWORD REMOVAL REPORT ===`)
console.log(`Post window:  ${POST.join(', ')}`)
console.log(`Prior window: ${PRE.join(', ')}\n`)

const [post, pre] = await Promise.all([pull(POST), pull(PRE)])

// ---- HEADLINE TOTALS ----
console.log(`---- ACCOUNT TOTALS (3d vs prior 3d) ----`)
const t1=post.tot, t0=pre.tot
const roasPost = t1.spend>0 ? t1.value/t1.spend : 0
const roasPre  = t0.spend>0 ? t0.value/t0.spend : 0
const cpcPost = t1.clicks>0 ? t1.spend/t1.clicks : 0
const cpcPre  = t0.clicks>0 ? t0.spend/t0.clicks : 0
const ctrPost = t1.imp>0 ? t1.clicks/t1.imp : 0
const ctrPre  = t0.imp>0 ? t0.clicks/t0.imp : 0
const cvrPost = t1.clicks>0 ? t1.conv/t1.clicks : 0
const cvrPre  = t0.clicks>0 ? t0.conv/t0.clicks : 0
const cpaPost = t1.conv>0 ? t1.spend/t1.conv : 0
const cpaPre  = t0.conv>0 ? t0.spend/t0.conv : 0
const aovPost = t1.conv>0 ? t1.value/t1.conv : 0
const aovPre  = t0.conv>0 ? t0.value/t0.conv : 0

const rows = [
  ['Spend',       `$${t1.spend.toFixed(0)}`, `$${t0.spend.toFixed(0)}`, delta(t1.spend, t0.spend)],
  ['Impressions', t1.imp.toLocaleString(),    t0.imp.toLocaleString(),    delta(t1.imp, t0.imp)],
  ['Clicks',      t1.clicks.toLocaleString(), t0.clicks.toLocaleString(), delta(t1.clicks, t0.clicks)],
  ['CTR',         (ctrPost*100).toFixed(2)+'%', (ctrPre*100).toFixed(2)+'%', delta(ctrPost, ctrPre)],
  ['CPC',         `$${cpcPost.toFixed(2)}`, `$${cpcPre.toFixed(2)}`, delta(cpcPost, cpcPre)],
  ['Conversions', t1.conv.toFixed(1),         t0.conv.toFixed(1),         delta(t1.conv, t0.conv)],
  ['CVR',         (cvrPost*100).toFixed(2)+'%', (cvrPre*100).toFixed(2)+'%', delta(cvrPost, cvrPre)],
  ['CPA',         `$${cpaPost.toFixed(2)}`, `$${cpaPre.toFixed(2)}`, delta(cpaPost, cpaPre)],
  ['Revenue',     `$${t1.value.toFixed(0)}`, `$${t0.value.toFixed(0)}`, delta(t1.value, t0.value)],
  ['AOV',         `$${aovPost.toFixed(0)}`, `$${aovPre.toFixed(0)}`, delta(aovPost, aovPre)],
  ['ROAS',        roasPost.toFixed(2)+'x', roasPre.toFixed(2)+'x', delta(roasPost, roasPre)],
]
console.log('Metric        | Post 3d        | Prior 3d       | Δ')
console.log('--------------+----------------+----------------+----------')
for (const r of rows) console.log(`${r[0].padEnd(13)} | ${r[1].padEnd(14)} | ${r[2].padEnd(14)} | ${r[3]}`)

// ---- PER CAMPAIGN ----
console.log(`\n---- PER-CAMPAIGN (active campaigns, sorted by post spend) ----`)
console.log('Campaign                              | Spend Post→Pre        | Conv Post→Pre   | ROAS Post→Pre   | CPA Post→Pre')
console.log('--------------------------------------+-----------------------+-----------------+-----------------+-------------------')
const allNames = new Set([...post.byCamp.keys(), ...pre.byCamp.keys()])
const sorted = [...allNames].sort((a,b)=>(post.byCamp.get(b)?.spend||0)-(post.byCamp.get(a)?.spend||0))
for (const name of sorted) {
  const c1 = post.byCamp.get(name) || {spend:0,conv:0,value:0,clicks:0}
  const c0 = pre.byCamp.get(name)  || {spend:0,conv:0,value:0,clicks:0}
  if (c1.spend===0 && c0.spend===0) continue
  const roas1 = c1.spend>0 ? (c1.value/c1.spend).toFixed(2)+'x' : '—'
  const roas0 = c0.spend>0 ? (c0.value/c0.spend).toFixed(2)+'x' : '—'
  const cpa1  = c1.conv>0  ? '$'+(c1.spend/c1.conv).toFixed(0) : '—'
  const cpa0  = c0.conv>0  ? '$'+(c0.spend/c0.conv).toFixed(0) : '—'
  console.log(
    `${name.slice(0,37).padEnd(37)} | $${c1.spend.toFixed(0).padStart(5)}→$${c0.spend.toFixed(0).padStart(5)} (${delta(c1.spend,c0.spend).padStart(6)}) | ${c1.conv.toFixed(1).padStart(5)}→${c0.conv.toFixed(1).padStart(5)} ${delta(c1.conv,c0.conv).padStart(6)} | ${roas1.padStart(6)}→${roas0.padStart(6)} | ${cpa1.padStart(5)}→${cpa0.padStart(5)}`
  )
}

// ---- SCALE CEILING: Search IS analysis (Search campaigns only) ----
console.log(`\n---- SCALE CEILING: IMPRESSION SHARE (post 3d, Search campaigns) ----`)
console.log('Campaign                              | IS    | Lost-Budget | Lost-Rank | Headroom Verdict')
console.log('--------------------------------------+-------+-------------+-----------+----------------------------')
let totalBudgetCappedSpend = 0
let totalSpendableWithBudget = 0
for (const [name, c] of post.byCamp.entries()) {
  if (c.channel !== 'SEARCH') continue
  if (c.spend === 0) continue
  const is = avg(c.isList)
  const lb = avg(c.budgetLostList)
  const lr = avg(c.rankLostList)
  let verdict = ''
  if (lb != null && lb > 0.10) verdict = `💰 BUDGET-LIMITED — raise budget`
  else if (lr != null && lr > 0.30) verdict = `🎯 RANK-LIMITED — raise bid / improve QS`
  else if (is != null && is > 0.80) verdict = `🧱 CEILING — near max coverage`
  else verdict = `✅ Healthy headroom`
  console.log(`${name.slice(0,37).padEnd(37)} | ${pct(is).padStart(5)} | ${pct(lb).padStart(11)} | ${pct(lr).padStart(9)} | ${verdict}`)

  if (lb != null && lb > 0) {
    // Estimate spend Josh could capture if budget went to 0% lost
    const additionalSpend = c.spend * (lb / Math.max(0.001, 1 - lb))
    totalBudgetCappedSpend += additionalSpend
    totalSpendableWithBudget += c.spend + additionalSpend
  }
}
if (totalBudgetCappedSpend > 0) {
  console.log(`\n💰 ESTIMATED 3D BUDGET-CAPPED SPEND: $${totalBudgetCappedSpend.toFixed(0)} (~$${(totalBudgetCappedSpend/3).toFixed(0)}/day) you could capture by lifting daily budgets`)
}

// ---- PMAX / Shopping ----
console.log(`\n---- PMAX / SHOPPING (post 3d) ----`)
for (const [name, c] of post.byCamp.entries()) {
  if (c.channel !== 'PERFORMANCE_MAX' && c.channel !== 'SHOPPING') continue
  if (c.spend === 0) continue
  const roas = c.spend>0 ? (c.value/c.spend).toFixed(2)+'x' : '—'
  const cpa = c.conv>0 ? '$'+(c.spend/c.conv).toFixed(0) : '—'
  console.log(`  ${name} | $${c.spend.toFixed(0)} | ${c.conv.toFixed(1)} conv | ${roas} ROAS | ${cpa} CPA`)
}

process.exit(0)
