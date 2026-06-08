/**
 * Read-only discovery: shared sets, campaigns, existing brand keywords.
 * Tells us what infrastructure exists before we ship the punch list.
 */
import 'dotenv/config'
import { getGadsCustomer, getGadsCustomerId } from '../server/lib/gads-client.js'

const c = getGadsCustomer()
const cid = getGadsCustomerId()

// 1. Shared sets (negative keyword lists)
console.log('\n--- SHARED SETS (negative keyword lists) ---')
const sets = await c.query(`
  SELECT shared_set.id, shared_set.name, shared_set.type, shared_set.status, shared_set.member_count
  FROM shared_set
  WHERE shared_set.status = 'ENABLED'
`)
for (const r of sets) {
  console.log(`  [${r.shared_set?.id}] ${r.shared_set?.name} | type=${r.shared_set?.type} | members=${r.shared_set?.member_count}`)
}

// 2. Which campaigns use which shared sets
console.log('\n--- CAMPAIGN → SHARED SET BINDINGS ---')
const bindings = await c.query(`
  SELECT campaign.name, campaign_shared_set.shared_set, campaign_shared_set.status
  FROM campaign_shared_set
  WHERE campaign_shared_set.status = 'ENABLED'
`)
for (const r of bindings) {
  const ssId = (r.campaign_shared_set?.shared_set || '').split('/').pop()
  console.log(`  ${r.campaign?.name?.padEnd(40)} ← sharedSet ${ssId}`)
}

// 3. Existing brand-defense keywords already? Check for "gender reveal ideas" exact
console.log('\n--- EXISTING BRAND KEYWORDS ("ideas") ---')
const brandKw = await c.query(`
  SELECT campaign.name, ad_group.name, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.status
  FROM keyword_view
  WHERE ad_group_criterion.keyword.text LIKE '%ideas%'
`)
if (!brandKw.length) console.log('  ✗ NONE found — brand is fully unprotected')
for (const r of brandKw) {
  console.log(`  ${r.campaign?.name} → ${r.ad_group?.name} → "${r.ad_group_criterion?.keyword?.text}" [${r.ad_group_criterion?.keyword?.match_type}] ${r.ad_group_criterion?.status}`)
}

// 4. PMAX asset group final URLs — to see if any already use ?v= pins
console.log('\n--- PMAX ASSET GROUPS + FINAL URLS ---')
const ag = await c.query(`
  SELECT asset_group.id, asset_group.name, asset_group.final_urls, asset_group.status, campaign.name
  FROM asset_group
  WHERE asset_group.status != 'REMOVED'
`)
for (const r of ag) {
  console.log(`  [${r.asset_group?.id}] ${r.asset_group?.name} (${r.campaign?.name})`)
  for (const u of r.asset_group?.final_urls || []) {
    console.log(`    final_url: ${u}`)
  }
}

// 5. Bleeder product IDs we're going to exclude — convert Shopify variant IDs to product IDs
console.log('\n--- BLEEDER MAPPING (Shopify product IDs from variant IDs) ---')
const bleeders = [
  { variantId: '40956404858969', shopifyId: '7515546189913', name: 'Gender Reveal Burnout Powder' },
  { variantId: '42111172411481', shopifyId: '7899285848153', name: 'Pokemon Gender Reveal' },
  { variantId: '43006470946905', shopifyId: '8129169260633', name: 'Gender Reveal Ideas Powder Cannon' },
]
for (const b of bleeders) {
  console.log(`  Product ${b.shopifyId} / Variant ${b.variantId} → ${b.name}`)
}

console.log()
process.exit(0)
