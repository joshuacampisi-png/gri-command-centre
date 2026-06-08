import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const c = getGadsCustomer()
const CAMP_ID = 23425232813

console.log('\n=== BRAND DEFENCE DIAGNOSTIC ===\n')

// Check ad policy status
const ads = await c.query(`SELECT ad_group.name, ad_group_ad.status, ad_group_ad.policy_summary.review_status, ad_group_ad.policy_summary.approval_status, ad_group_ad.policy_summary.policy_topic_entries FROM ad_group_ad WHERE campaign.id=${CAMP_ID}`)
for (const r of ads) {
  console.log('Ad status:', JSON.stringify({status:r.ad_group_ad?.status, review:r.ad_group_ad?.policy_summary?.review_status, approval:r.ad_group_ad?.policy_summary?.approval_status, topics: r.ad_group_ad?.policy_summary?.policy_topic_entries?.length}, null, 2))
}

// Check campaign bid strategy detail
const camp = await c.query(`SELECT campaign.name, campaign.status, campaign.bidding_strategy_type, campaign.target_impression_share.location, campaign.target_impression_share.location_fraction_micros, campaign.target_impression_share.cpc_bid_ceiling_micros, campaign_budget.amount_micros FROM campaign WHERE campaign.id=${CAMP_ID}`)
for (const r of camp) {
  console.log('\nCampaign config:')
  console.log(JSON.stringify(r, null, 2))
}

// Check keyword statuses
const kws = await c.query(`SELECT ad_group_criterion.keyword.text, ad_group_criterion.status, ad_group_criterion.approval_status FROM ad_group_criterion WHERE campaign.id=${CAMP_ID} AND ad_group_criterion.type='KEYWORD'`)
console.log('\nKeywords:')
for (const r of kws) console.log(`  status:${r.ad_group_criterion?.status} approval:${r.ad_group_criterion?.approval_status} "${r.ad_group_criterion?.keyword?.text}"`)

// Check impressions over last 7 days (might be serving prior week)
const start = new Date(Date.now()-7*86400000).toISOString().slice(0,10)
const end = new Date().toISOString().slice(0,10)
const perf = await c.query(`SELECT segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros FROM campaign WHERE campaign.id=${CAMP_ID} AND segments.date BETWEEN '${start}' AND '${end}'`)
console.log('\n7-day daily activity:')
for (const r of perf) console.log(`  ${r.segments?.date}: ${r.metrics?.impressions||0}imp ${r.metrics?.clicks||0}clk $${(Number(r.metrics?.cost_micros||0)/1e6).toFixed(2)}`)
process.exit(0)
