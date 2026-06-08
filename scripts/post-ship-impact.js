/**
 * Post-Ship Impact — how have the May 28 changes affected the account?
 *  - Pre-ship: May 21-27 (7 days before)
 *  - Post-ship: May 28 - Jun 1 (5 days after)
 *  - Per-campaign + per-keyword breakdown
 *  - Did the new EXACT keywords serve? Convert?
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const c = getGadsCustomer()
const pct = (a,b) => b===0?'—':(((a-b)/b*100)>=0?'+':'')+((a-b)/b*100).toFixed(1)+'%'

const PRE_START = '2026-05-21'
const PRE_END   = '2026-05-27'
const POST_START = '2026-05-28'
const POST_END   = '2026-06-01'

console.log(`\n=== POST-SHIP IMPACT — Pre (${PRE_START}→${PRE_END}, 7d) vs Post (${POST_START}→${POST_END}, 5d) ===\n`)

async function fetchPeriod(start, end) {
  return c.query(`
    SELECT campaign.name, segments.date,
           metrics.cost_micros, metrics.clicks, metrics.impressions,
           metrics.conversions, metrics.conversions_value, metrics.all_conversions_value
    FROM campaign
    WHERE segments.date BETWEEN '${start}' AND '${end}'
      AND campaign.status != 'REMOVED'
  `)
}

const pre = await fetchPeriod(PRE_START, PRE_END)
const post = await fetchPeriod(POST_START, POST_END)

const aggCamp = rows => {
  const m = new Map()
  let days = new Set()
  for (const r of rows) {
    days.add(r.segments?.date)
    const n = r.campaign?.name||'?'
    if (!m.has(n)) m.set(n, {imp:0,clk:0,spend:0,conv:0,val:0,allVal:0})
    const x = m.get(n)
    x.imp += Number(r.metrics?.impressions||0)
    x.clk += Number(r.metrics?.clicks||0)
    x.spend += Number(r.metrics?.cost_micros||0)/1e6
    x.conv += Number(r.metrics?.conversions||0)
    x.val += Number(r.metrics?.conversions_value||0)
    x.allVal += Number(r.metrics?.all_conversions_value||0)
  }
  return { perCamp: m, days: days.size }
}
const preAgg = aggCamp(pre)
const postAgg = aggCamp(post)

// Account-level
console.log('━━━ ACCOUNT TOTAL — DAILY AVERAGES (normalised) ━━━\n')
const sumAll = perCamp => {
  let t = {imp:0,clk:0,spend:0,conv:0,val:0,allVal:0}
  for (const [_,x] of perCamp) {
    for (const k of Object.keys(t)) t[k] += x[k]
  }
  return t
}
const preTot = sumAll(preAgg.perCamp)
const postTot = sumAll(postAgg.perCamp)
const preDays = preAgg.days, postDays = postAgg.days
console.log(`Pre window:  ${preDays} days, Post window: ${postDays} days\n`)
console.log('Metric         | Pre (per day) | Post (per day) | Δ')
console.log('-'.repeat(65))
const rows = [
  ['Spend',     '$'+(preTot.spend/preDays).toFixed(0),    '$'+(postTot.spend/postDays).toFixed(0),  pct(postTot.spend/postDays, preTot.spend/preDays)],
  ['Impressions', Math.round(preTot.imp/preDays).toLocaleString(),  Math.round(postTot.imp/postDays).toLocaleString(),  pct(postTot.imp/postDays, preTot.imp/preDays)],
  ['Clicks',    Math.round(preTot.clk/preDays).toLocaleString(),    Math.round(postTot.clk/postDays).toLocaleString(),  pct(postTot.clk/postDays, preTot.clk/preDays)],
  ['Conv',      (preTot.conv/preDays).toFixed(1),         (postTot.conv/postDays).toFixed(1),       pct(postTot.conv/postDays, preTot.conv/preDays)],
  ['Revenue',   '$'+(preTot.val/preDays).toFixed(0),      '$'+(postTot.val/postDays).toFixed(0),    pct(postTot.val/postDays, preTot.val/preDays)],
  ['All-Conv $','$'+(preTot.allVal/preDays).toFixed(0),   '$'+(postTot.allVal/postDays).toFixed(0), pct(postTot.allVal/postDays, preTot.allVal/preDays)],
  ['ROAS',      (preTot.val/preTot.spend).toFixed(2)+'x', (postTot.val/postTot.spend).toFixed(2)+'x', ''],
  ['aMER',      (preTot.allVal/preTot.spend).toFixed(2)+'x', (postTot.allVal/postTot.spend).toFixed(2)+'x', ''],
]
for (const r of rows) console.log(`${r[0].padEnd(14)} | ${r[1].padEnd(13)} | ${r[2].padEnd(14)} | ${r[3]}`)

// Per-campaign
console.log(`\n\n━━━ PER-CAMPAIGN IMPACT — daily averages ━━━\n`)
console.log('Campaign'.padEnd(36) + ' | PreSpend | PostSpend | PreROAS | PostROAS | PreRev | PostRev | Rev Δ')
console.log('-'.repeat(115))
const allCamps = new Set([...preAgg.perCamp.keys(), ...postAgg.perCamp.keys()])
for (const n of allCamps) {
  const p = preAgg.perCamp.get(n) || {spend:0,conv:0,val:0}
  const q = postAgg.perCamp.get(n) || {spend:0,conv:0,val:0}
  const preSpendDay = p.spend/preDays
  const postSpendDay = q.spend/postDays
  const preRevDay = p.val/preDays
  const postRevDay = q.val/postDays
  const preRoas = p.spend>0?(p.val/p.spend).toFixed(2)+'x':'—'
  const postRoas = q.spend>0?(q.val/q.spend).toFixed(2)+'x':'—'
  if (preSpendDay < 1 && postSpendDay < 1) continue
  console.log(`${n.slice(0,34).padEnd(36)} | $${preSpendDay.toFixed(0).padStart(6)} | $${postSpendDay.toFixed(0).padStart(7)} | ${preRoas.padStart(6)} | ${postRoas.padStart(7)} | $${preRevDay.toFixed(0).padStart(5)} | $${postRevDay.toFixed(0).padStart(6)} | ${pct(postRevDay, preRevDay)}`)
}

// New EXACT keywords activity
console.log(`\n\n━━━ NEW EXACT KEYWORDS — post-ship activity (May 28 - Jun 1) ━━━\n`)
const NEW_EXACTS = [
  'gender reveal extinguisher',
  'gender reveal fire extinguisher',
  'gender reveal smoke bombs',
  'gender reveal powder blaster',
  'gender reveal mega blaster',
  'gender reveal blasters',
  'gender reveal extinguisher near me',
  'gender reveal extinguishers',
  'gender reveal colour blaster',
  'gender reveal blaster',
  'gender reveal powder extinguisher',
  'gender extinguisher',
  'gender reveal smoke blaster',
  'confetti cannon gender reveal',
  'gender reveal confetti cannons',
  'biodegradable confetti cannon gender reveal',
  'blue confetti cannon',
  'gender reveal smoke confetti cannon',
]
const kwData = await c.query(`
  SELECT ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type,
         metrics.impressions, metrics.clicks, metrics.cost_micros,
         metrics.conversions, metrics.conversions_value
  FROM keyword_view
  WHERE campaign.name = 'GRI | Search | Cannons'
    AND ad_group_criterion.negative = FALSE
    AND ad_group_criterion.keyword.match_type = 'EXACT'
    AND segments.date BETWEEN '${POST_START}' AND '${POST_END}'
`)
const newKwAgg = new Map()
for (const r of kwData) {
  const t = (r.ad_group_criterion?.keyword?.text||'').toLowerCase()
  if (!NEW_EXACTS.includes(t)) continue
  if (!newKwAgg.has(t)) newKwAgg.set(t, {imp:0,clk:0,spend:0,conv:0,val:0})
  const x = newKwAgg.get(t)
  x.imp += Number(r.metrics?.impressions||0)
  x.clk += Number(r.metrics?.clicks||0)
  x.spend += Number(r.metrics?.cost_micros||0)/1e6
  x.conv += Number(r.metrics?.conversions||0)
  x.val += Number(r.metrics?.conversions_value||0)
}
console.log('Keyword'.padEnd(45) + ' | Imp | Clk | Spend | Conv | Rev')
console.log('-'.repeat(85))
let totalNewImp = 0, totalNewClk = 0, totalNewSpend = 0, totalNewConv = 0, totalNewVal = 0
for (const [kw, x] of [...newKwAgg.entries()].sort((a,b)=>b[1].imp-a[1].imp)) {
  console.log(`${kw.padEnd(45)} | ${String(x.imp).padStart(3)} | ${String(x.clk).padStart(3)} | $${x.spend.toFixed(0).padStart(3)}  | ${x.conv.toFixed(1).padStart(4)} | $${x.val.toFixed(0)}`)
  totalNewImp += x.imp
  totalNewClk += x.clk
  totalNewSpend += x.spend
  totalNewConv += x.conv
  totalNewVal += x.val
}
console.log('-'.repeat(85))
console.log(`TOTAL NEW EXACTS`.padEnd(45) + ` | ${String(totalNewImp).padStart(3)} | ${String(totalNewClk).padStart(3)} | $${totalNewSpend.toFixed(0).padStart(3)}  | ${totalNewConv.toFixed(1).padStart(4)} | $${totalNewVal.toFixed(0)}`)

// Smoke/Extinguisher search terms on Cannons — are they landing now?
console.log(`\n\n━━━ SMOKE/EXTINGUISHER SEARCH TERMS ON CANNONS — Pre vs Post ━━━\n`)
const PAT = /smoke|extinguish|blaster/i
async function stOnCannons(start,end) {
  return c.query(`
    SELECT search_term_view.search_term, metrics.impressions, metrics.clicks,
           metrics.conversions, metrics.conversions_value
    FROM search_term_view
    WHERE campaign.name = 'GRI | Search | Cannons'
      AND segments.date BETWEEN '${start}' AND '${end}'
      AND metrics.impressions > 0
  `)
}
const stPre = await stOnCannons(PRE_START, PRE_END)
const stPost = await stOnCannons(POST_START, POST_END)
const stFiltered = rows => {
  let t = {imp:0,clk:0,conv:0,val:0,uniqueTerms:new Set()}
  for (const r of rows) {
    const term = r.search_term_view?.search_term||''
    if (!PAT.test(term)) continue
    t.imp += Number(r.metrics?.impressions||0)
    t.clk += Number(r.metrics?.clicks||0)
    t.conv += Number(r.metrics?.conversions||0)
    t.val += Number(r.metrics?.conversions_value||0)
    t.uniqueTerms.add(term)
  }
  return t
}
const f1 = stFiltered(stPre)
const f2 = stFiltered(stPost)
console.log(`Pre  (7d): ${f1.uniqueTerms.size} distinct smoke/ext/blaster terms hit Cannons | ${f1.imp} imp | ${f1.clk} clk | ${f1.conv.toFixed(1)} conv | $${f1.val.toFixed(0)}`)
console.log(`Post (5d): ${f2.uniqueTerms.size} distinct smoke/ext/blaster terms hit Cannons | ${f2.imp} imp | ${f2.clk} clk | ${f2.conv.toFixed(1)} conv | $${f2.val.toFixed(0)}`)
const dailyPreImp = f1.imp/preDays
const dailyPostImp = f2.imp/postDays
console.log(`\nPer day: pre ${dailyPreImp.toFixed(0)} imp/day → post ${dailyPostImp.toFixed(0)} imp/day (${pct(dailyPostImp, dailyPreImp)})`)

process.exit(0)
