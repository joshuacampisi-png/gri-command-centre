/**
 * STANDARD SHOPPING — HEAD QUERY DOMINATION
 * Ships:
 *  1. New campaign budget ($25/day)
 *  2. New Standard Shopping campaign (priority HIGH, manual CPC)
 *  3. Single ad group with 10 product targets (custom_label_4 = "head_query")
 *  4. Negative keywords on 3 PMAX campaigns: [gender reveal ideas] EXACT
 *  5. Snapshot before + activation log
 *
 * NOTE: This script enables a campaign that bids paid Shopping on head queries
 * AND adds negatives to PMAX to prevent double-bidding.
 *
 * Rollback: pause new campaign + remove PMAX negatives (script auto-generates rollback log)
 *
 * PRE-REQ that must be done in Shopify/GMC FIRST (Josh):
 *   Tag these 10 product handles with custom_label_4 = "head_query" via Shopify
 *   metafield "google: custom_label_4" = "head_query":
 *     1. Gender Reveal Cannon & Extinguisher Double Bundle
 *     2. Gender Reveal Smoke Bombs Pink (main)
 *     3. Gender Reveal Smoke Bombs Pink Blue Holi
 *     4. 4x Bundle Pack Gender Reveal Smoke Bombs
 *     5. Gender Reveal Powder Extinguisher | Mini Blaster Pink
 *     6. Gender Reveal Extinguisher | MEGA Powder Blaster Pink
 *     7. Double Gender Reveal Smoke & Cannon Bundle
 *     8. BURNOUT Smoke EXTREME Gender Reveal Burnout Powder
 *     9. The Race Day Reveal Bundle
 *    10. Gender Reveal Powder Cannon BIO XL Bundle 4-pack
 *
 * Once tags are applied (and re-crawled by GMC, ~24h), THIS script attaches them
 * to the Standard Shopping campaign via inventory filter.
 */
import 'dotenv/config'
import { writeFileSync, mkdirSync } from 'fs'
import { getGadsCustomer, getGadsCustomerId } from '../server/lib/gads-client.js'

const customer = getGadsCustomer()
const custId = getGadsCustomerId()

// ============== CONFIG ==============
const CAMPAIGN_NAME = 'GRI Shop | Head Query Domination'
const DAILY_BUDGET_MICROS = 25_000_000  // $25/day
const CAMPAIGN_PRIORITY = 2  // 2 = HIGH (0=low, 1=med, 2=high) — outranks PMAX in internal auction
const SALES_COUNTRY = 'AU'
const MANUAL_CPC_BID_MICROS = 850_000  // $0.85 default ad-group bid (Confettified market $0.66 * 1.3)

const PMAX_CAMPAIGN_IDS = ['21113841118', '21511998936', '22841772135']  // All Products, Cannon&Powder, Bundles

const PMAX_NEGATIVES = [
  { text: 'gender reveal ideas', matchType: 'EXACT' },
  // Add 'gender reveal ideas' PHRASE if you want broader funnel to Standard Shopping
]

const DRY_RUN = process.argv.includes('--ship') ? false : true

console.log(`\n========== STANDARD SHOPPING DOMINATION ${DRY_RUN ? '— DRY RUN' : '— SHIPPING'} ==========\n`)
console.log(`Campaign: ${CAMPAIGN_NAME}`)
console.log(`Budget:   $${DAILY_BUDGET_MICROS/1e6}/day`)
console.log(`Priority: HIGH (outranks PMAX in internal auction)`)
console.log(`Bid:      $${MANUAL_CPC_BID_MICROS/1e6} manual CPC`)
console.log(`PMAX negatives: ${PMAX_NEGATIVES.map(n=>`[${n.text}] ${n.matchType}`).join(', ')}`)
console.log(`PMAX campaigns to add negatives on: ${PMAX_CAMPAIGN_IDS.length}`)
console.log(``)

if (DRY_RUN) {
  console.log(`>>> DRY RUN — no mutations will be sent. Add --ship to execute.\n`)
  process.exit(0)
}

// ============== EXECUTE ==============
mkdirSync('data/snapshots/standard-shopping', { recursive: true })
const log = { startedAt: new Date().toISOString(), actions: [], rollback: { campaignIdToPause: null, pmaxNegativeResourceNames: [] } }

