/**
 * Verify current campaign state — sanity check for the watch plan.
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'

const customer = getGadsCustomer()
const rows = await customer.query(`
  SELECT campaign.id, campaign.name, campaign.status, campaign_budget.amount_micros
  FROM campaign
  WHERE campaign.status IN ('ENABLED', 'PAUSED')
  ORDER BY campaign.name
`)

let dailyTotal = 0
console.log('\n=== CURRENT GOOGLE ADS STATE ===\n')
for (const r of rows) {
  const c = r.campaign
  const budget = Number(r.campaign_budget?.amount_micros || 0) / 1e6
  const statusName = c.status === 2 ? 'ENABLED' : c.status === 3 ? 'PAUSED ' : `STATUS_${c.status}`
  if (c.status === 2) dailyTotal += budget
  console.log(`  [${statusName}] ${c.name.padEnd(45)} $${budget.toFixed(2)}/d`)
}
console.log(`\n  TOTAL ENABLED DAILY: $${dailyTotal.toFixed(2)}\n`)

// Search Cannons network settings
const sc = await customer.query(`
  SELECT campaign.id, campaign.name, campaign.network_settings.target_search_network,
         campaign.network_settings.target_content_network,
         campaign.network_settings.target_google_search,
         campaign.network_settings.target_partner_search_network
  FROM campaign WHERE campaign.id = 21094179575
`)
const ns = sc[0]?.campaign?.network_settings
console.log('--- SEARCH CANNONS NETWORK SETTINGS ---')
console.log(`  Google Search:    ${ns?.target_google_search ? 'ON' : 'OFF'}`)
console.log(`  Search Partners:  ${ns?.target_search_network ? 'ON' : 'OFF'}`)
console.log(`  Display:          ${ns?.target_content_network ? 'ON' : 'OFF'}\n`)

process.exit(0)
