import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const c = getGadsCustomer()

console.log(`\n=== WHICH SHARED NEGATIVE LISTS ARE APPLIED TO WHICH CAMPAIGNS ===\n`)

const links = await c.query(`SELECT campaign.id, campaign.name, campaign.status, campaign_shared_set.shared_set, shared_set.name FROM campaign_shared_set`)
const STATUS = {2:'ENABLED',3:'PAUSED',4:'REMOVED'}

const byCamp = new Map()
for (const r of links) {
  const c1 = `${r.campaign?.name} [${STATUS[r.campaign?.status]||r.campaign?.status}]`
  if (!byCamp.has(c1)) byCamp.set(c1, [])
  byCamp.get(c1).push(r.shared_set?.name)
}

for (const [campaign, lists] of byCamp) {
  console.log(`\n${campaign}`)
  for (const l of lists) console.log(`  ← ${l}`)
}

// Also show enabled product-specific PMAX campaigns + their status
console.log(`\n\n=== ALL CAMPAIGN STATUSES ===`)
const all = await c.query(`SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type FROM campaign`)
for (const r of all) {
  console.log(`  [${STATUS[r.campaign?.status]||r.campaign?.status}] ${r.campaign?.advertising_channel_type} | ${r.campaign?.name}`)
}
process.exit(0)
