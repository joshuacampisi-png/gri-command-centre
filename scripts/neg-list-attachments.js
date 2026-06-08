/**
 * Map shared negative lists → attached campaigns
 * Plus search-term diagnostic: how many queries are getting blocked
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const c = getGadsCustomer()

console.log('\n=== SHARED LIST → CAMPAIGN ATTACHMENTS ===\n')
const links = await c.query(`
  SELECT campaign.name, campaign.status, shared_set.name, shared_set.id, shared_set.type
  FROM campaign_shared_set
  WHERE campaign.status = 'ENABLED'
`)
const byList = new Map()
for (const r of links) {
  const list = r.shared_set?.name || '?'
  if (!byList.has(list)) byList.set(list, [])
  byList.get(list).push(r.campaign?.name)
}
for (const [list, camps] of byList) {
  console.log(`[${list}]`)
  for (const cn of camps) console.log(`   → ${cn}`)
  console.log('')
}

// Reverse view — per campaign, what lists are attached
console.log('\n=== PER-CAMPAIGN ATTACHED LISTS ===\n')
const byCamp = new Map()
for (const r of links) {
  const cn = r.campaign?.name || '?'
  if (!byCamp.has(cn)) byCamp.set(cn, [])
  byCamp.get(cn).push(r.shared_set?.name)
}
for (const [cn, lists] of byCamp) {
  console.log(`[${cn}]`)
  for (const l of lists) console.log(`   ← ${l}`)
  console.log('')
}
process.exit(0)
