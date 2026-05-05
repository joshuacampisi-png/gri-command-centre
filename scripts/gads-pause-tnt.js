/**
 * Pause GRI PMAX | TNT Hire — 30d ROAS 0.01x, framework kill decision
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'

const customer = getGadsCustomer()
const CAMPAIGN_ID = 22941692140

// Verify before
const before = await customer.query(`
  SELECT campaign.id, campaign.name, campaign.status
  FROM campaign WHERE campaign.id = ${CAMPAIGN_ID}
`)
console.log('BEFORE:', before[0]?.campaign)

await customer.campaigns.update([{
  resource_name: `customers/9431746480/campaigns/${CAMPAIGN_ID}`,
  status: 3, // PAUSED
}])

const after = await customer.query(`
  SELECT campaign.id, campaign.name, campaign.status
  FROM campaign WHERE campaign.id = ${CAMPAIGN_ID}
`)
console.log('AFTER:', after[0]?.campaign)
console.log('\n✅ TNT Hire PAUSED. $15/day saved.')
process.exit(0)
