/**
 * BRAND DEFENCE AUDIT — read-only
 * Look at ALL campaigns (incl paused/removed) for brand-defence patterns
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const c = getGadsCustomer()

console.log(`\n========== ALL CAMPAIGNS EVER (any status) ==========`)
const camps = await c.query(`
  SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type,
         campaign.advertising_channel_sub_type
  FROM campaign
`)
const brandish = []
for (const r of camps) {
  const name = r.campaign?.name || ''
  if (/brand|defence|defense|gri\s|gender\s*reveal\s*ideas|search|text/i.test(name)) {
    brandish.push(r)
  }
}
console.log(`Total campaigns: ${camps.length} | Brand/Search-pattern: ${brandish.length}`)
console.log(`\n--- BRAND/SEARCH/DEFENCE NAMED CAMPAIGNS ---`)
for (const r of brandish) {
  console.log(`  [${r.campaign?.status}] ${r.campaign?.advertisingChannelType?.padEnd(15)} | ${r.campaign?.name}`)
}
console.log(`\n--- ALL CAMPAIGN NAMES (all statuses) ---`)
for (const r of camps) {
  console.log(`  [${r.campaign?.status?.padEnd(8)}] ${r.campaign?.advertisingChannelType?.padEnd(15)} | ${r.campaign?.name}`)
}

console.log(`\n========== KEYWORDS CONTAINING BRAND TERMS ==========`)
const kws = await c.query(`
  SELECT campaign.name, campaign.status,
         ad_group.name, ad_group.status,
         ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type,
         ad_group_criterion.status, metrics.impressions, metrics.cost_micros
  FROM keyword_view
  WHERE segments.date DURING LAST_30_DAYS
`)
console.log(`Total keywords (30d): ${kws.length}`)
const brandKws = kws.filter(r => /gender\s*reveal\s*ideas|genderrevealideas|gri/i.test(r.adGroupCriterion?.keyword?.text||''))
console.log(`Brand-matching keywords: ${brandKws.length}`)
for (const r of brandKws) {
  const k = r.adGroupCriterion?.keyword
  const imp = Number(r.metrics?.impressions||0)
  const sp = Number(r.metrics?.cost_micros||0)/1e6
  console.log(`  [${r.adGroupCriterion?.status}] [${k?.matchType}] "${k?.text}" → ${imp}imp $${sp.toFixed(0)} | ${r.campaign?.name} > ${r.adGroup?.name}`)
}

// Also pull all enabled keywords on enabled Search campaigns to see what we ARE bidding on
console.log(`\n========== ALL ENABLED SEARCH KEYWORDS (any campaign) ==========`)
const allKws = await c.query(`
  SELECT campaign.name, ad_group.name, ad_group_criterion.keyword.text,
         ad_group_criterion.keyword.match_type, ad_group_criterion.status
  FROM ad_group_criterion
  WHERE ad_group_criterion.type = 'KEYWORD'
    AND ad_group_criterion.status = 'ENABLED'
    AND campaign.status = 'ENABLED'
    AND ad_group.status = 'ENABLED'
`)
console.log(`Total enabled keywords across all enabled Search campaigns: ${allKws.length}`)
for (const r of allKws.slice(0, 50)) {
  const k = r.adGroupCriterion?.keyword
  console.log(`  [${k?.matchType?.padEnd(8)}] "${k?.text?.padEnd(40)}" | ${r.campaign?.name} > ${r.adGroup?.name}`)
}

process.exit(0)
