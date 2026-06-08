/**
 * BRAND DEFENCE — Replace Approved-Limited ads with policy-safe RSAs
 *
 * Strategy: create 2 fresh RSAs with plain factual copy (no superlatives,
 * no unsubstantiated claims, no "huge sale" trigger words). Pause the old
 * Approved-Limited ads. Fresh ads go through new review.
 *
 * Rollback: --rollback re-enables old ads + pauses new ones.
 */
import 'dotenv/config'
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs'
import { getGadsCustomer, getGadsCustomerId } from '../server/lib/gads-client.js'

const customer = getGadsCustomer()
const custId = getGadsCustomerId()
const SNAPSHOT_DIR = 'data/snapshots/brand-defence-new-ads'
mkdirSync(SNAPSHOT_DIR, { recursive: true })
const LOG = `${SNAPSHOT_DIR}/log.json`

const AG_ID = '193897092609'
const ROLLBACK = process.argv.includes('--rollback')

// POLICY-SAFE COPY — plain factual statements only
const HEADLINES = [
  'Gender Reveal Ideas',
  'Australian Gender Reveal Store',
  'Shop Gender Reveal Products',
  'Gender Reveal Cannons',
  'Gender Reveal Bundles',
  'Gender Reveal Smoke Bombs',
  'Reveal Day Products Online',
  'Gold Coast Based Store',
  'Family Owned Business',
  'Australian Owned & Operated',
  'Order Gender Reveal Online',
  'View Our Range Online',
  'Shop Reveal Bundles',
  'Visit Our Online Store',
  'Find Reveal Products Here',
]
const DESCRIPTIONS = [
  'Browse our range of gender reveal cannons, smoke products and party supplies online today.',
  'Family-owned Australian business based on the Gold Coast. Nationwide delivery available.',
  'View our collection of gender reveal products including bundles, cannons and party kits.',
  'Shop the Gender Reveal Ideas online store. Australian owned. Nationwide shipping.',
]
const PATH1 = 'reveal-ideas'
const PATH2 = 'shop'
const FINAL_URL = 'https://genderrevealideas.com.au/'

console.log(`\n=== ${ROLLBACK?'ROLLBACK':'SHIP'} — Brand Defence ad replacement ===\n`)

// 1. Snapshot current ads
console.log('Snapshot existing ads...')
const existing = await customer.query(`SELECT ad_group_ad.ad.id, ad_group_ad.status FROM ad_group_ad WHERE ad_group.id=${AG_ID}`)
const oldAdIds = existing.map(r => r.ad_group_ad?.ad?.id).filter(Boolean)
console.log(`  Found ${oldAdIds.length} existing ads: ${oldAdIds.join(', ')}`)

if (ROLLBACK) {
  if (!existsSync(LOG)) { console.error('No log to rollback'); process.exit(1) }
  const log = JSON.parse(readFileSync(LOG,'utf8'))
  // Pause new ads
  for (const newAdId of log.newAdIds||[]) {
    try {
      await customer.adGroupAds.update([{ resource_name: `customers/${custId}/adGroupAds/${AG_ID}~${newAdId}`, status: 'PAUSED' }])
      console.log(`  ✓ Paused new ad ${newAdId}`)
    } catch (e) { console.log(`  ✗ Pause ${newAdId}: ${e?.errors?.[0]?.message}`) }
  }
  // Re-enable old ads
  for (const oldId of log.oldAdIds||[]) {
    try {
      await customer.adGroupAds.update([{ resource_name: `customers/${custId}/adGroupAds/${AG_ID}~${oldId}`, status: 'ENABLED' }])
      console.log(`  ✓ Re-enabled old ad ${oldId}`)
    } catch (e) { console.log(`  ✗ Enable ${oldId}: ${e?.errors?.[0]?.message}`) }
  }
  console.log('Rollback complete')
  process.exit(0)
}

// 2. Create new ads
console.log('\nCreating 2 new policy-safe RSAs...')
const newAdIds = []
for (let i=0; i<2; i++) {
  // Slightly vary the second ad
  const headlines = i === 0 ? HEADLINES : [...HEADLINES.slice(0,12), 'Australian Reveal Shop', 'Find Your Reveal Today', 'Online Reveal Products']
  const descriptions = DESCRIPTIONS
  try {
    const res = await customer.adGroupAds.create([{
      ad_group: `customers/${custId}/adGroups/${AG_ID}`,
      status: 'ENABLED',
      ad: {
        final_urls: [FINAL_URL],
        responsive_search_ad: {
          headlines: headlines.map(t => ({ text: t })),
          descriptions: descriptions.map(t => ({ text: t })),
          path1: PATH1,
          path2: PATH2,
        },
      },
    }])
    const rn = res?.results?.[0]?.resource_name
    const id = rn?.split('~').pop()
    newAdIds.push(id)
    console.log(`  ✓ Created ad ${id}`)
  } catch (e) {
    console.log(`  ✗ Failed to create ad ${i+1}: ${e?.errors?.[0]?.message || e?.message}`)
  }
  await new Promise(r=>setTimeout(r,600))
}

// 3. Pause old ads
console.log('\nPausing old (Approved-Limited) ads...')
for (const oldId of oldAdIds) {
  try {
    await customer.adGroupAds.update([{
      resource_name: `customers/${custId}/adGroupAds/${AG_ID}~${oldId}`,
      status: 'PAUSED',
    }])
    console.log(`  ✓ Paused old ad ${oldId}`)
  } catch (e) {
    console.log(`  ✗ Pause ${oldId}: ${e?.errors?.[0]?.message}`)
  }
  await new Promise(r=>setTimeout(r,400))
}

// 4. Log
writeFileSync(LOG, JSON.stringify({
  shippedAt: new Date().toISOString(),
  adGroupId: AG_ID,
  oldAdIds, newAdIds,
  rollbackCommand: 'node scripts/brand-defence-new-ads.js --rollback',
}, null, 2))
console.log(`\n✓ Done. Old ads paused: ${oldAdIds.length} | New ads enabled: ${newAdIds.length}`)
console.log(`Rollback: node scripts/brand-defence-new-ads.js --rollback`)
console.log(`\nNew ads enter Google review queue (typically 1-24hrs). Watch impressions tomorrow.`)
process.exit(0)
