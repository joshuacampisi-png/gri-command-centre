import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const c = getGadsCustomer()
const r = await c.query(`SELECT campaign.id, campaign.name, campaign.status, campaign.bidding_strategy_type, campaign_budget.id, campaign_budget.name, campaign_budget.amount_micros, campaign_budget.explicitly_shared, campaign.maximize_conversion_value.target_roas FROM campaign WHERE campaign.id=22841772135`)
console.log(JSON.stringify(r[0], null, 2))
