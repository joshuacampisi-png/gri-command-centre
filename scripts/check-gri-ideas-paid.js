/**
 * Why are we not in PAID Shopping for "gender reveal ideas"?
 * Hypotheses:
 *  1. It's our brand name → PMAX brand exclusion in effect
 *  2. Negative keyword
 *  3. tROAS too tight for low-CVR research query
 *  4. Search Themes excluded
 *  5. Just no impressions on this query in last 30d
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const c = getGadsCustomer()
const fmt = d => d.toISOString().slice(0,10)
const end = fmt(new Date(Date.now()-86400000))
const start = fmt(new Date(Date.now()-30*86400000))

// 1. Search-term data on "gender reveal ideas" across all campaign types
console.log(`\n========== "gender reveal ideas" — ALL CAMPAIGN ACTIVITY 30d ==========\n`)
try {
  const rows = await c.query(`
    SELECT campaign.name, campaign.advertising_channel_type,
           search_term_view.search_term,
           metrics.impressions, metrics.clicks, metrics.cost_micros,
           metrics.conversions, metrics.conversions_value
    FROM search_term_view
    WHERE segments.date BETWEEN '${start}' AND '${end}'
      AND search_term_view.search_term LIKE '%gender reveal ideas%'
  `)
  if (!rows.length) console.log('  ZERO impressions on this query family across ALL campaigns — confirms not bidding')
  for (const r of rows) {
    const imp = Number(r.metrics?.impressions||0)
    const clk = Number(r.metrics?.clicks||0)
    const sp  = Number(r.metrics?.cost_micros||0)/1e6
    const conv = Number(r.metrics?.conversions||0)
    const val = Number(r.metrics?.conversions_value||0)
    console.log(`  [${r.campaign?.advertisingChannelType}] ${r.campaign?.name} | "${r.searchTermView?.searchTerm}" → ${imp}imp ${clk}clk $${sp.toFixed(0)} ${conv.toFixed(0)}c $${val.toFixed(0)}`)
  }
} catch (e) { console.log(`  ERR: ${e.message?.slice(0,100)}`) }

// 2. Brand list / brand exclusions in PMAX
console.log(`\n========== PMAX BRAND EXCLUSIONS ==========`)
try {
  const camps = await c.query(`
    SELECT campaign.id, campaign.name, campaign.brand_guidelines_enabled,
           campaign.advertising_channel_type, campaign.advertising_channel_sub_type
    FROM campaign
    WHERE campaign.advertising_channel_type = 'PERFORMANCE_MAX'
      AND campaign.status = 'ENABLED'
  `)
  for (const r of camps) {
    console.log(`  Campaign: ${r.campaign?.name} (${r.campaign?.id}) | brand_guidelines:${r.campaign?.brandGuidelinesEnabled}`)
  }
  // Check campaign-level negative criteria for brand
  const negs = await c.query(`
    SELECT campaign.name, campaign_criterion.type, campaign_criterion.negative,
           campaign_criterion.keyword.text, campaign_criterion.brand_list.brand_list
    FROM campaign_criterion
    WHERE campaign.status = 'ENABLED'
      AND campaign_criterion.negative = TRUE
  `)
  console.log(`\nNegative criteria on enabled campaigns: ${negs.length}`)
  for (const r of negs.slice(0,30)) {
    const cc = r.campaignCriterion || r.campaign_criterion
    const kw = cc?.keyword?.text || cc?.brandList?.brandList || `[${cc?.type}]`
    if (/idea|brand|gender reveal/i.test(JSON.stringify(cc))) {
      console.log(`  ⚠ ${r.campaign?.name}: ${cc.type} negative → ${JSON.stringify(kw).slice(0,80)}`)
    }
  }
} catch (e) { console.log(`  ERR: ${e.message?.slice(0,100)}`) }

// 3. Account-level negative keyword lists
console.log(`\n========== ACCOUNT-LEVEL NEGATIVE KEYWORD LISTS ==========`)
try {
  const lists = await c.query(`SELECT shared_set.id, shared_set.name, shared_set.type, shared_set.member_count FROM shared_set WHERE shared_set.status = 'ENABLED'`)
  for (const r of lists) {
    console.log(`  ${r.sharedSet?.name} (${r.sharedSet?.type}) — ${r.sharedSet?.memberCount} members`)
  }
  // Search through criteria of negative-keyword type lists for "ideas"
  const items = await c.query(`SELECT shared_set.name, shared_criterion.keyword.text, shared_criterion.keyword.match_type FROM shared_criterion`)
  console.log(`\nShared criteria containing "idea" or "gender reveal":`)
  let found = 0
  for (const r of items) {
    const text = r.sharedCriterion?.keyword?.text || ''
    if (/idea|gender reveal ideas/i.test(text)) {
      console.log(`  ⚠ in "${r.sharedSet?.name}": ${text} [${r.sharedCriterion?.keyword?.matchType}]`)
      found++
    }
  }
  if (!found) console.log('  none found')
} catch (e) { console.log(`  ERR: ${e.message?.slice(0,100)}`) }

// 4. PMAX brand list assets (the actual brand-exclusion mechanism)
console.log(`\n========== PMAX BRAND LIST ASSETS ==========`)
try {
  const bl = await c.query(`
    SELECT campaign.name, asset_set_asset.asset_set, asset_set_asset.asset
    FROM campaign_asset_set
    WHERE campaign.advertising_channel_type = 'PERFORMANCE_MAX'
      AND campaign.status = 'ENABLED'
  `)
  for (const r of bl) console.log(`  ${r.campaign?.name}: asset_set ${JSON.stringify(r).slice(0,150)}`)
  if (!bl.length) console.log('  no PMAX brand list assets found')
} catch (e) { console.log(`  ERR: ${e.message?.slice(0,100)}`) }

process.exit(0)
