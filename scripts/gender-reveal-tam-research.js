/**
 * Pull full Australian search volume data for gender reveal keyword universe
 * Uses DataForSEO Keywords For Site / Keyword Suggestions endpoint
 */
import 'dotenv/config'
const D4S_USER = process.env.DATAFORSEO_USER || process.env.DFS_USER
const D4S_PASS = process.env.DATAFORSEO_PASS || process.env.DFS_PASS
const auth = 'Basic ' + Buffer.from(`${D4S_USER}:${D4S_PASS}`).toString('base64')

// Comprehensive AU keyword universe to size up
const KEYWORDS = [
  // Head terms
  'gender reveal',
  'gender reveal ideas',
  'gender reveal party',
  'gender reveal australia',
  'baby gender reveal',
  // Products
  'gender reveal cannon',
  'gender reveal cannons',
  'gender reveal smoke bomb',
  'gender reveal smoke bombs',
  'gender reveal powder',
  'gender reveal extinguisher',
  'gender reveal balloon',
  'gender reveal balloons',
  'gender reveal kit',
  'gender reveal bundle',
  'gender reveal box',
  'gender reveal cake',
  'gender reveal decorations',
  'gender reveal confetti',
  'gender reveal blaster',
  'gender reveal poppers',
  // Reveal types
  'gender reveal sports',
  'gender reveal football',
  'gender reveal golf',
  'gender reveal soccer',
  'gender reveal cricket',
  'gender reveal afl',
  'gender reveal basketball',
  'gender reveal car',
  'gender reveal burnout',
  'gender reveal tnt',
  'gender reveal fireworks',
  'gender reveal dry ice',
  // Intent
  'pregnancy announcement',
  'pregnancy announcement ideas',
  'baby shower ideas',
  'baby shower decorations',
  'boy or girl',
  // City-level (highest-volume)
  'gender reveal sydney',
  'gender reveal melbourne',
  'gender reveal brisbane',
  'gender reveal perth',
  'gender reveal adelaide',
  'gender reveal gold coast',
]

async function getKeywordData(kws) {
  // Use Keywords For Keyword endpoint - returns monthly volume for AU
  const body = [{
    keywords: kws,
    location_code: 2036, // Australia
    language_code: 'en',
    include_serp_info: false,
  }]
  const r = await fetch('https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live', {
    method: 'POST',
    headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return r.json()
}

console.log(`\n=== GENDER REVEAL — AU SEARCH VOLUME TAM ===\n`)
console.log(`Querying ${KEYWORDS.length} keyword clusters via DataForSEO Google Ads...\n`)

const json = await getKeywordData(KEYWORDS)
const result = json?.tasks?.[0]?.result || []

console.log(`Got ${result.length} keyword data points\n`)
console.log(`Keyword                                  | Vol/mo   | CPC   | Comp`)
console.log(`-`.repeat(75))

const totals = { volume: 0, cpcMult: 0 }
const byCategory = { head:0, products:0, types:0, intent:0, cities:0 }

for (const r of result.sort((a,b)=>(b.search_volume||0)-(a.search_volume||0))) {
  const k = r.keyword
  const v = r.search_volume || 0
  const cpc = r.cpc || 0
  const comp = r.competition_index || 0
  totals.volume += v
  totals.cpcMult += v * cpc

  let cat = 'other'
  if (/^gender reveal( ideas| party| australia|)$|^baby gender reveal$/.test(k)) cat = 'head'
  else if (/cannon|smoke|powder|extinguisher|balloon|kit|bundle|box|cake|decoration|confetti|blaster|popper/.test(k)) cat = 'products'
  else if (/sports|football|golf|soccer|cricket|afl|basketball|car|burnout|tnt|fireworks|dry ice/.test(k)) cat = 'types'
  else if (/pregnancy|baby shower|boy or girl/.test(k)) cat = 'intent'
  else if (/sydney|melbourne|brisbane|perth|adelaide|gold coast/.test(k)) cat = 'cities'
  byCategory[cat] = (byCategory[cat]||0) + v

  console.log(`  ${k.padEnd(40)} | ${String(v).padStart(7)} | $${cpc.toFixed(2).padStart(5)} | ${String(comp).padStart(3)}%`)
}

console.log(`\n=== TOTALS ===`)
console.log(`Total monthly search volume (AU): ${totals.volume.toLocaleString()}`)
console.log(`Weighted avg CPC: $${(totals.cpcMult/totals.volume).toFixed(2)}`)

console.log(`\n=== BY CATEGORY ===`)
for (const [c,v] of Object.entries(byCategory).sort((a,b)=>b[1]-a[1])) {
  console.log(`  ${c.padEnd(15)} ${String(v).padStart(7)}/mo (${(v/totals.volume*100).toFixed(1)}%)`)
}

console.log(`\n=== MATH ===`)
console.log(`Total AU searches/month: ${totals.volume.toLocaleString()}`)
console.log(`At 60% click-through rate (realistic for branded niche): ${Math.round(totals.volume * 0.6).toLocaleString()} clicks/mo`)
console.log(`At 2.5% conversion rate (DTC AOV $120): ${Math.round(totals.volume * 0.6 * 0.025).toLocaleString()} orders/mo`)
console.log(`At AOV $120: $${(totals.volume * 0.6 * 0.025 * 120).toLocaleString()}/mo revenue potential`)
console.log(`At AOV $150 (current with gift promo): $${(totals.volume * 0.6 * 0.025 * 150).toLocaleString()}/mo`)
console.log(`At AOV $200 (with rentals): $${(totals.volume * 0.6 * 0.025 * 200).toLocaleString()}/mo`)

process.exit(0)