// 1. Get merchant center ID
console.log(`--- Step 1: Resolve Merchant Center ID ---`)
let merchantId = null
try {
  const mc = await customer.query(`SELECT customer.id FROM customer_client WHERE customer_client.merchant_id IS NOT NULL`)
  console.log(`MC link query result: ${JSON.stringify(mc[0])}`)
} catch (e) { console.log(`mc query: ${e?.errors?.[0]?.message}`) }
// Fallback: pull from any existing PMAX listing group
try {
  const mc2 = await customer.query(`SELECT customer.id, customer.descriptive_name FROM customer`)
  console.log(`customer: ${JSON.stringify(mc2[0])}`)
} catch {}
// HARDCODE based on Shopify integration — Josh will confirm
merchantId = process.env.GMC_MERCHANT_ID || null
if (!merchantId) {
  console.log(`\n!! MERCHANT_ID not in env. Set GMC_MERCHANT_ID env var first.`)
  console.log(`   Find it: Merchant Center → Settings → Account Settings → Merchant ID`)
  console.log(`   Then re-run: GMC_MERCHANT_ID=xxx node scripts/standard-shopping-ship.js --ship`)
  process.exit(1)
}
console.log(`  Merchant ID: ${merchantId}`)

// 2. Create campaign budget
console.log(`\n--- Step 2: Create campaign budget ---`)
const budgetRes = await customer.campaignBudgets.create([{
  name: `${CAMPAIGN_NAME} — Budget`,
  amount_micros: DAILY_BUDGET_MICROS,
  delivery_method: 'STANDARD',
  explicitly_shared: false,
}])
const budgetRn = budgetRes?.results?.[0]?.resource_name
console.log(`  ✓ Budget created: ${budgetRn}`)
log.actions.push({ step: 'budget', resource_name: budgetRn })

// 3. Create campaign
console.log(`\n--- Step 3: Create Standard Shopping campaign ---`)
const campRes = await customer.campaigns.create([{
  name: CAMPAIGN_NAME,
  advertising_channel_type: 'SHOPPING',
  status: 'PAUSED',  // start paused, enable after verifying ad groups + listing groups
  campaign_budget: budgetRn,
  manual_cpc: { enhanced_cpc_enabled: false },
  shopping_setting: {
    merchant_id: Number(merchantId),
    sales_country: SALES_COUNTRY,
    campaign_priority: CAMPAIGN_PRIORITY,
    enable_local: false,
  },
  network_settings: {
    target_google_search: true,
    target_search_network: false,
    target_content_network: false,
    target_partner_search_network: false,
  },
}])
const campRn = campRes?.results?.[0]?.resource_name
const newCampId = campRn?.split('/').pop()
log.rollback.campaignIdToPause = newCampId
console.log(`  ✓ Campaign created (PAUSED): ${campRn}`)
log.actions.push({ step: 'campaign', resource_name: campRn, id: newCampId })

// 4. Create ad group
console.log(`\n--- Step 4: Create ad group ---`)
const agRes = await customer.adGroups.create([{
  name: 'Head Queries',
  campaign: campRn,
  type: 'SHOPPING_PRODUCT_ADS',
  status: 'ENABLED',
  cpc_bid_micros: MANUAL_CPC_BID_MICROS,
}])
const agRn = agRes?.results?.[0]?.resource_name
console.log(`  ✓ Ad group: ${agRn}`)
log.actions.push({ step: 'ad_group', resource_name: agRn })

// 5. Create product ad (single product ad serves all inventory)
console.log(`\n--- Step 5: Create product ad ---`)
const adRes = await customer.adGroupAds.create([{
  ad_group: agRn,
  status: 'ENABLED',
  ad: { shopping_product_ad: {} },
}])
console.log(`  ✓ Product ad: ${adRes?.results?.[0]?.resource_name}`)
log.actions.push({ step: 'product_ad', resource_name: adRes?.results?.[0]?.resource_name })

