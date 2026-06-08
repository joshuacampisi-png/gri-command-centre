/**
 * DEEP DIAGNOSTIC — why is Brand Defence still 0 impressions
 * after Manual CPC switch yesterday?
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const c = getGadsCustomer()
const CAMP = 23425232813
const AG = 193897092609

console.log(`\n=== BRAND DEFENCE FULL DIAGNOSTIC ===\n`)

// 1. Campaign state
console.log('--- 1. CAMPAIGN ---')
const camp = await c.query(`SELECT campaign.id, campaign.name, campaign.status, campaign.serving_status, campaign.bidding_strategy_type, campaign.manual_cpc.enhanced_cpc_enabled, campaign_budget.amount_micros, campaign.network_settings.target_google_search, campaign.network_settings.target_search_network, campaign.network_settings.target_content_network FROM campaign WHERE campaign.id=${CAMP}`)
console.log(JSON.stringify(camp[0], null, 2))

// 2. Ad group state
console.log('\n--- 2. AD GROUP ---')
const ag = await c.query(`SELECT ad_group.id, ad_group.name, ad_group.status, ad_group.cpc_bid_micros FROM ad_group WHERE ad_group.id=${AG}`)
console.log(JSON.stringify(ag[0], null, 2))

// 3. Ads + policy
console.log('\n--- 3. ADS + POLICY DETAILS ---')
const ads = await c.query(`SELECT ad_group_ad.ad.id, ad_group_ad.status, ad_group_ad.policy_summary.review_status, ad_group_ad.policy_summary.approval_status, ad_group_ad.policy_summary.policy_topic_entries, ad_group_ad.ad.responsive_search_ad.path1, ad_group_ad.ad.responsive_search_ad.path2 FROM ad_group_ad WHERE ad_group.id=${AG}`)
for (const r of ads) {
  console.log(JSON.stringify(r.ad_group_ad, null, 2).slice(0,2000))
}

// 4. Keywords + approval per keyword
console.log('\n--- 4. KEYWORDS ---')
const kw = await c.query(`SELECT ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.status, ad_group_criterion.approval_status, ad_group_criterion.cpc_bid_micros, ad_group_criterion.quality_info.quality_score FROM ad_group_criterion WHERE ad_group.id=${AG} AND ad_group_criterion.type='KEYWORD'`)
for (const r of kw) {
  console.log(`  [status=${r.ad_group_criterion?.status}] [approval=${r.ad_group_criterion?.approval_status}] [match=${r.ad_group_criterion?.keyword?.match_type}] "${r.ad_group_criterion?.keyword?.text}" | bid=$${(Number(r.ad_group_criterion?.cpc_bid_micros||0)/1e6).toFixed(2)} | QS=${r.ad_group_criterion?.quality_info?.quality_score||'-'}`)
}

// 5. Recent impressions (any?)
console.log('\n--- 5. IMPRESSIONS LAST 7 DAYS ---')
const imp = await c.query(`SELECT segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.search_impression_share FROM campaign WHERE campaign.id=${CAMP} AND segments.date BETWEEN '${new Date(Date.now()-7*86400000).toISOString().slice(0,10)}' AND '${new Date().toISOString().slice(0,10)}'`)
for (const r of imp) {
  console.log(`  ${r.segments?.date}: ${r.metrics?.impressions||0}imp ${r.metrics?.clicks||0}clk $${(Number(r.metrics?.cost_micros||0)/1e6).toFixed(2)} IS=${r.metrics?.search_impression_share!=null?(Number(r.metrics.search_impression_share)*100).toFixed(0)+'%':'n/a'}`)
}

// 6. Auction insights — can we see lost IS reasons?
console.log('\n--- 6. SEARCH IS LOSS REASONS ---')
try {
  const loss = await c.query(`SELECT campaign.id, metrics.search_budget_lost_impression_share, metrics.search_rank_lost_impression_share, metrics.search_exact_match_impression_share FROM campaign WHERE campaign.id=${CAMP} AND segments.date BETWEEN '${new Date(Date.now()-7*86400000).toISOString().slice(0,10)}' AND '${new Date().toISOString().slice(0,10)}'`)
  for (const r of loss) {
    if (r.metrics?.search_budget_lost_impression_share != null || r.metrics?.search_rank_lost_impression_share != null) {
      console.log(`  Budget-lost IS: ${(Number(r.metrics?.search_budget_lost_impression_share||0)*100).toFixed(0)}% | Rank-lost IS: ${(Number(r.metrics?.search_rank_lost_impression_share||0)*100).toFixed(0)}% | Exact-match IS: ${(Number(r.metrics?.search_exact_match_impression_share||0)*100).toFixed(0)}%`)
      break
    }
  }
} catch(e) { console.log(`  ERR: ${e?.errors?.[0]?.message?.slice(0,120)}`) }
process.exit(0)
