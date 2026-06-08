import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const c = getGadsCustomer()

const STATUS = {2:'ENABLED',3:'PAUSED',4:'REMOVED'}

// Get Brand Defence campaign details
console.log(`\n========== GRI | Search | Brand Defence — FULL CONFIG ==========`)
const camp = await c.query(`
  SELECT campaign.id, campaign.name, campaign.status,
         campaign.bidding_strategy_type, campaign.maximize_conversion_value.target_roas,
         campaign.target_cpa.target_cpa_micros, campaign.manual_cpc.enhanced_cpc_enabled,
         campaign_budget.amount_micros, campaign_budget.name
  FROM campaign
  WHERE campaign.name = 'GRI | Search | Brand Defence'
`)
for (const r of camp) {
  console.log(`  ID: ${r.campaign?.id}`)
  console.log(`  Status: ${STATUS[r.campaign?.status]||r.campaign?.status}`)
  console.log(`  Bidding: ${r.campaign?.biddingStrategyType}`)
  console.log(`  Budget: $${Number(r.campaignBudget?.amountMicros||0)/1e6}/day`)
  console.log(`  tROAS: ${r.campaign?.maximizeConversionValue?.targetRoas}`)
}

const campId = camp[0]?.campaign?.id
if (!campId) { console.log('Campaign not found'); process.exit(0) }

// Ad groups
console.log(`\n--- Ad groups ---`)
const ags = await c.query(`
  SELECT ad_group.id, ad_group.name, ad_group.status, ad_group.cpc_bid_micros
  FROM ad_group
  WHERE campaign.id = ${campId}
`)
for (const r of ags) {
  console.log(`  [${STATUS[r.adGroup?.status]||r.adGroup?.status}] ${r.adGroup?.name} | CPC bid: $${Number(r.adGroup?.cpcBidMicros||0)/1e6}`)
}

// Keywords
console.log(`\n--- Keywords ---`)
const kws = await c.query(`
  SELECT ad_group.name, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type,
         ad_group_criterion.status, ad_group_criterion.negative,
         ad_group_criterion.cpc_bid_micros
  FROM ad_group_criterion
  WHERE campaign.id = ${campId}
    AND ad_group_criterion.type = 'KEYWORD'
`)
for (const r of kws) {
  const k = r.adGroupCriterion?.keyword
  const cpc = Number(r.adGroupCriterion?.cpcBidMicros||0)/1e6
  console.log(`  [${STATUS[r.adGroupCriterion?.status]||r.adGroupCriterion?.status}]${r.adGroupCriterion?.negative?' NEG':''} [${k?.matchType}] "${k?.text}" $${cpc} | ${r.adGroup?.name}`)
}

// Historical performance — when was it last on?
console.log(`\n--- HISTORICAL PERFORMANCE (last 365d) ---`)
const perf = await c.query(`
  SELECT segments.month, metrics.impressions, metrics.clicks, metrics.cost_micros,
         metrics.conversions, metrics.conversions_value
  FROM campaign
  WHERE campaign.id = ${campId}
    AND segments.date DURING LAST_365_DAYS
  ORDER BY segments.month DESC
`)
console.log('Month       | Imp    | Clk   | Spend | Conv | Value | ROAS')
for (const r of perf) {
  const imp = Number(r.metrics?.impressions||0)
  if (imp === 0) continue
  const clk = Number(r.metrics?.clicks||0)
  const sp = Number(r.metrics?.cost_micros||0)/1e6
  const conv = Number(r.metrics?.conversions||0)
  const val = Number(r.metrics?.conversions_value||0)
  const roas = sp ? (val/sp).toFixed(2) : '-'
  console.log(`${(r.segments?.month||'').slice(0,10)} | ${String(imp).padStart(6)} | ${String(clk).padStart(5)} | $${sp.toFixed(0).padStart(4)} | ${conv.toFixed(0).padStart(4)} | $${val.toFixed(0).padStart(4)} | ${roas}x`)
}

// Ads
console.log(`\n--- Ads ---`)
const ads = await c.query(`
  SELECT ad_group.name, ad_group_ad.status, ad_group_ad.ad.responsive_search_ad.headlines,
         ad_group_ad.ad.responsive_search_ad.descriptions, ad_group_ad.ad.final_urls
  FROM ad_group_ad
  WHERE campaign.id = ${campId}
`)
for (const r of ads) {
  const rsa = r.adGroupAd?.ad?.responsiveSearchAd
  console.log(`\n  [${STATUS[r.adGroupAd?.status]||r.adGroupAd?.status}] ${r.adGroup?.name}`)
  console.log(`  URL: ${(r.adGroupAd?.ad?.finalUrls||[]).join(',')}`)
  console.log(`  Headlines: ${(rsa?.headlines||[]).map(h=>h.text).slice(0,5).join(' | ')}`)
  console.log(`  Descriptions: ${(rsa?.descriptions||[]).map(d=>d.text).slice(0,2).join(' | ')}`)
}

process.exit(0)
