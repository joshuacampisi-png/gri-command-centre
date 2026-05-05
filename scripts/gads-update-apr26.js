/**
 * Full breakdown — Apr 26 update
 * - Last 7 days per-day totals
 * - Per-campaign last 7 days
 * - Search Cannons day-by-day post-network-change
 * - Bundles recovery watch
 * - TNT serving watch
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'

const customer = getGadsCustomer()
const today = new Date()
const fmt = (d) => d.toISOString().slice(0, 10)
const daysAgo = (n) => { const d = new Date(today); d.setDate(d.getDate() - n); return fmt(d) }

const start = daysAgo(7)
const end = daysAgo(0)

console.log(`\n=== GOOGLE ADS UPDATE — ${end} ===`)
console.log(`Window: ${start} → ${end} (last 7 full+partial days)\n`)

// 1. Per-day totals
console.log('--- DAY-BY-DAY TOTALS (account-level) ---')
const dayRows = await customer.query(`
  SELECT segments.date, metrics.cost_micros, metrics.clicks, metrics.impressions,
         metrics.conversions, metrics.conversions_value
  FROM campaign
  WHERE segments.date BETWEEN '${start}' AND '${end}'
`)
const byDay = new Map()
for (const r of dayRows) {
  const d = r.segments?.date
  if (!d) continue
  const cur = byDay.get(d) || { spend: 0, clicks: 0, imp: 0, conv: 0, val: 0 }
  cur.spend += Number(r.metrics?.cost_micros || 0) / 1e6
  cur.clicks += Number(r.metrics?.clicks || 0)
  cur.imp += Number(r.metrics?.impressions || 0)
  cur.conv += Number(r.metrics?.conversions || 0)
  cur.val += Number(r.metrics?.conversions_value || 0)
  byDay.set(d, cur)
}
const days = [...byDay.keys()].sort()
for (const d of days) {
  const x = byDay.get(d)
  const roas = x.spend > 0 ? (x.val / x.spend).toFixed(2) : '-'
  const dow = new Date(d).toLocaleDateString('en-AU', { weekday: 'short' })
  console.log(`  ${d} ${dow.padEnd(4)} | $${x.spend.toFixed(2).padStart(7)} | ${String(x.clicks).padStart(4)} clk | ${x.conv.toFixed(1).padStart(5)} conv | $${x.val.toFixed(0).padStart(6)} | ${roas}x`)
}

// 2. Per-campaign last 7 days
console.log('\n--- PER-CAMPAIGN (last 7d) ---')
const campRows = await customer.query(`
  SELECT campaign.name, campaign.status, campaign_budget.amount_micros,
         metrics.cost_micros, metrics.clicks, metrics.impressions,
         metrics.conversions, metrics.conversions_value,
         metrics.search_impression_share
  FROM campaign
  WHERE segments.date BETWEEN '${start}' AND '${end}'
`)
const byCamp = new Map()
for (const r of campRows) {
  const name = r.campaign?.name || '?'
  const cur = byCamp.get(name) || { spend: 0, clicks: 0, imp: 0, conv: 0, val: 0, status: r.campaign?.status, budget: Number(r.campaign_budget?.amount_micros || 0) / 1e6 }
  cur.spend += Number(r.metrics?.cost_micros || 0) / 1e6
  cur.clicks += Number(r.metrics?.clicks || 0)
  cur.imp += Number(r.metrics?.impressions || 0)
  cur.conv += Number(r.metrics?.conversions || 0)
  cur.val += Number(r.metrics?.conversions_value || 0)
  byCamp.set(name, cur)
}
const sorted = [...byCamp.entries()].sort((a, b) => b[1].spend - a[1].spend)
for (const [name, x] of sorted) {
  const roas = x.spend > 0 ? (x.val / x.spend).toFixed(2) : '-'
  console.log(`  ${name}`)
  console.log(`    Budget $${x.budget}/d | Spend $${x.spend.toFixed(2)} | ${x.clicks} clk | ${x.conv.toFixed(1)} conv | $${x.val.toFixed(0)} | ${roas}x ROAS`)
}

// 3. Search Cannons day-by-day (post network-change watch)
console.log('\n--- SEARCH CANNONS — DAILY (network change watch) ---')
const cannonsRows = await customer.query(`
  SELECT segments.date, metrics.cost_micros, metrics.clicks, metrics.impressions,
         metrics.conversions, metrics.conversions_value, metrics.ctr, metrics.average_cpc
  FROM campaign
  WHERE campaign.id = 21094179575
    AND segments.date BETWEEN '${start}' AND '${end}'
`)
for (const r of cannonsRows.sort((a,b) => (a.segments?.date||'').localeCompare(b.segments?.date||''))) {
  const d = r.segments?.date
  const spend = Number(r.metrics?.cost_micros || 0) / 1e6
  const clicks = Number(r.metrics?.clicks || 0)
  const imp = Number(r.metrics?.impressions || 0)
  const conv = Number(r.metrics?.conversions || 0)
  const val = Number(r.metrics?.conversions_value || 0)
  const ctr = (Number(r.metrics?.ctr || 0) * 100).toFixed(2)
  const cpc = Number(r.metrics?.average_cpc || 0) / 1e6
  const roas = spend > 0 ? (val / spend).toFixed(2) : '-'
  const dow = new Date(d).toLocaleDateString('en-AU', { weekday: 'short' })
  console.log(`  ${d} ${dow.padEnd(4)} | $${spend.toFixed(2).padStart(6)} | ${imp} imp | ${clicks} clk | CTR ${ctr}% | CPC $${cpc.toFixed(2)} | ${conv.toFixed(1)} conv | ${roas}x`)
}

console.log('\n=== END ===\n')
process.exit(0)
