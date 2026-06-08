/**
 * COVERAGE AUDIT — where are we NOT showing? Where is IS lost?
 * Pulls: campaign IS metrics, top search terms, geo coverage, keyword coverage.
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'

const c = getGadsCustomer()
const fmt = (d) => d.toISOString().slice(0, 10)
const today = new Date()
const daysAgo = (n) => { const d = new Date(today); d.setDate(d.getDate() - n); return fmt(d) }
const start = daysAgo(30)
const end = daysAgo(1)

console.log(`\n=== COVERAGE AUDIT — ${end} ===`)
console.log(`Window: ${start} → ${end}\n`)

// 1. Impression share per campaign (Search top IS, lost to budget, lost to rank)
console.log('--- IMPRESSION SHARE (Search + Shopping) ---')
const isRows = await c.query(`
  SELECT campaign.name, campaign.id, campaign.advertising_channel_type,
         metrics.search_impression_share, metrics.search_top_impression_share,
         metrics.search_absolute_top_impression_share,
         metrics.search_budget_lost_impression_share,
         metrics.search_rank_lost_impression_share,
         metrics.cost_micros
  FROM campaign
  WHERE segments.date BETWEEN '${start}' AND '${end}'
    AND campaign.status = 'ENABLED'
`)
const isMap = new Map()
for (const r of isRows) {
  const k = r.campaign?.name
  const cur = isMap.get(k) || { ch: r.campaign?.advertising_channel_type, is: 0, topIs: 0, absTop: 0, budgetLost: 0, rankLost: 0, count: 0, spend: 0 }
  cur.is += Number(r.metrics?.search_impression_share || 0)
  cur.topIs += Number(r.metrics?.search_top_impression_share || 0)
  cur.absTop += Number(r.metrics?.search_absolute_top_impression_share || 0)
  cur.budgetLost += Number(r.metrics?.search_budget_lost_impression_share || 0)
  cur.rankLost += Number(r.metrics?.search_rank_lost_impression_share || 0)
  cur.spend += Number(r.metrics?.cost_micros || 0) / 1e6
  cur.count++
  isMap.set(k, cur)
}
for (const [name, x] of [...isMap.entries()].sort((a,b)=>b[1].spend-a[1].spend)) {
  if (x.spend < 1) continue
  const avg = (v) => x.count ? (v / x.count * 100).toFixed(1) : '-'
  console.log(`  ${name} (${x.ch})`)
  console.log(`    Search IS: ${avg(x.is)}% | Top IS: ${avg(x.topIs)}% | Abs Top: ${avg(x.absTop)}%`)
  console.log(`    Lost to BUDGET: ${avg(x.budgetLost)}% | Lost to RANK: ${avg(x.rankLost)}%`)
}

// 2. Top 30 search terms in last 30d
console.log('\n--- TOP 30 SEARCH TERMS (by impressions) ---')
const stRows = await c.query(`
  SELECT search_term_view.search_term, campaign.name,
         metrics.impressions, metrics.clicks, metrics.cost_micros,
         metrics.conversions, metrics.conversions_value
  FROM search_term_view
  WHERE segments.date BETWEEN '${start}' AND '${end}'
    AND metrics.impressions > 50
  ORDER BY metrics.impressions DESC
  LIMIT 30
`)
for (const r of stRows) {
  const imp = Number(r.metrics?.impressions || 0)
  const clk = Number(r.metrics?.clicks || 0)
  const sp = Number(r.metrics?.cost_micros || 0) / 1e6
  const conv = Number(r.metrics?.conversions || 0)
  const val = Number(r.metrics?.conversions_value || 0)
  const ctr = imp > 0 ? (clk / imp * 100).toFixed(1) : '-'
  const roas = sp > 0 ? (val / sp).toFixed(2) : '-'
  console.log(`  ${imp.toString().padStart(5)}imp ${clk.toString().padStart(4)}clk ${ctr.padStart(4)}% $${sp.toFixed(0).padStart(4)} ${conv.toFixed(0)}c ${roas}x — "${r.search_term_view?.search_term}" [${r.campaign?.name}]`)
}

// 3. Keywords + match types
console.log('\n--- ACTIVE SEARCH KEYWORDS ---')
const kwRows = await c.query(`
  SELECT campaign.name, ad_group.name, ad_group_criterion.keyword.text,
         ad_group_criterion.keyword.match_type, ad_group_criterion.status,
         metrics.impressions, metrics.clicks, metrics.cost_micros,
         metrics.conversions, metrics.conversions_value,
         metrics.search_impression_share
  FROM keyword_view
  WHERE segments.date BETWEEN '${start}' AND '${end}'
    AND ad_group_criterion.status = 'ENABLED'
  ORDER BY metrics.cost_micros DESC
  LIMIT 50
`)
for (const r of kwRows) {
  const imp = Number(r.metrics?.impressions || 0)
  const sp = Number(r.metrics?.cost_micros || 0) / 1e6
  const conv = Number(r.metrics?.conversions || 0)
  const val = Number(r.metrics?.conversions_value || 0)
  const is_ = Number(r.metrics?.search_impression_share || 0) * 100
  const roas = sp > 0 ? (val / sp).toFixed(2) : '-'
  if (imp < 5) continue
  console.log(`  ${r.ad_group_criterion?.keyword?.match_type} "${r.ad_group_criterion?.keyword?.text}" — ${imp}imp $${sp.toFixed(0)} ${conv.toFixed(0)}c ${roas}x IS:${is_.toFixed(0)}% [${r.campaign?.name}]`)
}

// 4. Geo performance (state-level)
console.log('\n--- GEO PERFORMANCE (top regions, last 30d) ---')
const geoRows = await c.query(`
  SELECT geographic_view.country_criterion_id,
         segments.geo_target_region,
         metrics.impressions, metrics.clicks, metrics.cost_micros,
         metrics.conversions, metrics.conversions_value
  FROM geographic_view
  WHERE segments.date BETWEEN '${start}' AND '${end}'
    AND metrics.impressions > 100
  ORDER BY metrics.cost_micros DESC
  LIMIT 20
`)
for (const r of geoRows) {
  const sp = Number(r.metrics?.cost_micros || 0) / 1e6
  const conv = Number(r.metrics?.conversions || 0)
  const val = Number(r.metrics?.conversions_value || 0)
  const roas = sp > 0 ? (val / sp).toFixed(2) : '-'
  console.log(`  Region:${r.segments?.geo_target_region || '?'} $${sp.toFixed(0)} ${conv.toFixed(1)}c $${val.toFixed(0)} ${roas}x`)
}

console.log('\n=== DONE ===\n')
process.exit(0)
