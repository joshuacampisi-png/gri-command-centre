/**
 * Paid + Organic overlap — find queries where we appear paid AND organic
 * (so we know which we already dominate vs need to push paid harder)
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'

const customer = getGadsCustomer()

const fmt = (d) => d.toISOString().slice(0, 10)
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return fmt(d) }
const start = daysAgo(30)
const end = daysAgo(1)

console.log(`\n========== PAID + ORGANIC OVERLAP (${start} → ${end}) ==========\n`)

const rows = await customer.query(`
  SELECT
    paid_organic_search_term_view.search_term,
    metrics.organic_clicks,
    metrics.organic_impressions,
    metrics.organic_clicks_per_query,
    metrics.organic_queries,
    metrics.combined_clicks,
    metrics.combined_clicks_per_query,
    metrics.combined_queries,
    metrics.clicks,
    metrics.impressions
  FROM paid_organic_search_term_view
  WHERE segments.date BETWEEN '${start}' AND '${end}'
    AND metrics.combined_clicks > 0
  ORDER BY metrics.combined_clicks DESC
  LIMIT 50
`)

console.log(`${'Query'.padEnd(45)}  ${'PaidImp'.padStart(8)}  ${'PaidClk'.padStart(7)}  ${'OrgImp'.padStart(7)}  ${'OrgClk'.padStart(7)}  ${'BothClk'.padStart(7)}`)
console.log('-'.repeat(95))

let paidOnly = 0, orgOnly = 0, both = 0
for (const r of rows) {
  const term = (r.paid_organic_search_term_view?.search_term || '').substring(0, 44)
  const m = r.metrics
  const paidImp = Number(m.impressions || 0)
  const paidClk = Number(m.clicks || 0)
  const orgImp = Number(m.organic_impressions || 0)
  const orgClk = Number(m.organic_clicks || 0)
  const bothClk = Number(m.combined_clicks || 0)

  if (paidClk > 0 && orgClk > 0) both++
  else if (paidClk > 0) paidOnly++
  else if (orgClk > 0) orgOnly++

  console.log(`${term.padEnd(45)}  ${String(paidImp).padStart(8)}  ${String(paidClk).padStart(7)}  ${String(orgImp).padStart(7)}  ${String(orgClk).padStart(7)}  ${String(bothClk).padStart(7)}`)
}

console.log(`\n--- COVERAGE ---`)
console.log(`Paid only: ${paidOnly}`)
console.log(`Organic only: ${orgOnly}`)
console.log(`Both: ${both}`)

process.exit(0)
