import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const customer = getGadsCustomer()

const camp = await customer.query(`
  SELECT campaign.id, campaign.name, campaign.status, campaign.bidding_strategy_type,
         campaign.target_roas.target_roas,
         campaign_budget.amount_micros, campaign_budget.id
  FROM campaign WHERE campaign.name = 'GRI PMAX | Bundles'
`)
const c = camp[0]
console.log(`Campaign: ${c.campaign.name}`)
console.log(`Status: ${c.campaign.status} (2=ENABLED)`)
console.log(`Bidding: ${c.campaign.bidding_strategy_type} | tROAS: ${c.campaign?.target_roas?.target_roas || '—'}`)
console.log(`Daily budget: $${(Number(c.campaign_budget.amount_micros)/1e6).toFixed(2)}`)

const perf = await customer.query(`
  SELECT segments.date, metrics.cost_micros, metrics.clicks, metrics.conversions, metrics.conversions_value
  FROM campaign
  WHERE campaign.id = ${c.campaign.id}
    AND segments.date BETWEEN '2026-05-09' AND '2026-05-22'
`)
console.log(`\n14d daily breakdown:`)
console.log('Date       | Day | Spend  | Clk | Conv | Rev    | ROAS')
for (const r of perf.sort((a,b)=>a.segments.date.localeCompare(b.segments.date))) {
  const spend = Number(r.metrics?.cost_micros||0)/1e6
  const clicks = Number(r.metrics?.clicks||0)
  const conv = Number(r.metrics?.conversions||0)
  const value = Number(r.metrics?.conversions_value||0)
  const roas = spend>0 ? (value/spend).toFixed(2)+'x' : '—'
  const dayName = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(r.segments.date).getUTCDay()]
  console.log(`${r.segments.date} | ${dayName} | $${spend.toFixed(0).padStart(5)} | ${String(clicks).padStart(3)} | ${conv.toFixed(1).padStart(4)} | $${value.toFixed(0).padStart(5)} | ${roas}`)
}
process.exit(0)
