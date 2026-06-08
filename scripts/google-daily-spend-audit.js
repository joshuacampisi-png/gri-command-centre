/**
 * Why isn't Google spend hitting $1000/day?
 *  1. Actual daily spend last 14 days vs daily budget caps
 *  2. Lost Impression Share to Budget (where Google STOPPED us from spending)
 *  3. Historic months that DID hit $1000+/day average
 *  4. Per-campaign delivery rate (actual spend ÷ budget)
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'

const c = getGadsCustomer()
const strCh = v => typeof v === 'string' ? v : (v?.name || String(v||''))
const pct = n => n==null?'—':(Number(n)*100).toFixed(1)+'%'

console.log('\n=== GOOGLE DAILY SPEND AUDIT ===\n')

// 1. Last 14 days actual daily spend
console.log('━━━ LAST 14 DAYS — actual daily spend ━━━\n')
const daily = await c.query(`
  SELECT segments.date, metrics.cost_micros, metrics.clicks, metrics.impressions,
         metrics.conversions, metrics.conversions_value
  FROM campaign
  WHERE segments.date BETWEEN '2026-05-19' AND '2026-06-01'
    AND campaign.status != 'REMOVED'
`)
const byDay = new Map()
for (const r of daily) {
  const d = r.segments?.date
  if (!byDay.has(d)) byDay.set(d, {imp:0,clk:0,spend:0,conv:0,val:0})
  const x = byDay.get(d)
  x.imp += Number(r.metrics?.impressions||0)
  x.clk += Number(r.metrics?.clicks||0)
  x.spend += Number(r.metrics?.cost_micros||0)/1e6
  x.conv += Number(r.metrics?.conversions||0)
  x.val += Number(r.metrics?.conversions_value||0)
}
const dayName = ds => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(ds).getUTCDay()]
console.log('Date       | Day | Spend  | Imp   | Clk | Conv | Rev    | ROAS')
console.log('-'.repeat(75))
let totSpend = 0, days = 0
for (const [d,x] of [...byDay.entries()].sort()) {
  const roas = x.spend > 0 ? (x.val/x.spend).toFixed(2)+'x' : '—'
  console.log(`${d} | ${dayName(d)} | $${x.spend.toFixed(0).padStart(4)} | ${String(x.imp).padStart(5)} | ${String(x.clk).padStart(3)} | ${x.conv.toFixed(0).padStart(4)} | $${x.val.toFixed(0).padStart(5)} | ${roas}`)
  totSpend += x.spend; days++
}
console.log(`\nAvg daily spend (last ${days} days): $${(totSpend/days).toFixed(0)}`)

// 2. CURRENT campaign daily budgets — what we COULD spend
console.log('\n\n━━━ CURRENT DAILY BUDGET CAPS (active campaigns) ━━━\n')
const camps = await c.query(`
  SELECT campaign.id, campaign.name, campaign.status,
         campaign.advertising_channel_type, campaign.bidding_strategy_type,
         campaign_budget.amount_micros
  FROM campaign
  WHERE campaign.status = 'ENABLED'
`)
const chLabel = {2:'SEARCH',3:'DISPLAY',4:'SHOPPING',10:'PMAX',13:'DEMAND_GEN'}
const bsLabel = {1:'MANUAL_CPC',8:'tROAS',10:'MAX_CONV_VALUE',11:'TIS'}
let totBudget = 0
console.log('Campaign'.padEnd(38) + ' | Channel  | Bid          | Daily Budget')
console.log('-'.repeat(85))
for (const r of camps) {
  const budget = Number(r.campaign_budget?.amount_micros||0)/1e6
  const ch = chLabel[r.campaign?.advertising_channel_type] || `?${r.campaign?.advertising_channel_type}`
  const bs = bsLabel[r.campaign?.bidding_strategy_type] || `?${r.campaign?.bidding_strategy_type}`
  console.log(`${(r.campaign?.name||'?').slice(0,36).padEnd(38)} | ${ch.padEnd(8)} | ${bs.padEnd(12)} | $${budget.toFixed(0).padStart(4)}/day`)
  totBudget += budget
}
console.log('-'.repeat(85))
console.log(`TOTAL DAILY BUDGET CAP                                                  $${totBudget.toFixed(0)}/day`)

// 3. Delivery rate — how much of budget are we actually spending?
console.log(`\n━━━ DELIVERY RATE (last 7 days) ━━━\n`)
const last7 = await c.query(`
  SELECT campaign.name, campaign_budget.amount_micros, metrics.cost_micros,
         metrics.search_budget_lost_impression_share, metrics.search_rank_lost_impression_share,
         metrics.search_impression_share
  FROM campaign
  WHERE segments.date BETWEEN '2026-05-26' AND '2026-06-01'
    AND campaign.status = 'ENABLED'
`)
const last7Agg = new Map()
for (const r of last7) {
  const n = r.campaign?.name
  if (!last7Agg.has(n)) last7Agg.set(n, {spend:0, budget: Number(r.campaign_budget?.amount_micros||0)/1e6, lb:[], lr:[], is:[]})
  const x = last7Agg.get(n)
  x.spend += Number(r.metrics?.cost_micros||0)/1e6
  if (r.metrics?.search_budget_lost_impression_share!=null) x.lb.push(Number(r.metrics.search_budget_lost_impression_share))
  if (r.metrics?.search_rank_lost_impression_share!=null) x.lr.push(Number(r.metrics.search_rank_lost_impression_share))
  if (r.metrics?.search_impression_share!=null) x.is.push(Number(r.metrics.search_impression_share))
}
const avg = a => a.length?a.reduce((x,y)=>x+y,0)/a.length:null
console.log('Campaign'.padEnd(38) + ' | Budget | Avg/day | Use% | LostBud | LostRank | SIS')
console.log('-'.repeat(110))
for (const [n,x] of last7Agg) {
  const avgDay = x.spend/7
  const useRate = x.budget>0 ? (avgDay/x.budget*100).toFixed(0)+'%' : '—'
  console.log(`${n.slice(0,36).padEnd(38)} | $${x.budget.toFixed(0).padStart(4)}  | $${avgDay.toFixed(0).padStart(4)}   | ${useRate.padStart(4)} | ${pct(avg(x.lb)).padStart(6)} | ${pct(avg(x.lr)).padStart(6)}   | ${pct(avg(x.is))}`)
}

// 4. Historical context — when did we spend $1000/day?
console.log(`\n\n━━━ HISTORICAL — months we spent $1000+/day on avg ━━━\n`)
const hist = await c.query(`
  SELECT segments.date, metrics.cost_micros
  FROM campaign
  WHERE segments.date BETWEEN '2025-01-01' AND '2026-06-01'
    AND campaign.status != 'REMOVED'
`)
const histMo = new Map()
for (const r of hist) {
  const m = r.segments?.date?.slice(0,7)
  if (!histMo.has(m)) histMo.set(m,{spend:0,days:new Set()})
  const x = histMo.get(m)
  x.spend += Number(r.metrics?.cost_micros||0)/1e6
  x.days.add(r.segments?.date)
}
console.log('Month   | Avg daily spend | Avg/day vs $1000 target')
console.log('-'.repeat(60))
for (const [m,x] of [...histMo.entries()].sort()) {
  const avgPerDay = x.spend / x.days.size
  const flag = avgPerDay >= 1000 ? '🟢 hit $1000+' : avgPerDay >= 500 ? '🟡' : '🔴'
  console.log(`${m} | $${avgPerDay.toFixed(0).padStart(5)}/day      | ${flag}`)
}

process.exit(0)