// 6. Create listing group (inventory filter: custom_label_4 = "head_query")
console.log(`\n--- Step 6: Create listing group filter (custom_label_4 = "head_query") ---`)
// Standard Shopping listing groups require: root SUBDIVISION → leaf UNIT(s)
// Root subdivision (catch-all "Everything else")
const rootRes = await customer.adGroupCriteria.create([{
  ad_group: agRn,
  status: 'ENABLED',
  listing_group: {
    type: 'SUBDIVISION',
    case_value: null,  // root
  },
}])
const rootRn = rootRes?.results?.[0]?.resource_name
console.log(`  ✓ Root subdivision: ${rootRn}`)
log.actions.push({ step: 'listing_root', resource_name: rootRn })

// Leaf: custom_label_4 = "head_query" → BIDDABLE
const leafRes = await customer.adGroupCriteria.create([{
  ad_group: agRn,
  status: 'ENABLED',
  cpc_bid_micros: MANUAL_CPC_BID_MICROS,
  listing_group: {
    type: 'UNIT',
    parent_listing_group_info: rootRn,
    case_value: { product_custom_attribute: { index: 'INDEX4', value: 'head_query' } },
  },
}])
console.log(`  ✓ Head-query leaf: ${leafRes?.results?.[0]?.resource_name}`)
log.actions.push({ step: 'listing_leaf', resource_name: leafRes?.results?.[0]?.resource_name })

// "Everything else" leaf → EXCLUDED (so the campaign only serves head-query products)
const excludeRes = await customer.adGroupCriteria.create([{
  ad_group: agRn,
  status: 'ENABLED',
  listing_group: {
    type: 'UNIT',
    parent_listing_group_info: rootRn,
    case_value: { product_custom_attribute: { index: 'INDEX4' } },  // null = "everything else"
  },
  negative: true,
}])
console.log(`  ✓ Everything-else leaf (EXCLUDED): ${excludeRes?.results?.[0]?.resource_name}`)
log.actions.push({ step: 'listing_exclude', resource_name: excludeRes?.results?.[0]?.resource_name })

// 7. Add negative keywords to PMAX campaigns
console.log(`\n--- Step 7: Add PMAX negative keywords ---`)
for (const pmaxId of PMAX_CAMPAIGN_IDS) {
  for (const neg of PMAX_NEGATIVES) {
    try {
      const negRes = await customer.campaignCriteria.create([{
        campaign: `customers/${custId}/campaigns/${pmaxId}`,
        negative: true,
        keyword: { text: neg.text, match_type: neg.matchType },
      }])
      const negRn = negRes?.results?.[0]?.resource_name
      log.rollback.pmaxNegativeResourceNames.push(negRn)
      log.actions.push({ step: 'pmax_negative', pmax_campaign: pmaxId, keyword: neg.text, resource_name: negRn })
      console.log(`  ✓ PMAX ${pmaxId} negative [${neg.text}] EXACT: ${negRn}`)
    } catch (e) {
      const msg = e?.errors?.[0]?.message || e?.message
      console.log(`  ✗ PMAX ${pmaxId} negative [${neg.text}] FAILED: ${msg}`)
      log.actions.push({ step: 'pmax_negative', pmax_campaign: pmaxId, keyword: neg.text, error: msg })
    }
    await new Promise(r => setTimeout(r, 600))
  }
}

// 8. ENABLE the Standard Shopping campaign (final step)
console.log(`\n--- Step 8: ENABLE Standard Shopping campaign ---`)
const enableRes = await customer.campaigns.update([{ resource_name: campRn, status: 'ENABLED' }])
console.log(`  ✓ Campaign ENABLED: ${enableRes?.results?.[0]?.resource_name}`)
log.actions.push({ step: 'campaign_enable', resource_name: campRn })

log.completedAt = new Date().toISOString()
writeFileSync('data/snapshots/standard-shopping/ship-log.json', JSON.stringify(log, null, 2))
console.log(`\n✓ DONE. Log: data/snapshots/standard-shopping/ship-log.json`)
console.log(`\nROLLBACK:`)
console.log(`  1. Pause campaign ${newCampId}`)
console.log(`  2. Remove PMAX negatives: ${log.rollback.pmaxNegativeResourceNames.join(', ')}`)
process.exit(0)
