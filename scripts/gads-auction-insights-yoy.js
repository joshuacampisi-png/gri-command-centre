/**
 * AUCTION INSIGHTS YoY — see who's gained ground on us.
 * Compare May 2025 vs May 2026 same-period (1-14).
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'

const c = getGadsCustomer()
const startA = '2025-04-15', endA = '2025-05-14'
const startB = '2026-04-15', endB = '2026-05-14'

console.log(`\n=== AUCTION INSIGHTS YoY ===`)
console.log(`A: ${startA} → ${endA}  (last year same period)`)
console.log(`B: ${startB} → ${endB}  (this year same period)\n`)

async function pull(start, end, label) {
  const rows = await c.query(`
    SELECT campaign.name,
           ad_group.name,
           campaign_audience_view.resource_name,
           metrics.search_impression_share,
           metrics.search_top_impression_share,
           metrics.search_absolute_top_impression_share,
           metrics.search_rank_lost_impression_share,
           metrics.search_budget_lost_impression_share
    FROM campaign
    WHERE segments.date BETWEEN '${start}' AND '${end}'
      AND campaign.status = 'ENABLED'
  `).catch(e => { console.error(label, 'failed:', e.message?.slice(0,200)); return [] })

  const byCamp = new Map()
  for (const r of rows) {
    const k = r.campaign?.name
    const cur = byCamp.get(k) || { is: 0, topIs: 0, absTop: 0, rankLost: 0, budgetLost: 0, n: 0 }
    cur.is += Number(r.metrics?.search_impression_share || 0)
    cur.topIs += Number(r.metrics?.search_top_impression_share || 0)
    cur.absTop += Number(r.metrics?.search_absolute_top_impression_share || 0)
    cur.rankLost += Number(r.metrics?.search_rank_lost_impression_share || 0)
    cur.budgetLost += Number(r.metrics?.search_budget_lost_impression_share || 0)
    cur.n++
    byCamp.set(k, cur)
  }
  console.log(`--- ${label} ---`)
  for (const [name, x] of byCamp) {
    if (!x.n) continue
    const avg = (v) => (v / x.n * 100).toFixed(1)
    console.log(`  ${name}: IS=${avg(x.is)}% Top=${avg(x.topIs)}% AbsTop=${avg(x.absTop)}% LostRank=${avg(x.rankLost)}% LostBudget=${avg(x.budgetLost)}%`)
  }
  console.log()
}

// Per-campaign IS YoY
await pull(startA, endA, 'A: 2025 same period')
await pull(startB, endB, 'B: 2026 same period')

// CPC YoY on top converters
console.log(`--- AVG CPC YoY ---`)
for (const [start, end, label] of [[startA, endA, '2025'], [startB, endB, '2026']]) {
  const rows = await c.query(`
    SELECT campaign.name, metrics.clicks, metrics.cost_micros, metrics.impressions
    FROM campaign
    WHERE segments.date BETWEEN '${start}' AND '${end}'
      AND campaign.status = 'ENABLED'
  `)
  const m = new Map()
  for (const r of rows) {
    const k = r.campaign?.name
    const cur = m.get(k) || { clk: 0, sp: 0 }
    cur.clk += Number(r.metrics?.clicks || 0)
    cur.sp += Number(r.metrics?.cost_micros || 0) / 1e6
    m.set(k, cur)
  }
  console.log(`  ${label}:`)
  for (const [name, x] of m) {
    if (x.clk < 5) continue
    console.log(`    ${name.padEnd(40)} ${x.clk}clk $${x.sp.toFixed(0)} CPC $${(x.sp/x.clk).toFixed(2)}`)
  }
}
console.log()

process.exit(0)
