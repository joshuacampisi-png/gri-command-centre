/**
 * Pull keyword search volume directly from Google Ads API
 * Using GenerateKeywordHistoricalMetricsService
 */
import 'dotenv/config'
import { getGadsCustomer, getGadsCustomerId } from '../server/lib/gads-client.js'
const customer = getGadsCustomer()
const custId = getGadsCustomerId()

const KEYWORDS = [
  'gender reveal','gender reveal ideas','gender reveal party','gender reveal australia',
  'gender reveal cannon','gender reveal cannons','gender reveal smoke bomb','gender reveal smoke bombs',
  'gender reveal powder','gender reveal extinguisher','gender reveal balloon','gender reveal balloons',
  'gender reveal kit','gender reveal bundle','gender reveal cake','gender reveal decorations',
  'gender reveal confetti','gender reveal blaster','gender reveal sports','gender reveal football',
  'gender reveal golf','gender reveal soccer','gender reveal afl','gender reveal car','gender reveal burnout',
  'gender reveal tnt','gender reveal fireworks','gender reveal dry ice','pregnancy announcement',
  'pregnancy announcement ideas','baby shower ideas','baby shower decorations','boy or girl',
  'gender reveal sydney','gender reveal melbourne','gender reveal brisbane','gender reveal perth',
  'gender reveal adelaide','gender reveal gold coast','baby gender reveal'
]

try {
  const r = await customer.keywordPlanIdeas.generateKeywordHistoricalMetrics({
    customer_id: custId,
    keywords: KEYWORDS,
    geo_target_constants: ['geoTargetConstants/2036'],   // Australia
    language: 'languageConstants/1000',                  // English
    keyword_plan_network: 2,                             // GOOGLE_SEARCH
  })

  console.log(`\n=== GOOGLE ADS HISTORICAL METRICS (AU) ===\n`)
  console.log(`Keyword                                  | Avg Vol/mo | CPC Low | CPC High | Comp`)
  console.log('-'.repeat(95))

  const results = r.results || []
  let total = 0
  let cpcWeighted = 0
  for (const it of results.sort((a,b)=>(Number(b.keyword_metrics?.avg_monthly_searches||0))-(Number(a.keyword_metrics?.avg_monthly_searches||0)))) {
    const k = it.text
    const km = it.keyword_metrics || {}
    const v = Number(km.avg_monthly_searches || 0)
    const lo = Number(km.low_top_of_page_bid_micros || 0) / 1e6
    const hi = Number(km.high_top_of_page_bid_micros || 0) / 1e6
    const comp = km.competition_index || 0
    total += v
    cpcWeighted += v * ((lo+hi)/2)
    console.log(`  ${(k||'?').padEnd(40)} | ${String(v).padStart(8)} | $${lo.toFixed(2).padStart(5)} | $${hi.toFixed(2).padStart(6)} | ${String(comp).padStart(3)}`)
  }

  console.log(`\n=== TOTALS ===`)
  console.log(`Keywords queried: ${KEYWORDS.length}`)
  console.log(`Keywords returned: ${results.length}`)
  console.log(`Total AU monthly search volume: ${total.toLocaleString()}`)
  console.log(`Weighted avg CPC mid: $${total>0?(cpcWeighted/total).toFixed(2):'n/a'}`)
  console.log(`Implied AU annual searches: ${(total*12).toLocaleString()}`)
} catch (e) {
  console.log('ERR:', JSON.stringify(e?.errors?.[0]||e?.message)?.slice(0,500))
}

process.exit(0)
