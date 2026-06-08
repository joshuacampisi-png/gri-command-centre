/**
 * Check current daily budget + 7d perf on Search Cannons
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const customer = getGadsCustomer()

const camp = await customer.query(`
  SELECT campaign.id, campaign.name, campaign.status,
         campaign_budget.amount_micros, campaign_budget.name, campaign_budget.id
  FROM campaign WHERE campaign.name = 'GRI | Search | Cannons'
`)
const c = camp[0]
console.log(`Campaign: ${c.campaign.name}`)
console.log(`Status: ${c.campaign.status} (2=ENABLED, 3=PAUSED)`)
console.log(`Daily budget: $${(Number(c.campaign_budget.amount_micros)/1e6).toFixed(2)}`)
console.log(`Budget id: ${c.campaign_budget.id}`)

// Last 7 days
const perf = await customer.query(`
  SELECT segments.date, metrics.cost_micros, metrics.clicks, metrics.conversions, metrics.conversions_value
  FROM campaign
  WHERE campaign.id = ${c.campaign.id}
    AND segments.date BETWEEN '2026-05-16' AND '2026-05-22'
`)
console.log(`\nLast 7d daily breakdown:`)
console.log('Date       | Spend  | Clk | Conv | Rev   | ROAS')
let tot = {spend:0,clicks:0,conv:0,value:0}
for (const r of perf.sort((a,b)=>a.segments.date.localeCompare(b.segments.date))) {
  const spend = Number(r.metrics?.cost_micros||0)/1e6
  const clicks = Number(r.metrics?.clicks||0)
  const conv = Number(r.metrics?.conversions||0)
  const value = Number(r.metrics?.conversions_value||0)
  tot.spend+=spend; tot.clicks+=clicks; tot.conv+=conv; tot.value+=value
  const roas = spend>0 ? (value/spend).toFixed(2)+'x' : '—'
  console.log(`${r.segments.date} | $${spend.toFixed(0).padStart(5)} | ${String(clicks).padStart(3)} | ${conv.toFixed(1).padStart(4)} | $${value.toFixed(0).padStart(4)} | ${roas}`)
}
console.log(`TOTAL      | $${tot.spend.toFixed(0)} | ${tot.clicks} | ${tot.conv.toFixed(1)} | $${tot.value.toFixed(0)} | ${tot.spend>0?(tot.value/tot.spend).toFixed(2)+'x':'—'}`)

// Last 3 days only (post your keyword pause)
console.log(`\nLast 3d (post-pause window):`)
const last3 = perf.filter(r => r.segments.date >= '2026-05-20')
let t3 = {spend:0,conv:0,value:0}
for (const r of last3) {
  t3.spend += Number(r.metrics?.cost_micros||0)/1e6
  t3.conv  += Number(r.metrics?.conversions||0)
  t3.value += Number(r.metrics?.conversions_value||0)
}
console.log(`  Spend $${t3.spend.toFixed(0)} | Conv ${t3.conv.toFixed(1)} | Rev $${t3.value.toFixed(0)} | ROAS ${t3.spend>0?(t3.value/t3.spend).toFixed(2)+'x':'—'}`)
process.exit(0)
