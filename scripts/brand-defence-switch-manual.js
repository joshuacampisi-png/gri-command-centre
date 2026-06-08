/**
 * Switch Brand Defence bid strategy from TIS (broken) to Manual CPC.
 * Set ad group CPC bid to $1.50 (above market $0.66 for brand).
 */
import 'dotenv/config'
import { getGadsCustomer, getGadsCustomerId } from '../server/lib/gads-client.js'
const customer = getGadsCustomer()
const custId = getGadsCustomerId()
const CAMP_ID = '23425232813'
const AG_ID = '193897092609'

console.log('\n=== Switch Brand Defence to Manual CPC ===\n')

// Step 1: Switch campaign bidding strategy to Manual CPC
try {
  const res = await customer.campaigns.update([{
    resource_name: `customers/${custId}/campaigns/${CAMP_ID}`,
    manual_cpc: { enhanced_cpc_enabled: false },
  }])
  console.log('✓ Campaign switched to Manual CPC:', res?.results?.[0]?.resource_name)
} catch (e) {
  console.error('✗ Campaign update failed:', e?.errors?.[0]?.message || e?.message)
  process.exit(1)
}

// Step 2: Set ad group CPC bid
try {
  const res = await customer.adGroups.update([{
    resource_name: `customers/${custId}/adGroups/${AG_ID}`,
    cpc_bid_micros: 1_500_000,
  }])
  console.log('✓ Ad group CPC bid set to $1.50:', res?.results?.[0]?.resource_name)
} catch (e) {
  console.error('✗ Ad group update failed:', e?.errors?.[0]?.message || e?.message)
  process.exit(1)
}

// Verify
const v = await customer.query(`SELECT campaign.bidding_strategy_type, campaign.manual_cpc.enhanced_cpc_enabled FROM campaign WHERE campaign.id=${CAMP_ID}`)
const vAg = await customer.query(`SELECT ad_group.cpc_bid_micros FROM ad_group WHERE ad_group.id=${AG_ID}`)
console.log('\nVERIFY:')
console.log('  Campaign:', JSON.stringify(v[0], null, 2))
console.log('  Ad group bid: $' + Number(vAg[0]?.ad_group?.cpc_bid_micros||0)/1e6)
process.exit(0)
