/**
 * Meta In-Depth Scale Decision Analysis
 *  1. Last 60 days daily trend (is May actually soft or just normal variance?)
 *  2. Campaign-level breakdown (which campaigns can absorb more spend?)
 *  3. Frequency & CPM trends (saturation check)
 *  4. Marginal ROAS analysis (does ROAS hold as spend grows?)
 *  5. Day-of-week + weekday vs weekend
 *  6. Compare to YoY same-period
 *  7. Recommendation: SCALE / HOLD / PULL
 */
import 'dotenv/config'
import { metaToken } from '../server/lib/meta-api.js'
import { writeFileSync, mkdirSync } from 'fs'

const TOKEN = metaToken()
const AD_ACCOUNT = process.env.META_AD_ACCOUNT_ID || 'act_1519116685663528'
const BASE = 'https://graph.facebook.com/v20.0'

async function getInsights({ since, until, level = 'account', time_increment = 1, extraFields = '' }) {
  const baseFields = 'spend,impressions,clicks,actions,action_values,frequency,reach,cpm,cpc,ctr'
  const fields = extraFields ? `${baseFields},${extraFields}` : baseFields
  const url = new URL(`${BASE}/${AD_ACCOUNT}/insights`)
  url.searchParams.set('access_token', TOKEN)
  url.searchParams.set('fields', fields)
  url.searchParams.set('time_range', JSON.stringify({ since, until }))
  url.searchParams.set('level', level)
  url.searchParams.set('time_increment', String(time_increment))
  url.searchParams.set('limit', '500')

  const all = []
  let next = url.toString()
  while (next) {
    const r = await fetch(next).then(r => r.json())
    if (r.error) { console.error('Meta error:', r.error); return null }
    if (r.data) all.push(...r.data)
    next = r.paging?.next || null
    if (next) await new Promise(rs => setTimeout(rs, 700))
  }
  return all
}

const sumPurch = a => {
  if (!Array.isArray(a)) return 0
  const p = a.find(x => x.action_type === 'purchase' || x.action_type === 'omni_purchase')
  return Number(p?.value || 0)
}
const sumPurchVal = a => {
  if (!Array.isArray(a)) return 0
  const p = a.find(x => x.action_type === 'purchase' || x.action_type === 'omni_purchase')
  return Number(p?.value || 0)
}

console.log('\n=== META SCALE DECISION ANALYSIS ===\n')

// 1. Last 60 days daily
console.log('Pulling daily insights for last 60 days...')
const today = new Date()
const since60 = new Date(today)
since60.setDate(today.getDate() - 60)
const todayStr = today.toISOString().slice(0,10)
const since60Str = since60.toISOString().slice(0,10)
const daily = await getInsights({ since: since60Str, until: todayStr, time_increment: 1 })

console.log(`Got ${daily.length} days\n`)

// Print daily table
console.log('━━━ DAILY TREND (last 60 days) ━━━')
console.log('Date       | Day | Spend  | Purch | Revenue  | ROAS  | CPM    | CPC   | Freq | Reach')
console.log('-'.repeat(110))
let prevRevenue = 0
const last7 = []
const prior7 = []
const dailyAgg = []
for (const r of daily.sort((a,b) => (a.date_start||'').localeCompare(b.date_start||''))) {
  const d = r.date_start
  const spend = Number(r.spend || 0)
  const imp = Number(r.impressions || 0)
  const clk = Number(r.clicks || 0)
  const purchases = sumPurch(r.actions)
  const revenue = sumPurchVal(r.action_values)
  const freq = Number(r.frequency || 0)
  const reach = Number(r.reach || 0)
  const cpm = imp > 0 ? (spend/imp*1000) : 0
  const cpc = clk > 0 ? spend/clk : 0
  const roas = spend > 0 ? revenue/spend : 0
  const dow = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(d).getUTCDay()]
  console.log(`${d} | ${dow} | $${spend.toFixed(0).padStart(5)} | ${purchases.toFixed(0).padStart(5)} | $${revenue.toFixed(0).padStart(6)} | ${roas.toFixed(2)}x | $${cpm.toFixed(1).padStart(5)} | $${cpc.toFixed(2)} | ${freq.toFixed(2)} | ${reach.toLocaleString().padStart(6)}`)
  dailyAgg.push({ d, spend, revenue, purchases, freq, reach, cpm, cpc, roas })
}

// Split last 14 vs prior 14
const sorted = dailyAgg.slice().sort((a,b) => b.d.localeCompare(a.d))
const last14 = sorted.slice(0, 14)
const prior14 = sorted.slice(14, 28)
const earlier30 = sorted.slice(28, 58)
const agg = arr => arr.reduce((acc, x) => ({
  spend: acc.spend + x.spend,
  revenue: acc.revenue + x.revenue,
  purchases: acc.purchases + x.purchases,
  freqSum: acc.freqSum + x.freq,
  reachSum: acc.reachSum + x.reach,
  cpmSum: acc.cpmSum + x.cpm,
  n: acc.n + 1,
}), { spend:0, revenue:0, purchases:0, freqSum:0, reachSum:0, cpmSum:0, n:0 })

