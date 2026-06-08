/**
 * Check search volume for "confettified" + brand variants in AU
 */
import 'dotenv/config'
const AUTH = 'Basic ' + Buffer.from(`${process.env.DATAFORSEO_EMAIL}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64')

const KWS = [
  'confettified',
  'confettified gender reveal',
  'confettified cannon',
  'confettified australia',
  'confettified review',
  'gender reveal ideas',
  'gender reveal cannons',
  'gender reveal'
]

const r = await fetch('https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live', {
  method:'POST',
  headers:{Authorization:AUTH,'Content-Type':'application/json'},
  body: JSON.stringify([{ keywords: KWS, location_code: 2036, language_code: 'en' }])
}).then(r=>r.json())

const items = r.tasks?.[0]?.result || []
console.log('\n=== AU Search Volume — last 12mo avg + competition ===\n')
console.log('Keyword                          | Monthly Search | Competition | CPC Low-High')
console.log('-'.repeat(95))
for (const it of items) {
  const vol = it.search_volume ?? 0
  const comp = it.competition || '—'
  const lo = it.low_top_of_page_bid ?? '-'
  const hi = it.high_top_of_page_bid ?? '-'
  console.log(`${(it.keyword||'').padEnd(33)} | ${String(vol).padStart(14)} | ${String(comp).padEnd(11)} | $${lo}-$${hi}`)
}

// Bonus: also check our search terms history for branded competitor queries
console.log('\n=== Our 30-day search terms — any "confettified" hits? ===')
const { getGadsCustomer } = await import('../server/lib/gads-client.js')
const customer = getGadsCustomer()
const rows = await customer.query(`
  SELECT search_term_view.search_term, metrics.impressions, metrics.clicks, metrics.cost_micros
  FROM search_term_view
  WHERE segments.date DURING LAST_30_DAYS
`)
const hits = rows.filter(r => /confettified|competitor|cannon\s*au/i.test(r.search_term_view?.search_term||''))
if (!hits.length) console.log('  None.')
hits.forEach(r => console.log(`  "${r.search_term_view.search_term}" — ${r.metrics?.impressions||0} imp, ${r.metrics?.clicks||0} clk`))
process.exit(0)
