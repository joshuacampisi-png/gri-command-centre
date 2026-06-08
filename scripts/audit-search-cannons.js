/**
 * Full audit of "GRI | Search | Cannons" campaign:
 *  - campaign settings
 *  - ad groups
 *  - keywords + match types + status
 *  - ads
 *  - negatives (campaign + ad group)
 *  - last 30d search terms it actually triggered on
 *  - last 30d performance per keyword
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'

const customer = getGadsCustomer()
const CAMP_NAME = 'GRI | Search | Cannons'

// 1. Find campaign id
const campRows = await customer.query(`
  SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type,
         campaign.bidding_strategy_type, campaign.target_roas.target_roas,
         campaign.maximize_conversions.target_cpa_micros,
         campaign_budget.amount_micros
  FROM campaign
  WHERE campaign.name = '${CAMP_NAME}'
`)
if (!campRows.length) { console.log('Campaign not found'); process.exit(1) }
const c = campRows[0]
const campId = c.campaign.id
const budget = Number(c.campaign_budget?.amount_micros||0)/1e6
const tROAS = c.campaign?.target_roas?.target_roas
const tCPA  = c.campaign?.maximize_conversions?.target_cpa_micros ? Number(c.campaign.maximize_conversions.target_cpa_micros)/1e6 : null

console.log(`\n=== CAMPAIGN: ${c.campaign.name} (id ${campId}) ===`)
console.log(`Status: ${c.campaign.status} | Channel: ${c.campaign.advertising_channel_type}`)
console.log(`Bidding: ${c.campaign.bidding_strategy_type} | tROAS: ${tROAS||'-'} | tCPA: ${tCPA||'-'}`)
console.log(`Daily budget: $${budget.toFixed(2)}`)
console.log(`Start: ${c.campaign.start_date}`)

// 2. Ad groups
console.log(`\n--- AD GROUPS ---`)
const agRows = await customer.query(`
  SELECT ad_group.id, ad_group.name, ad_group.status, ad_group.cpc_bid_micros
  FROM ad_group WHERE campaign.id = ${campId}
`)
for (const r of agRows) {
  const bid = r.ad_group.cpc_bid_micros ? '$'+(Number(r.ad_group.cpc_bid_micros)/1e6).toFixed(2) : '—'
  console.log(`  [${r.ad_group.status}] ${r.ad_group.name} (id ${r.ad_group.id}) — bid ${bid}`)
}

// 3. Keywords
console.log(`\n--- KEYWORDS (last 30d perf) ---`)
const kwRows = await customer.query(`
  SELECT ad_group.name, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type,
         ad_group_criterion.status, ad_group_criterion.quality_info.quality_score,
         metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value
  FROM keyword_view
  WHERE campaign.id = ${campId}
    AND segments.date DURING LAST_30_DAYS
`)
console.log('AdGroup           | MatchType | QS  | Status   | Keyword                              | Imp  | Clk | Spend  | Conv | Rev')
console.log('-'.repeat(140))
const byKwAgg = new Map()
for (const r of kwRows) {
  const key = `${r.ad_group?.name}|${r.ad_group_criterion?.keyword?.text}|${r.ad_group_criterion?.keyword?.match_type}|${r.ad_group_criterion?.status}|${r.ad_group_criterion?.quality_info?.quality_score||'-'}`
  if (!byKwAgg.has(key)) byKwAgg.set(key, { imp:0,clk:0,spend:0,conv:0,val:0 })
  const a = byKwAgg.get(key)
  a.imp += Number(r.metrics?.impressions||0)
  a.clk += Number(r.metrics?.clicks||0)
  a.spend += Number(r.metrics?.cost_micros||0)/1e6
  a.conv += Number(r.metrics?.conversions||0)
  a.val  += Number(r.metrics?.conversions_value||0)
}
for (const [key, a] of [...byKwAgg.entries()].sort((x,y)=>y[1].spend-x[1].spend)) {
  const [ag, kw, mt, st, qs] = key.split('|')
  console.log(`${(ag||'').slice(0,17).padEnd(17)} | ${(mt||'').padEnd(9)} | ${String(qs).padEnd(3)} | ${(st||'').padEnd(8)} | ${(kw||'').slice(0,36).padEnd(36)} | ${String(a.imp).padStart(4)} | ${String(a.clk).padStart(3)} | $${a.spend.toFixed(0).padStart(5)} | ${a.conv.toFixed(1).padStart(4)} | $${a.val.toFixed(0)}`)
}

// 4. Ads
console.log(`\n--- ADS (RSA) ---`)
const adRows = await customer.query(`
  SELECT ad_group.name, ad_group_ad.ad.id, ad_group_ad.status, ad_group_ad.ad.type,
         ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.ad.responsive_search_ad.descriptions,
         ad_group_ad.ad.final_urls
  FROM ad_group_ad
  WHERE campaign.id = ${campId}
    AND ad_group_ad.status != 'REMOVED'
`)
for (const r of adRows) {
  console.log(`  [${r.ad_group_ad.status}] AdGroup: ${r.ad_group.name} | type: ${r.ad_group_ad.ad.type} | id: ${r.ad_group_ad.ad.id}`)
  const heads = r.ad_group_ad.ad?.responsive_search_ad?.headlines || []
  const descs = r.ad_group_ad.ad?.responsive_search_ad?.descriptions || []
  const urls  = r.ad_group_ad.ad?.final_urls || []
  console.log(`     URL: ${urls.join(', ')}`)
  console.log(`     Headlines (${heads.length}): ${heads.slice(0,5).map(h=>h.text).join(' | ')}${heads.length>5?` ... +${heads.length-5} more`:''}`)
  console.log(`     Descs (${descs.length}): ${descs.slice(0,2).map(d=>d.text?.slice(0,60)).join(' | ')}`)
}

// 5. Campaign-level negatives
console.log(`\n--- CAMPAIGN NEGATIVE KEYWORDS ---`)
const negRows = await customer.query(`
  SELECT campaign_criterion.keyword.text, campaign_criterion.keyword.match_type, campaign_criterion.negative
  FROM campaign_criterion
  WHERE campaign.id = ${campId}
    AND campaign_criterion.type = 'KEYWORD'
    AND campaign_criterion.negative = TRUE
`)
console.log(`Total campaign negatives: ${negRows.length}`)
for (const r of negRows.slice(0,40)) {
  console.log(`  - ${r.campaign_criterion?.keyword?.text} [${r.campaign_criterion?.keyword?.match_type}]`)
}
if (negRows.length > 40) console.log(`  ... +${negRows.length-40} more`)

// 6. Search terms (what users actually typed that triggered ads in last 30d)
console.log(`\n--- TOP 30 SEARCH TERMS (last 30d, what mums actually typed) ---`)
const stRows = await customer.query(`
  SELECT search_term_view.search_term, metrics.impressions, metrics.clicks,
         metrics.cost_micros, metrics.conversions, metrics.conversions_value
  FROM search_term_view
  WHERE campaign.id = ${campId}
    AND segments.date DURING LAST_30_DAYS
`)
const stAgg = new Map()
for (const r of stRows) {
  const t = r.search_term_view?.search_term || ''
  if (!stAgg.has(t)) stAgg.set(t, { imp:0,clk:0,spend:0,conv:0,val:0 })
  const a = stAgg.get(t)
  a.imp += Number(r.metrics?.impressions||0)
  a.clk += Number(r.metrics?.clicks||0)
  a.spend += Number(r.metrics?.cost_micros||0)/1e6
  a.conv += Number(r.metrics?.conversions||0)
  a.val  += Number(r.metrics?.conversions_value||0)
}
console.log(`Total unique search terms triggered: ${stAgg.size}`)
console.log('Search term                                       | Imp  | Clk | Spend  | Conv')
console.log('-'.repeat(100))
for (const [t, a] of [...stAgg.entries()].sort((x,y)=>y[1].spend-x[1].spend).slice(0,30)) {
  console.log(`${t.slice(0,49).padEnd(49)} | ${String(a.imp).padStart(4)} | ${String(a.clk).padStart(3)} | $${a.spend.toFixed(0).padStart(5)} | ${a.conv.toFixed(1)}`)
}

// 7. Diagnose: was "gender reveal cannons" ever a triggered search term?
console.log(`\n--- DIAGNOSTIC: did "gender reveal cannons" ever trigger this campaign? ---`)
const hits = [...stAgg.entries()].filter(([t]) => /gender\s*reveal\s*cannon/i.test(t))
if (hits.length === 0) {
  console.log('❌ NO. "gender reveal cannon(s)" never triggered this campaign in last 30 days.')
} else {
  console.log(`✓ Yes — ${hits.length} variants:`)
  hits.forEach(([t,a]) => console.log(`  • "${t}" — ${a.imp} imp, ${a.clk} clk, $${a.spend.toFixed(2)} spend, ${a.conv} conv`))
}

process.exit(0)