const w1 = agg(last14)
const w2 = agg(prior14)
const w3 = agg(earlier30)
const pct = (a,b) => b===0?'—':(((a-b)/b*100)>=0?'+':'')+((a-b)/b*100).toFixed(1)+'%'

console.log(`\n━━━ ROLLING WINDOWS — last 14d / prior 14d / earlier 30d ━━━\n`)
console.log('Window      | Spend     | Purch | Revenue   | ROAS  | AOV   | Avg CPM | Avg Freq')
console.log('-'.repeat(90))
const fmt = w => {
  const roas = w.spend > 0 ? (w.revenue/w.spend).toFixed(2)+'x' : '—'
  const aov = w.purchases > 0 ? '$'+(w.revenue/w.purchases).toFixed(0) : '—'
  const cpm = w.n > 0 ? '$'+(w.cpmSum/w.n).toFixed(1) : '—'
  const freq = w.n > 0 ? (w.freqSum/w.n).toFixed(2) : '—'
  return `$${w.spend.toFixed(0).padStart(7)} | ${w.purchases.toFixed(0).padStart(5)} | $${w.revenue.toFixed(0).padStart(7)} | ${roas.padStart(5)} | ${aov.padStart(5)} | ${cpm.padStart(7)} | ${freq.padStart(8)}`
}
console.log(`Last 14d    | ${fmt(w1)}`)
console.log(`Prior 14d   | ${fmt(w2)}`)
console.log(`Earlier 30d | ${fmt(w3)}`)
console.log(`\nLast 14d vs Prior 14d:`)
console.log(`  Spend:    ${pct(w1.spend, w2.spend)}`)
console.log(`  Revenue:  ${pct(w1.revenue, w2.revenue)}`)
console.log(`  ROAS:     ${(w1.revenue/w1.spend).toFixed(2)}x vs ${(w2.revenue/w2.spend).toFixed(2)}x`)

// 2. Campaign-level breakdown
console.log(`\n\n━━━ CAMPAIGN BREAKDOWN — last 30 days ━━━\n`)
const since30 = new Date(today); since30.setDate(today.getDate() - 30)
const camp = await getInsights({ since: since30.toISOString().slice(0,10), until: todayStr, level: 'campaign', time_increment: 'all_days' })
if (camp) {
  console.log('Campaign'.padEnd(45) + ' | Spend   | Purch | Rev      | ROAS  | CPM    | Freq')
  console.log('-'.repeat(110))
  const campList = camp.map(r => ({
    name: (r.campaign_name || r.id || '?').slice(0,42),
    spend: Number(r.spend||0),
    revenue: sumPurchVal(r.action_values),
    purchases: sumPurch(r.actions),
    cpm: Number(r.cpm||0),
    freq: Number(r.frequency||0),
  })).sort((a,b) => b.spend - a.spend)
  for (const x of campList) {
    const roas = x.spend > 0 ? (x.revenue/x.spend).toFixed(2)+'x' : '—'
    console.log(`${x.name.padEnd(45)} | $${x.spend.toFixed(0).padStart(5)}  | ${x.purchases.toFixed(0).padStart(5)} | $${x.revenue.toFixed(0).padStart(6)} | ${roas.padStart(5)} | $${x.cpm.toFixed(1).padStart(5)} | ${x.freq.toFixed(2)}`)
  }
}

// 3. CPM and Frequency trend — month over month
console.log(`\n\n━━━ MONTHLY CPM + FREQUENCY TREND (saturation check) ━━━\n`)
const monthly = await getInsights({ since: '2025-12-01', until: todayStr, time_increment: 'monthly' })
if (monthly) {
  console.log('Month   | Spend   | Reach     | Freq | CPM    | CPC   | CTR   | ROAS  | AOV')
  console.log('-'.repeat(95))
  for (const r of monthly.sort((a,b) => (a.date_start||'').localeCompare(b.date_start||''))) {
    const m = (r.date_start||'').slice(0,7)
    const spend = Number(r.spend||0)
    const imp = Number(r.impressions||0)
    const clk = Number(r.clicks||0)
    const purchases = sumPurch(r.actions)
    const revenue = sumPurchVal(r.action_values)
    const freq = Number(r.frequency||0)
    const reach = Number(r.reach||0)
    const cpm = imp > 0 ? (spend/imp*1000) : 0
    const cpc = clk > 0 ? spend/clk : 0
    const ctr = imp > 0 ? (clk/imp*100) : 0
    const roas = spend > 0 ? revenue/spend : 0
    const aov = purchases > 0 ? revenue/purchases : 0
    console.log(`${m} | $${spend.toFixed(0).padStart(5)} | ${reach.toLocaleString().padStart(8)} | ${freq.toFixed(2)} | $${cpm.toFixed(1).padStart(5)} | $${cpc.toFixed(2)} | ${ctr.toFixed(2)}% | ${roas.toFixed(2)}x | $${aov.toFixed(0)}`)
  }
}

mkdirSync('data/snapshots/meta-scale-decision', { recursive: true })
writeFileSync('data/snapshots/meta-scale-decision/data.json', JSON.stringify({
  last14: w1, prior14: w2, earlier30: w3, dailyAgg, monthly,
}, null, 2))
console.log(`\nSaved: data/snapshots/meta-scale-decision/data.json`)
process.exit(0)
