/**
 * Pull REAL AU monthly search volume for every relevant gender-reveal buyer-intent keyword.
 * Uses DataForSEO Google Ads keyword planner + Google Trends.
 *
 * For each product in our catalog, the engine will later pick the HIGHEST-volume keyword variant
 * that matches the product, and use THAT exact phrase as the SEO title primary keyword.
 */
import 'dotenv/config'
import { writeFileSync, mkdirSync } from 'fs'

const AUTH = 'Basic ' + Buffer.from(`${process.env.DATAFORSEO_EMAIL}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64')

// Seed keywords — covers every major product type in the catalog
const SEEDS = [
  // Core
  'gender reveal', 'gender reveal ideas', 'gender reveal australia', 'gender reveal kit',
  'gender reveal party', 'gender reveal bundle', 'gender reveal supplies', 'gender reveal near me',
  // Cannons
  'gender reveal cannon', 'gender reveal cannons', 'gender reveal powder cannon', 'gender reveal confetti cannon',
  'powder cannon', 'confetti cannon', 'gender reveal cannon australia',
  // Smoke
  'gender reveal smoke bomb', 'gender reveal smoke bombs', 'smoke bomb gender reveal', 'pink smoke bomb',
  'blue smoke bomb', 'gender reveal smoke', 'coloured smoke bomb',
  // Extinguisher / Blaster
  'gender reveal extinguisher', 'gender reveal fire extinguisher', 'powder extinguisher gender reveal',
  'gender reveal blaster', 'powder blaster', 'gender reveal mega blaster', 'mini blaster gender reveal',
  // Sports
  'gender reveal football', 'gender reveal soccer ball', 'gender reveal cricket ball',
  'gender reveal golf ball', 'gender reveal basketball', 'gender reveal rugby ball',
  // Bundles
  'gender reveal pack', 'gender reveal twin reveal', 'twins gender reveal',
  // Balloons / decor (broader)
  'gender reveal balloons', 'gender reveal balloon kit', 'gender reveal decorations',
  // Burnout / smoke variants
  'gender reveal burnout', 'gender reveal burnout powder', 'tyre burnout gender reveal',
  // Hire
  'tnt gender reveal', 'gender reveal hire', 'gender reveal hire near me',
  // Themed (for the Paw Patrol etc products)
  'paw patrol birthday', 'paw patrol balloons', 'toy story birthday',
  'super mario birthday', 'mario party decorations',
]

async function getVolume(keywords) {
  // Google Ads Keyword Planner — historical search volume for AU
  const r = await fetch('https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live', {
    method: 'POST',
    headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify([{
      keywords,
      location_code: 2036, // Australia
      language_code: 'en',
      include_adult_keywords: false,
    }]),
  })
  const j = await r.json()
  return j.tasks?.[0]?.result || []
}

console.log(`\n=== KEYWORD VOLUME RESEARCH — Australia, ${new Date().toISOString().slice(0,10)} ===\n`)
console.log(`Querying ${SEEDS.length} seed keywords...`)

// Batch in groups of 100 (DataForSEO limit per request)
const all = []
for (let i = 0; i < SEEDS.length; i += 100) {
  const batch = SEEDS.slice(i, i + 100)
  const r = await getVolume(batch)
  all.push(...r)
  await new Promise(res => setTimeout(res, 500))
}

// Sort by volume desc
const sorted = all
  .filter(x => x.keyword)
  .map(x => ({
    keyword: x.keyword,
    monthlySearches: x.search_volume,
    cpc: x.cpc,
    competition: x.competition,
    competitionIdx: x.competition_index,
    lowBid: x.low_top_of_page_bid,
    highBid: x.high_top_of_page_bid,
  }))
  .sort((a,b) => (b.monthlySearches||0) - (a.monthlySearches||0))

console.log(`\nGot data for ${sorted.length} keywords\n`)
console.log('Monthly | CPC    | Comp     | Keyword')
console.log('-'.repeat(110))
for (const s of sorted) {
  const vol = s.monthlySearches?.toLocaleString().padStart(7) || '   —   '
  const cpc = s.cpc != null ? `$${s.cpc.toFixed(2)}`.padStart(6) : '   —  '
  const comp = (s.competition || '—').toString().padEnd(8)
  console.log(`${vol} | ${cpc} | ${comp} | ${s.keyword}`)
}

// Group by product family
const families = {
  'Core gender reveal': sorted.filter(s => /^gender reveal(?!\s+(?:cannon|smoke|extinguisher|blaster|football|soccer|cricket|golf|basketball|rugby|balloon|burnout|hire))/i.test(s.keyword) || s.keyword === 'gender reveal'),
  'Cannons': sorted.filter(s => /cannon/i.test(s.keyword) && !/extinguisher/i.test(s.keyword)),
  'Smoke': sorted.filter(s => /smoke/i.test(s.keyword)),
  'Extinguisher / Blaster': sorted.filter(s => /extinguisher|blaster/i.test(s.keyword)),
  'Sports': sorted.filter(s => /football|soccer|cricket|golf|basketball|rugby/i.test(s.keyword)),
  'Balloons / Decor': sorted.filter(s => /balloon|decoration/i.test(s.keyword) && !/paw|mario|toy story/i.test(s.keyword)),
  'Burnout': sorted.filter(s => /burnout/i.test(s.keyword)),
  'Hire': sorted.filter(s => /\b(hire|tnt)\b/i.test(s.keyword)),
  'Themed (Paw/Mario/Toy)': sorted.filter(s => /paw|mario|toy story/i.test(s.keyword)),
}

console.log('\n\n━━━ BY PRODUCT FAMILY — top volume variant per family ━━━\n')
for (const [fam, kws] of Object.entries(families)) {
  if (!kws.length) { console.log(`[${fam}] — no data\n`); continue }
  console.log(`[${fam}]`)
  for (const k of kws.slice(0, 8)) {
    console.log(`  ${(k.monthlySearches||0).toLocaleString().padStart(6)} /mo  | CPC $${(k.cpc||0).toFixed(2)}  | "${k.keyword}"`)
  }
  console.log('')
}

// Save full data
mkdirSync('data/snapshots/keyword-research', { recursive: true })
writeFileSync('data/snapshots/keyword-research/au-volume.json', JSON.stringify({
  fetchedAt: new Date().toISOString(),
  locationCode: 2036,
  totalSeeds: SEEDS.length,
  totalResults: sorted.length,
  keywords: sorted,
  byFamily: families,
}, null, 2))
console.log(`\nFull data: data/snapshots/keyword-research/au-volume.json`)
process.exit(0)
