/**
 * Brand Defence — actual state check
 * 1. Campaign settings (budget, bid strategy)
 * 2. Active positive keywords (what is this campaign actually defending?)
 * 3. Search terms last 90d (what queries trigger it?)
 * 4. Auction insights (who else is bidding?)
 * 5. SIS metrics broken down
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const c = getGadsCustomer()
const MT = {2:'EXACT',3:'PHRASE',4:'BROAD'}
const pct = n => n==null?'—':(Number(n)*100).toFixed(1)+'%'

console.log('\n=== BRAND DEFENCE — TRUTH CHECK ===\n')

// 1. Campaign settings
const camps = await c.query(`
  SELECT campaign.id, campaign.name, campaign.status, campaign.bidding_strategy_type,
         campaign.target_impression_share.location, campaign.target_impression_share.location_fraction_micros,
         campaign.target_impression_share.cpc_bid_ceiling_micros,
         campaign_budget.amount_micros
  FROM campaign
  WHERE campaign.name = 'GRI | Search | Brand Defence'
`)
for (const r of camps) {
  console.log(`Campaign: ${r.campaign?.name}`)
  console.log(`  Status:        ${r.campaign?.status}`)
  console.log(`  Bid strategy:  ${r.campaign?.bidding_strategy_type}`)
  console.log(`  TIS location:  ${r.campaign?.target_impression_share?.location}`)
  console.log(`  TIS target:    ${pct(Number(r.campaign?.target_impression_share?.location_fraction_micros||0)/1e6)}`)
  console.log(`  CPC ceiling:   $${Number(r.campaign?.target_impression_share?.cpc_bid_ceiling_micros||0)/1e6}`)
  console.log(`  Daily budget:  $${Number(r.campaign_budget?.amount_micros||0)/1e6}`)
}

// 2. Positive keywords
console.log('\n--- Positive keywords (last 30d performance) ---')
const kw = await c.query(`
  SELECT ad_group.name, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type,
         ad_group_criterion.status, metrics.impressions, metrics.clicks, metrics.cost_micros,
         metrics.conversions, metrics.conversions_value
  FROM keyword_view
  WHERE campaign.name = 'GRI | Search | Brand Defence'
    AND ad_group_criterion.negative = FALSE
    AND segments.date DURING LAST_30_DAYS
  ORDER BY metrics.impressions DESC
`)
console.log('AdGroup | Keyword [match] | Imp | Clk | Spend | Conv | Rev')
console.log('-'.repeat(110))
const seen = new Set()
for (const r of kw) {
  const text = r.ad_group_criterion?.keyword?.text
  const mt = MT[r.ad_group_criterion?.keyword?.match_type] || '?'
  const key = `${text}|${mt}|${r.ad_group?.name}`
  if (seen.has(key)) continue
  seen.add(key)
  const imp = Number(r.metrics?.impressions||0)
  const clk = Number(r.metrics?.clicks||0)
  const spend = Number(r.metrics?.cost_micros||0)/1e6
  const conv = Number(r.metrics?.conversions||0)
  const val = Number(r.metrics?.conversions_value||0)
  console.log(`${r.ad_group?.name?.slice(0,20).padEnd(20)} | "${text?.slice(0,35).padEnd(35)}" [${mt.padEnd(6)}] | ${String(imp).padStart(5)} | ${String(clk).padStart(3)} | $${spend.toFixed(0).padStart(4)} | ${conv.toFixed(1).padStart(4)} | $${val.toFixed(0).padStart(5)}`)
}

// 3. Search terms triggering Brand Defence (last 30d)
console.log('\n--- Search terms triggering Brand Defence (last 30d, ≥3 imp) ---')
const st = await c.query(`
  SELECT search_term_view.search_term, metrics.impressions, metrics.clicks,
         metrics.cost_micros, metrics.conversions, metrics.conversions_value
  FROM search_term_view
  WHERE campaign.name = 'GRI | Search | Brand Defence'
    AND segments.date DURING LAST_30_DAYS
    AND metrics.impressions >= 3
  ORDER BY metrics.impressions DESC
`)
console.log('Search term | Imp | Clk | Spend | Conv | Rev')
console.log('-'.repeat(95))
for (const r of st) {
  const term = r.search_term_view?.search_term
  const imp = Number(r.metrics?.impressions||0)
  const clk = Number(r.metrics?.clicks||0)
  const spend = Number(r.metrics?.cost_micros||0)/1e6
  const conv = Number(r.metrics?.conversions||0)
  const val = Number(r.metrics?.conversions_value||0)
  console.log(`"${term?.slice(0,55).padEnd(55)}" | ${String(imp).padStart(4)} | ${String(clk).padStart(3)} | $${spend.toFixed(0).padStart(4)} | ${conv.toFixed(1).padStart(4)} | $${val.toFixed(0).padStart(5)}`)
}

// 4. Auction insights
console.log('\n--- Auction insights: who else is bidding on brand queries (last 30d) ---')
try {
  const ai = await c.query(`
    SELECT ad_group.name, segments.auction_insight_domain,
           metrics.search_impression_share, metrics.search_top_impression_share,
           metrics.search_overlap_rate, metrics.search_outranking_share,
           metrics.search_rank_lost_impression_share
    FROM ad_group_audience_view
    WHERE campaign.name = 'GRI | Search | Brand Defence'
      AND segments.date DURING LAST_30_DAYS
  `)
  console.log('  (ad_group_audience_view not supported for auction insights; trying campaign-level)')
} catch(e) {
  // fallback - the dedicated auction_insight reports
}

try {
  const ai2 = await c.query(`
    SELECT segments.auction_insight_domain,
           metrics.search_impression_share, metrics.search_top_impression_share,
           metrics.search_overlap_rate, metrics.search_outranking_share,
           metrics.search_rank_lost_impression_share,
           metrics.search_absolute_top_impression_percentage
    FROM campaign_audience_view
    WHERE campaign.name = 'GRI | Search | Brand Defence'
      AND segments.date DURING LAST_30_DAYS
  `)
  for (const r of ai2.slice(0,15)) {
    console.log(`  ${r.segments?.auction_insight_domain?.padEnd(35)} | SIS:${pct(r.metrics?.search_impression_share)} | Overlap:${pct(r.metrics?.search_overlap_rate)} | TopOf:${pct(r.metrics?.search_top_impression_share)}`)
  }
  if (!ai2.length) console.log('  (no auction insight data — possibly suppressed for low-volume campaign)')
} catch(e) {
  console.log('  err:', e.errors?.[0]?.message?.slice(0,200) || e.message?.slice(0,200))
}

// 5. 90-day spend + Lost breakdown
console.log('\n--- 90-day Brand Defence aggregate ---')
const agg = await c.query(`
  SELECT metrics.impressions, metrics.clicks, metrics.cost_micros,
         metrics.conversions, metrics.conversions_value,
         metrics.search_impression_share, metrics.search_budget_lost_impression_share,
         metrics.search_rank_lost_impression_share, metrics.search_top_impression_share,
         metrics.search_absolute_top_impression_share, segments.date
  FROM campaign
  WHERE campaign.name = 'GRI | Search | Brand Defence'
    AND segments.date BETWEEN '2026-02-27' AND '2026-05-27'
`)
let totImp=0, totClk=0, totSpend=0, totConv=0, totVal=0
const isList=[], lbList=[], lrList=[], topList=[], absList=[]
for (const r of agg) {
  totImp += Number(r.metrics?.impressions||0)
  totClk += Number(r.metrics?.clicks||0)
  totSpend += Number(r.metrics?.cost_micros||0)/1e6
  totConv += Number(r.metrics?.conversions||0)
  totVal += Number(r.metrics?.conversions_value||0)
  if (r.metrics?.search_impression_share!=null) isList.push(Number(r.metrics.search_impression_share))
  if (r.metrics?.search_budget_lost_impression_share!=null) lbList.push(Number(r.metrics.search_budget_lost_impression_share))
  if (r.metrics?.search_rank_lost_impression_share!=null) lrList.push(Number(r.metrics.search_rank_lost_impression_share))
  if (r.metrics?.search_top_impression_share!=null) topList.push(Number(r.metrics.search_top_impression_share))
  if (r.metrics?.search_absolute_top_impression_share!=null) absList.push(Number(r.metrics.search_absolute_top_impression_share))
}
const avg = a => a.length?a.reduce((x,y)=>x+y,0)/a.length:null
console.log(`Impressions:        ${totImp}`)
console.log(`Clicks:             ${totClk}`)
console.log(`Spend:              $${totSpend.toFixed(2)}`)
console.log(`Conv:               ${totConv.toFixed(1)}`)
console.log(`Revenue:            $${totVal.toFixed(0)}`)
console.log(`ROAS:               ${(totVal/totSpend).toFixed(2)}x`)
console.log(`Avg CPC:            $${(totSpend/totClk).toFixed(2)}`)
console.log(`SIS (avg):          ${pct(avg(isList))}`)
console.log(`Lost-Budget (avg):  ${pct(avg(lbList))}`)
console.log(`Lost-Rank (avg):    ${pct(avg(lrList))}`)
console.log(`Top SIS:            ${pct(avg(topList))}`)
console.log(`Abs Top SIS:        ${pct(avg(absList))}`)

process.exit(0)
