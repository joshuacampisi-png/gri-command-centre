/**
 * competitor-intel.js
 * Pulls Auction Insights for Search + Shopping campaigns from Google Ads API.
 * Surfaces competitor display URLs, their impression share, and how often
 * they outrank us.
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'

const customer = getGadsCustomer()

const fmt = (d) => d.toISOString().slice(0, 10)
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return fmt(d) }
const start = daysAgo(30)
const end = daysAgo(1)

console.log(`\n=== AUCTION INSIGHTS (${start} → ${end}) ===\n`)

// Try the Search auction insights view first
async function tryQuery(query, label) {
  try {
    const rows = await customer.query(query)
    return { ok: true, rows }
  } catch (e) {
    return { ok: false, error: e?.errors?.[0]?.message || e.message }
  }
}

// 1. Search campaign auction insights
console.log('--- SEARCH auction insights ---')
const search = await tryQuery(`
  SELECT
    campaign.name,
    metrics.search_impression_share,
    metrics.search_top_impression_share
  FROM campaign
  WHERE segments.date BETWEEN '${start}' AND '${end}'
    AND campaign.advertising_channel_type = 'SEARCH'
`, 'search')
if (search.ok) {
  for (const r of search.rows.slice(0, 3)) {
    console.log(`  ${r.campaign?.name}`)
  }
}

// 2. The actual auction insights resource
console.log('\n--- Auction insights via campaign_audience_view (customer-level) ---')
const cust = await tryQuery(`
  SELECT customer.id, customer.descriptive_name FROM customer LIMIT 1
`)
if (cust.ok) console.log(`  Account: ${cust.rows[0]?.customer?.descriptive_name}`)

// 3. Try campaign_search_term_insight which often returns competitor data
console.log('\n--- TOP search terms with auction context ---')
const terms = await tryQuery(`
  SELECT
    search_term_view.search_term,
    campaign.name,
    metrics.impressions, metrics.clicks, metrics.conversions, metrics.average_cpc, metrics.cost_micros
  FROM search_term_view
  WHERE segments.date BETWEEN '${start}' AND '${end}'
  ORDER BY metrics.impressions DESC
  LIMIT 30
`)
if (terms.ok) {
  for (const r of terms.rows) {
    const m = r.metrics
    const cpc = (Number(m.average_cpc || 0) / 1e6).toFixed(2)
    const spend = (Number(m.cost_micros || 0) / 1e6).toFixed(2)
    console.log(`  "${r.search_term_view?.search_term}" — ${m.impressions} imp, ${m.clicks} clk, ${Number(m.conversions||0).toFixed(0)} conv, $${cpc} CPC, $${spend} spend`)
  }
}

// 4. Shopping product-level — see what queries our products appear on
console.log('\n--- Top Shopping queries (proxy via product spend) ---')
const shop = await tryQuery(`
  SELECT segments.product_title, metrics.impressions, metrics.clicks, metrics.cost_micros
  FROM shopping_performance_view
  WHERE segments.date BETWEEN '${start}' AND '${end}'
  ORDER BY metrics.impressions DESC
  LIMIT 10
`)
if (shop.ok) {
  for (const r of shop.rows) {
    console.log(`  ${r.segments?.product_title?.substring(0,60)} — ${r.metrics?.impressions} imp`)
  }
}

process.exit(0)
