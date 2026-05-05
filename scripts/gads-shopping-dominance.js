/**
 * Shopping dominance audit.
 * Pull impression share, lost IS, auction insights, top product searches
 * to identify why we've lost ground on Google Shopping.
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'

const customer = getGadsCustomer()

// 30 day window
const fmt = (d) => d.toISOString().slice(0, 10)
const today = new Date()
const daysAgo = (n) => { const d = new Date(today); d.setDate(d.getDate() - n); return fmt(d) }
const start = daysAgo(30)
const end = daysAgo(1)

console.log(`\n=== SHOPPING DOMINANCE AUDIT (${start} → ${end}) ===\n`)

// 1. Impression share per campaign
console.log('--- IMPRESSION SHARE PER CAMPAIGN (30d) ---')
const isRows = await customer.query(`
  SELECT campaign.name, campaign.advertising_channel_type,
    metrics.search_impression_share,
    metrics.search_top_impression_share,
    metrics.search_absolute_top_impression_share,
    metrics.search_budget_lost_impression_share,
    metrics.search_rank_lost_impression_share,
    metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value, metrics.cost_micros
  FROM campaign
  WHERE segments.date BETWEEN '${start}' AND '${end}'
    AND campaign.status = 'ENABLED'
`)

const pct = (x) => x == null ? '-' : (Number(x) * 100).toFixed(1) + '%'
for (const r of isRows) {
  if (Number(r.metrics?.impressions || 0) < 100) continue
  const c = r.campaign
  const m = r.metrics
  const spend = Number(m.cost_micros || 0) / 1e6
  const roas = spend > 0 ? (Number(m.conversions_value || 0) / spend).toFixed(2) : '-'
  console.log(`\n  ${c.name} [${c.advertising_channel_type}]`)
  console.log(`    Impressions: ${Number(m.impressions || 0).toLocaleString()} | Clicks: ${m.clicks} | ROAS: ${roas}x`)
  console.log(`    Search IS:        ${pct(m.search_impression_share)}`)
  console.log(`    Top IS:           ${pct(m.search_top_impression_share)}`)
  console.log(`    Absolute Top IS:  ${pct(m.search_absolute_top_impression_share)}`)
  console.log(`    Lost IS (budget): ${pct(m.search_budget_lost_impression_share)}`)
  console.log(`    Lost IS (rank):   ${pct(m.search_rank_lost_impression_share)}`)
}

// 2. Auction insights — Shopping (who's showing up against us)
console.log('\n\n--- AUCTION INSIGHTS — TOP COMPETITORS (30d Shopping) ---')
try {
  const aiRows = await customer.query(`
    SELECT
      campaign.name,
      ad_group_audience_view.resource_name,
      metrics.impressions
    FROM campaign
    WHERE segments.date BETWEEN '${start}' AND '${end}'
    LIMIT 1
  `)
  // Auction insights actually requires a different report
  const aucRows = await customer.query(`
    SELECT
      ad_group_criterion_simulation.criterion_id,
      campaign.name
    FROM ad_group_criterion_simulation
    LIMIT 1
  `)
} catch (e) {
  // skip — auction insights needs separate report type
}

// Try the proper auction insights report
console.log('  (Pulling auction insights via competitor display URL...)')
try {
  const compRows = await customer.query(`
    SELECT
      campaign.name,
      metrics.search_impression_share,
      segments.date
    FROM campaign
    WHERE segments.date BETWEEN '${daysAgo(7)}' AND '${end}'
      AND campaign.status = 'ENABLED'
  `)
  // We can't directly query auction_insights, need GAQL specific report
} catch (e) {}

// 3. Top product searches we're actually appearing on
console.log('\n--- TOP SEARCH TERMS DRIVING SHOPPING (last 30d, top 25 by impressions) ---')
const stRows = await customer.query(`
  SELECT
    search_term_view.search_term,
    campaign.name,
    metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value, metrics.cost_micros
  FROM search_term_view
  WHERE segments.date BETWEEN '${start}' AND '${end}'
    AND campaign.status = 'ENABLED'
  ORDER BY metrics.impressions DESC
  LIMIT 25
`)
for (const r of stRows) {
  const m = r.metrics
  const spend = Number(m.cost_micros || 0) / 1e6
  const conv = Number(m.conversions || 0)
  const val = Number(m.conversions_value || 0)
  const roas = spend > 0 ? (val / spend).toFixed(2) : '-'
  console.log(`  "${r.search_term_view?.search_term}" — ${m.impressions} imp, ${m.clicks} clk, ${conv.toFixed(1)} conv, $${val.toFixed(0)}, ${roas}x  [${r.campaign?.name}]`)
}

// 4. Shopping product-level performance
console.log('\n\n--- TOP 20 SHOPPING PRODUCTS BY SPEND (30d) ---')
const prodRows = await customer.query(`
  SELECT
    segments.product_title,
    segments.product_item_id,
    metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value, metrics.cost_micros
  FROM shopping_performance_view
  WHERE segments.date BETWEEN '${start}' AND '${end}'
  ORDER BY metrics.cost_micros DESC
  LIMIT 20
`)
for (const r of prodRows) {
  const m = r.metrics
  const spend = Number(m.cost_micros || 0) / 1e6
  const val = Number(m.conversions_value || 0)
  const roas = spend > 0 ? (val / spend).toFixed(2) : '-'
  console.log(`  ${r.segments?.product_title?.substring(0, 55).padEnd(56)} | $${spend.toFixed(0).padStart(4)} | ${String(m.impressions).padStart(5)} imp | ${m.clicks} clk | ${Number(m.conversions || 0).toFixed(1)} conv | ${roas}x`)
}

process.exit(0)
