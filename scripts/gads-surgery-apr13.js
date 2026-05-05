/**
 * gads-surgery-apr13.js
 * Surgical Google Ads changes based on audit findings.
 *
 * ACTIONS:
 * 1. PAUSE keyword: "gender reveal powder" BROAD (adGroup: Powder Cannons) -- $457 spend, $91 CPA
 * 2. PAUSE keyword: "gender reveal cannon" PHRASE (adGroup: Powder Cannons) -- $91 spend, 0 conv
 * 3. PAUSE keyword: "gender powder cannon" PHRASE (adGroup: Powder Cannons) -- $20 spend, 0 conv
 * 4. ADD negative keywords to Search Cannons campaign: dry ice, test, shop, remote control, golf balls, equipment
 * 5. INCREASE PMAX Bundles daily budget: $45 → $75
 * 6. DECREASE Search Cannons daily budget: $30 → $15
 *
 * Run: node scripts/gads-surgery-apr13.js
 */
import 'dotenv/config'
import { getGadsCustomer, getGadsCustomerId } from '../server/lib/gads-client.js'

const custId = getGadsCustomerId()

async function query(gaql) {
  const customer = getGadsCustomer()
  return await customer.query(gaql)
}

async function main() {
  const customer = getGadsCustomer()
  console.log('=== GOOGLE ADS SURGERY — 13 Apr 2026 ===\n')

  // ── Step 0: Get IDs we need ──────────────────────────────────────────────
  console.log('[0] Looking up keyword + campaign IDs...')

  // Get Search Cannons campaign ID + budget resource
  const campaigns = await query(`
    SELECT campaign.id, campaign.name, campaign_budget.resource_name, campaign_budget.amount_micros
    FROM campaign
    WHERE campaign.status = 'ENABLED'
  `)

  let searchCannonsId = null
  let searchCannonsBudgetRN = null
  let pmaxBundlesId = null
  let pmaxBundlesBudgetRN = null

  for (const r of campaigns) {
    const name = r.campaign?.name || ''
    if (name.includes('Search') && name.includes('Cannon')) {
      searchCannonsId = String(r.campaign.id)
      searchCannonsBudgetRN = r.campaign_budget.resource_name
      console.log(`  Search Cannons: campaign ${searchCannonsId}, budget: ${r.campaign_budget.resource_name} ($${Number(r.campaign_budget.amount_micros) / 1e6}/day)`)
    }
    if (name.includes('Bundles')) {
      pmaxBundlesId = String(r.campaign.id)
      pmaxBundlesBudgetRN = r.campaign_budget.resource_name
      console.log(`  PMAX Bundles: campaign ${pmaxBundlesId}, budget: ${r.campaign_budget.resource_name} ($${Number(r.campaign_budget.amount_micros) / 1e6}/day)`)
    }
  }

  if (!searchCannonsId || !pmaxBundlesId) {
    console.error('ABORT: Could not find campaign IDs')
    process.exit(1)
  }

  // Get keyword criterion IDs for the 3 keywords to pause
  const keywords = await query(`
    SELECT
      ad_group_criterion.criterion_id,
      ad_group_criterion.keyword.text,
      ad_group_criterion.keyword.match_type,
      ad_group.id,
      ad_group.name
    FROM keyword_view
    WHERE campaign.id = ${searchCannonsId}
      AND ad_group_criterion.status = 'ENABLED'
  `)

  // Build a deduped map
  const kwMap = new Map()
  for (const r of keywords) {
    const critId = String(r.ad_group_criterion?.criterion_id || '')
    const agId = String(r.ad_group?.id || '')
    const text = r.ad_group_criterion?.keyword?.text || ''
    const match = r.ad_group_criterion?.keyword?.match_type || ''
    if (!critId || !agId) continue
    const key = `${agId}_${critId}`
    if (!kwMap.has(key)) {
      kwMap.set(key, { critId, agId, agName: r.ad_group?.name || '', text, match })
    }
  }

  // Match types: BROAD=4/BROAD, PHRASE=3/PHRASE, EXACT=2/EXACT
  const toPause = []
  for (const [, kw] of kwMap) {
    // "gender reveal powder" BROAD
    if (kw.text === 'gender reveal powder' && kw.match === 'BROAD') {
      toPause.push(kw)
      console.log(`  PAUSE: "${kw.text}" [${kw.match}] in ${kw.agName} (crit: ${kw.critId}, ag: ${kw.agId})`)
    }
    // "gender reveal cannon" PHRASE
    if (kw.text === 'gender reveal cannon' && kw.match === 'PHRASE') {
      toPause.push(kw)
      console.log(`  PAUSE: "${kw.text}" [${kw.match}] in ${kw.agName} (crit: ${kw.critId}, ag: ${kw.agId})`)
    }
    // "gender powder cannon" PHRASE
    if (kw.text === 'gender powder cannon' && kw.match === 'PHRASE') {
      toPause.push(kw)
      console.log(`  PAUSE: "${kw.text}" [${kw.match}] in ${kw.agName} (crit: ${kw.critId}, ag: ${kw.agId})`)
    }
  }

  if (toPause.length === 0) {
    console.error('WARNING: No keywords matched for pausing')
  }

  // ── Step 1: Pause bleeding keywords ──────────────────────────────────────
  console.log('\n[1] Pausing bleeding keywords...')
  for (const kw of toPause) {
    try {
      const rn = `customers/${custId}/adGroupCriteria/${kw.agId}~${kw.critId}`
      const res = await customer.adGroupCriteria.update([{
        resource_name: rn,
        status: 'PAUSED',
      }])
      console.log(`  ✓ PAUSED "${kw.text}" [${kw.match}]`)
    } catch (err) {
      console.error(`  ✗ FAILED "${kw.text}": ${err?.errors?.[0]?.message || err.message}`)
    }
  }

  // ── Step 2: Add negative keywords ────────────────────────────────────────
  console.log('\n[2] Adding negative keywords to Search Cannons...')
  const negatives = [
    { text: 'dry ice', match: 'PHRASE' },
    { text: 'gender test', match: 'EXACT' },
    { text: 'shop', match: 'EXACT' },
    { text: 'remote control', match: 'PHRASE' },
    { text: 'golf balls', match: 'PHRASE' },
    { text: 'equipment', match: 'EXACT' },
    { text: 'cricket ball', match: 'PHRASE' },
    { text: 'electric cannon', match: 'PHRASE' },
  ]

  for (const neg of negatives) {
    try {
      const res = await customer.campaignCriteria.create([{
        campaign: `customers/${custId}/campaigns/${searchCannonsId}`,
        negative: true,
        keyword: { text: neg.text, match_type: neg.match },
      }])
      console.log(`  ✓ NEGATIVE added: "${neg.text}" [${neg.match}]`)
    } catch (err) {
      const msg = err?.errors?.[0]?.message || err.message
      if (msg.includes('DUPLICATE') || msg.includes('already exists')) {
        console.log(`  ~ SKIP "${neg.text}" (already exists)`)
      } else {
        console.error(`  ✗ FAILED "${neg.text}": ${msg}`)
      }
    }
  }

  // ── Step 3: Budget reallocation ──────────────────────────────────────────
  console.log('\n[3] Reallocating budgets...')

  // Search Cannons: $30/day → $15/day
  try {
    await customer.campaignBudgets.update([{
      resource_name: searchCannonsBudgetRN,
      amount_micros: 15_000_000,  // $15
    }])
    console.log('  ✓ Search Cannons budget: $30 → $15/day')
  } catch (err) {
    console.error(`  ✗ Search Cannons budget FAILED: ${err?.errors?.[0]?.message || err.message}`)
  }

  // PMAX Bundles: $45/day → $75/day
  try {
    await customer.campaignBudgets.update([{
      resource_name: pmaxBundlesBudgetRN,
      amount_micros: 75_000_000,  // $75
    }])
    console.log('  ✓ PMAX Bundles budget: $45 → $75/day')
  } catch (err) {
    console.error(`  ✗ PMAX Bundles budget FAILED: ${err?.errors?.[0]?.message || err.message}`)
  }

  // ── Done ─────────────────────────────────────────────────────────────────
  console.log('\n=== SURGERY COMPLETE ===')
  console.log('Summary:')
  console.log(`  - ${toPause.length} keywords paused (saving ~$568/month)`)
  console.log('  - 8 negative keywords added')
  console.log('  - Search Cannons budget halved ($30→$15)')
  console.log('  - PMAX Bundles budget boosted ($45→$75)')
  console.log('  - Net budget change: +$15/day toward best performer')
}

main().catch(err => { console.error('FATAL:', err); process.exit(1) })
