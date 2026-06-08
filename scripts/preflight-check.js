/**
 * PRE-FLIGHT — cross-reference current state before tightening
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const c = getGadsCustomer()
const end = new Date().toISOString().slice(0,10)
const start = new Date(Date.now()-30*86400000).toISOString().slice(0,10)
const PMAX_IDS = ['21113841118','21511998936','22841772135']
const NAMES = {'21113841118':'All Products','21511998936':'Cannon & Powder','22841772135':'Bundles'}

console.log(`\n=== CURRENT PMAX STATE (${start} → ${end}) ===\n`)
console.log('Campaign           | Bid Strategy           | Current tROAS | 30d Spend | 30d Revenue | 30d ROAS | Daily $')
console.log('-------------------+------------------------+---------------+-----------+-------------+----------+--------')
for (const id of PMAX_IDS) {
  const camp = await c.query(`SELECT campaign.name, campaign.bidding_strategy_type, campaign.maximize_conversion_value.target_roas, campaign_budget.amount_micros FROM campaign WHERE campaign.id=${id}`)
  const c0 = camp[0]
  const bidType = c0?.campaign?.bidding_strategy_type
  const tROAS = c0?.campaign?.maximize_conversion_value?.target_roas
  const budget = Number(c0?.campaign_budget?.amount_micros||0)/1e6

  const m = await c.query(`SELECT metrics.cost_micros, metrics.conversions_value FROM campaign WHERE campaign.id=${id} AND segments.date BETWEEN '${start}' AND '${end}'`)
  let sp=0,val=0
  for (const r of m) { sp+=Number(r.metrics?.cost_micros||0)/1e6; val+=Number(r.metrics?.conversions_value||0) }
  const roas = sp?(val/sp).toFixed(2):'-'
  const dailyAvg = (sp/30).toFixed(0)
  const bidName = bidType===10?'MAX_CONV_VALUE':bidType===8?'MAX_CONV':String(bidType)
  console.log(`${NAMES[id].padEnd(18)} | ${bidName.padEnd(22)} | ${(tROAS||'(cleared)').toString().padStart(13)} | $${sp.toFixed(0).padStart(8)} | $${val.toFixed(0).padStart(10)} | ${roas.padStart(7)}x | $${dailyAvg.padStart(5)}`)
}
process.exit(0)
