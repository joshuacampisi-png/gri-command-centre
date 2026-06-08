import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const c = getGadsCustomer()
const STATUS = {2:'ENABLED',3:'PAUSED',4:'REMOVED'}
const CAMP_ID = 23425232813

// Use raw inspection to see what fields actually come back
const camp = await c.query(`SELECT campaign.id, campaign.name, campaign.status, campaign.bidding_strategy_type, campaign_budget.amount_micros FROM campaign WHERE campaign.id = ${CAMP_ID}`)
console.log('CAMP RAW:', JSON.stringify(camp[0],null,2))

const ags = await c.query(`SELECT ad_group.id, ad_group.name, ad_group.status FROM ad_group WHERE campaign.id = ${CAMP_ID}`)
console.log('\nAD GROUPS:')
for (const r of ags) console.log(JSON.stringify(r,null,2))

const kws = await c.query(`SELECT ad_group.name, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.status, ad_group_criterion.negative FROM ad_group_criterion WHERE campaign.id = ${CAMP_ID} AND ad_group_criterion.type = 'KEYWORD'`)
console.log('\nKEYWORDS:')
for (const r of kws) console.log(JSON.stringify(r,null,2))

const ads = await c.query(`SELECT ad_group.name, ad_group_ad.status, ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.ad.responsive_search_ad.descriptions, ad_group_ad.ad.final_urls FROM ad_group_ad WHERE campaign.id = ${CAMP_ID}`)
console.log('\nADS:')
for (const r of ads) console.log(JSON.stringify(r,null,2))

// Historical with explicit dates
const end = new Date().toISOString().slice(0,10)
const start = new Date(Date.now()-365*86400000).toISOString().slice(0,10)
const perf = await c.query(`SELECT segments.month, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM campaign WHERE campaign.id = ${CAMP_ID} AND segments.date BETWEEN '${start}' AND '${end}'`)
console.log('\nHISTORICAL PERFORMANCE:')
for (const r of perf) {
  const imp = Number(r.metrics?.impressions||0)
  if (imp===0) continue
  console.log(JSON.stringify(r,null,2))
}
