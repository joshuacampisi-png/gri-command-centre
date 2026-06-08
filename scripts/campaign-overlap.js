import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const c = getGadsCustomer()
const end = new Date().toISOString().slice(0,10)
const start = new Date(Date.now()-30*86400000).toISOString().slice(0,10)

console.log(`\n=== HOW EACH CAMPAIGN BID ON KEY QUERIES (30d) ===\n`)

// Search Cannons campaign — keywords are visible
console.log('--- SEARCH CANNONS CAMPAIGN — keyword-level data (visible) ---')
const kw = await c.query(`SELECT campaign.id, ad_group_criterion.keyword.text, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM keyword_view WHERE campaign.id=20956049281 AND segments.date BETWEEN '${start}' AND '${end}' AND metrics.impressions > 0`)
console.log('Keyword                                  | Imp   | Clk | Spend | Conv')
for (const r of kw) {
  const k = r.ad_group_criterion?.keyword?.text||'?'
  const imp=Number(r.metrics?.impressions||0), clk=Number(r.metrics?.clicks||0), sp=Number(r.metrics?.cost_micros||0)/1e6, conv=Number(r.metrics?.conversions||0)
  console.log(`  ${k.padEnd(40)} | ${String(imp).padStart(5)} | ${String(clk).padStart(3)} | $${sp.toFixed(0).padStart(4)} | ${conv.toFixed(0)}`)
}

// PMAX search term view (limited — Google hides most queries)
console.log(`\n--- PMAX CAMPAIGNS — search term visibility (Google redacts most) ---`)
for (const id of [21113841118, 21511998936, 22841772135]) {
  const r = await c.query(`SELECT campaign.id, campaign.name, search_term_view.search_term, metrics.impressions, metrics.cost_micros, metrics.conversions FROM search_term_view WHERE campaign.id=${id} AND segments.date BETWEEN '${start}' AND '${end}' AND metrics.impressions > 50`)
  console.log(`\n[${id}] Top visible search terms (>50 imp):`)
  for (const row of r.slice(0,5)) {
    const t = row.search_term_view?.search_term||'?'
    const imp = Number(row.metrics?.impressions||0)
    const sp = Number(row.metrics?.cost_micros||0)/1e6
    const conv = Number(row.metrics?.conversions||0)
    console.log(`  "${t}" → ${imp}imp $${sp.toFixed(0)} ${conv.toFixed(0)}c`)
  }
  if (!r.length) console.log(`  (no visible terms — PMAX redacts)`)
}

process.exit(0)
