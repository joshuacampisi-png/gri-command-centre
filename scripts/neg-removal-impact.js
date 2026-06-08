/**
 * Predict impact of removing Smoke & Extinguisher negatives from Cannons campaign
 *  1. Cannons positive keywords + match types + bid strategy
 *  2. PMAX search_term_view: what those queries earned in PMAX last 30d (the prize)
 *  3. Search Cannons search_term_view: any extinguisher/smoke terms slipping past negs already
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const c = getGadsCustomer()
const MT = {2:'EXACT',3:'PHRASE',4:'BROAD'}

const TARGET_TERMS = [
  'extinguisher','smoke bomb','smoke bombs','colour blaster','powder blaster',
  'gender reveal smoke','pink smoke','blue smoke',
]

console.log('\n=== 1. CANNONS CAMPAIGN — positive keywords + bid strategy ===\n')
const camps = await c.query(`
  SELECT campaign.id, campaign.name, campaign.bidding_strategy_type,
         campaign.target_roas.target_roas, campaign.maximize_conversion_value.target_roas,
         campaign_budget.amount_micros
  FROM campaign
  WHERE campaign.name = 'GRI | Search | Cannons'
`)
for (const r of camps) {
  console.log(`Campaign: ${r.campaign?.name}`)
  console.log(`  Bid strategy: ${r.campaign?.bidding_strategy_type}`)
  console.log(`  tROAS: ${r.campaign?.target_roas?.target_roas || r.campaign?.maximize_conversion_value?.target_roas || '—'}`)
  console.log(`  Daily budget: $${Number(r.campaign_budget?.amount_micros||0)/1e6}`)
}

console.log('\n--- Cannons positive keywords ---')
const kw = await c.query(`
  SELECT ad_group.name, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type,
         ad_group_criterion.status, metrics.impressions, metrics.clicks, metrics.cost_micros,
         metrics.conversions, metrics.conversions_value
  FROM keyword_view
  WHERE campaign.name = 'GRI | Search | Cannons'
    AND ad_group_criterion.negative = FALSE
    AND segments.date DURING LAST_30_DAYS
  ORDER BY metrics.impressions DESC
`)
const seenKw = new Set()
for (const r of kw) {
  const text = r.ad_group_criterion?.keyword?.text
  const key = `${text}|${r.ad_group_criterion?.keyword?.match_type}`
  if (seenKw.has(key)) continue
  seenKw.add(key)
  const imp = Number(r.metrics?.impressions||0)
  const clk = Number(r.metrics?.clicks||0)
  const spend = Number(r.metrics?.cost_micros||0)/1e6
  console.log(`  [${MT[r.ad_group_criterion?.keyword?.match_type]||'?'}] "${text}" imp:${imp} clk:${clk} spend:$${spend.toFixed(0)}`)
}

console.log('\n=== 2. PMAX SEARCH TERMS — what blocked queries earned in PMAX last 30d ===\n')
try {
  const pmaxTerms = await c.query(`
    SELECT campaign.name, campaign_search_term_insight.category_label,
           metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value
    FROM campaign_search_term_insight
    WHERE segments.date DURING LAST_30_DAYS
      AND campaign.advertising_channel_type = 'PERFORMANCE_MAX'
    ORDER BY metrics.impressions DESC
    LIMIT 200
  `)
  const matched = pmaxTerms.filter(r => {
    const label = (r.campaign_search_term_insight?.category_label||'').toLowerCase()
    return TARGET_TERMS.some(t => label.includes(t))
  })
  if (!matched.length) console.log('  (none matched — PMAX search-term insights API may suppress these)')
  for (const r of matched.slice(0,30)) {
    const lbl = r.campaign_search_term_insight?.category_label
    const imp = Number(r.metrics?.impressions||0)
    const clk = Number(r.metrics?.clicks||0)
    const conv = Number(r.metrics?.conversions||0)
    const val = Number(r.metrics?.conversions_value||0)
    console.log(`  [${r.campaign?.name?.slice(0,30)}] "${lbl}" imp:${imp} clk:${clk} conv:${conv.toFixed(1)} rev:$${val.toFixed(0)}`)
  }
} catch(e) { console.log('  err:', e.errors?.[0]?.message || e.message) }

console.log('\n=== 3. SEARCH-TERM HISTORY across all Search/Shopping (last 30d) — extinguisher/smoke matches ===\n')
try {
  const st = await c.query(`
    SELECT campaign.name, search_term_view.search_term,
           metrics.impressions, metrics.clicks, metrics.cost_micros,
           metrics.conversions, metrics.conversions_value
    FROM search_term_view
    WHERE segments.date DURING LAST_30_DAYS
      AND metrics.impressions > 0
    LIMIT 500
  `)
  const matched = st.filter(r => {
    const term = (r.search_term_view?.search_term||'').toLowerCase()
    return TARGET_TERMS.some(t => term.includes(t))
  })
  if (!matched.length) console.log('  No matches — negatives are fully blocking on Search side.')
  const agg = new Map()
  for (const r of matched) {
    const term = r.search_term_view?.search_term
    const key = `${r.campaign?.name}|${term}`
    if (!agg.has(key)) agg.set(key,{imp:0,clk:0,spend:0,conv:0,val:0,camp:r.campaign?.name,term})
    const x = agg.get(key)
    x.imp += Number(r.metrics?.impressions||0)
    x.clk += Number(r.metrics?.clicks||0)
    x.spend += Number(r.metrics?.cost_micros||0)/1e6
    x.conv += Number(r.metrics?.conversions||0)
    x.val += Number(r.metrics?.conversions_value||0)
  }
  const sorted = [...agg.values()].sort((a,b)=>b.imp-a.imp).slice(0,40)
  for (const x of sorted) {
    console.log(`  [${x.camp?.slice(0,30).padEnd(30)}] "${x.term}" imp:${x.imp} clk:${x.clk} spend:$${x.spend.toFixed(0)} conv:${x.conv.toFixed(1)} rev:$${x.val.toFixed(0)}`)
  }
  console.log(`\n  Total matched search terms aggregated: ${sorted.length}`)
} catch(e) { console.log('  err:', e.errors?.[0]?.message || e.message) }

process.exit(0)
