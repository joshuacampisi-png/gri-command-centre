/**
 * Auction Insights — who's beating us in the auction.
 * Queries every Google Ads API resource that might expose competitor data.
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'

const customer = getGadsCustomer()

async function tryQuery(query, label) {
  try {
    const rows = await customer.query(query)
    return { ok: true, rows, label }
  } catch (e) {
    return { ok: false, error: e?.errors?.[0]?.message || e.message, label }
  }
}

const fmt = (d) => d.toISOString().slice(0, 10)
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return fmt(d) }
const start = daysAgo(30)
const end = daysAgo(1)

console.log('\n========== AUCTION INSIGHTS PROBE ==========\n')

// Try various known resource names that may expose auction insights
const probes = [
  {
    name: 'Per-campaign IS metrics (already known)',
    q: `SELECT campaign.name, metrics.search_impression_share, metrics.search_top_impression_share, metrics.search_rank_lost_impression_share, metrics.search_budget_lost_impression_share, metrics.search_exact_match_impression_share FROM campaign WHERE campaign.status = 'ENABLED' AND segments.date BETWEEN '${start}' AND '${end}'`,
  },
  {
    name: 'Customer-level IS for all queries',
    q: `SELECT customer.descriptive_name, metrics.search_impression_share, metrics.search_top_impression_share, metrics.search_rank_lost_impression_share, metrics.search_budget_lost_impression_share FROM customer WHERE segments.date BETWEEN '${start}' AND '${end}'`,
  },
  {
    name: 'Ad group level IS',
    q: `SELECT ad_group.name, campaign.name, metrics.search_impression_share, metrics.search_top_impression_share, metrics.search_rank_lost_impression_share FROM ad_group WHERE ad_group.status = 'ENABLED' AND segments.date BETWEEN '${start}' AND '${end}'`,
  },
  {
    name: 'Domain-level data (paid_organic_search_term_view)',
    q: `SELECT paid_organic_search_term_view.search_term, metrics.organic_clicks, metrics.organic_impressions, metrics.organic_average_position, metrics.combined_clicks, metrics.combined_impressions FROM paid_organic_search_term_view WHERE segments.date BETWEEN '${start}' AND '${end}' LIMIT 30`,
  },
  {
    name: 'Search term performance with relative metrics',
    q: `SELECT search_term_view.search_term, campaign.name, metrics.absolute_top_impression_percentage, metrics.top_impression_percentage, metrics.search_rank_lost_top_impression_share FROM search_term_view WHERE metrics.impressions > 20 AND segments.date BETWEEN '${start}' AND '${end}' ORDER BY metrics.impressions DESC LIMIT 25`,
  },
]

for (const p of probes) {
  const r = await tryQuery(p.q, p.name)
  console.log(`--- ${p.name} ---`)
  if (!r.ok) {
    console.log(`  ❌ ${r.error}\n`)
    continue
  }
  console.log(`  ✓ ${r.rows.length} rows\n`)
  for (const row of r.rows.slice(0, 10)) {
    const flat = JSON.stringify(row).replace(/[{}"]/g, '').replace(/,/g, ' · ').slice(0, 200)
    console.log(`    ${flat}`)
  }
  console.log('')
}

// The real Auction Insights report is at:
//   https://ads.google.com/aw/reporting/insights/?...&campaignId=XXX
// It's UI-only via official API. Some clients expose it via screenshot/scrape.
console.log('\n========== NOTE ==========')
console.log('Google Ads "Auction Insights" report (with competitor display URLs) is')
console.log('UI-only. The API does not expose competitor domains directly.')
console.log('Closest API metric: search_rank_lost_impression_share = % of auctions where')
console.log('we COULD have shown but didn\'t due to Ad Rank lower than competitors.\n')

process.exit(0)
