/**
 * BRAND DEFENCE TIS CONFIG FIX
 *
 * Issue: Campaign uses Target Impression Share bidding (type 11) but
 * target_impression_share fields are unset → algorithm bids nothing → 0 impressions.
 *
 * Fix:
 *   location              = ABSOLUTE_TOP_OF_PAGE (rank 1) — for brand defence
 *   location_fraction     = 80% (0.80)
 *   cpc_bid_ceiling       = $3 (above $0.66 market by 4x — safe for brand)
 *
 * Budget cap = $10/day. Worst case if config still doesn't serve: $0 spend.
 *
 * Rollback: --rollback restores TIS to unset (back to broken state — not useful)
 *           OR pause the campaign (preferred rollback).
 */
import 'dotenv/config'
import { writeFileSync, mkdirSync } from 'fs'
import { getGadsCustomer, getGadsCustomerId } from '../server/lib/gads-client.js'

const customer = getGadsCustomer()
const custId = getGadsCustomerId()
const CAMP_ID = '23425232813'
const SNAPSHOT_DIR = 'data/snapshots/brand-defence-tis-fix'
mkdirSync(SNAPSHOT_DIR, { recursive: true })

const DRY_RUN = !process.argv.includes('--ship')

console.log(`\n=== ${DRY_RUN?'DRY RUN':'SHIPPING'} — Brand Defence TIS fix ===\n`)

// Snapshot current state
const before = await customer.query(`
  SELECT campaign.name, campaign.status, campaign.bidding_strategy_type,
         campaign.target_impression_share.location,
         campaign.target_impression_share.location_fraction_micros,
         campaign.target_impression_share.cpc_bid_ceiling_micros
  FROM campaign WHERE campaign.id = ${CAMP_ID}
`)
console.log('BEFORE:', JSON.stringify(before[0], null, 2))
writeFileSync(`${SNAPSHOT_DIR}/before.json`, JSON.stringify({ takenAt:new Date().toISOString(), state: before[0] }, null, 2))

if (DRY_RUN) {
  console.log(`\nPROPOSED MUTATION:`)
  console.log(`  target_impression_share.location = ABSOLUTE_TOP_OF_PAGE`)
  console.log(`  target_impression_share.location_fraction_micros = 800_000_000 (80%)`)
  console.log(`  target_impression_share.cpc_bid_ceiling_micros   = 3_000_000 ($3.00)`)
  console.log(`\nDRY RUN — re-run with --ship to execute.`)
  process.exit(0)
}

try {
  const res = await customer.campaigns.update([{
    resource_name: `customers/${custId}/campaigns/${CAMP_ID}`,
    target_impression_share: {
      location: 'ABSOLUTE_TOP_OF_PAGE',
      location_fraction_micros: 500_000_000,
      cpc_bid_ceiling_micros: 1_500_000,
    },
  }])
  console.log(`\n✓ TIS config updated: ${res?.results?.[0]?.resource_name}`)
} catch (e) {
  console.error(`\n✗ FAILED: ${e?.errors?.[0]?.message || e?.message}`)
  process.exit(1)
}

// Verify
const after = await customer.query(`
  SELECT campaign.target_impression_share.location,
         campaign.target_impression_share.location_fraction_micros,
         campaign.target_impression_share.cpc_bid_ceiling_micros
  FROM campaign WHERE campaign.id = ${CAMP_ID}
`)
console.log(`\nAFTER: ${JSON.stringify(after[0], null, 2)}`)
writeFileSync(`${SNAPSHOT_DIR}/after.json`, JSON.stringify({ takenAt:new Date().toISOString(), state: after[0] }, null, 2))

console.log(`\nExpected: ads start serving on brand queries within 1-3 hours.`)
console.log(`Watch: re-run today-tracking.js in 2 hours to confirm impressions > 0.`)
process.exit(0)
