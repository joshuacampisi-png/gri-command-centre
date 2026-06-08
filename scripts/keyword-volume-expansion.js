/**
 * Expand keyword volume research: baby shower, foil curtain, backdrops, decor accessories
 */
import 'dotenv/config'
import { writeFileSync, mkdirSync } from 'fs'

const AUTH = 'Basic ' + Buffer.from(`${process.env.DATAFORSEO_EMAIL}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64')

const SEEDS = [
  // Baby shower
  'baby shower', 'baby shower decorations', 'baby shower balloons', 'baby shower party',
  'baby shower supplies', 'baby shower kit', 'baby shower ideas', 'baby shower australia',
  'baby shower party box', 'oh baby balloons', 'baby shower foil balloons',
  // Foil curtain / backdrop / decor
  'foil curtain', 'gender reveal backdrop', 'baby shower backdrop',
  'party backdrop', 'photo backdrop', 'gender reveal photo booth',
  // Decor accessories
  'cake topper', 'baby shower cake topper', 'gender reveal cake topper',
  'party plates', 'paper plates', 'gender reveal plates', 'baby shower plates',
  'napkins party', 'gender reveal napkins', 'baby shower napkins',
  'party cups', 'gender reveal cups', 'baby shower cups',
  // Powder + props
  'gender reveal sash', 'mum to be sash', 'gender reveal scratchies',
  'gender reveal prediction cards', 'gender reveal voting',
  // Misc gender reveal
  'gender reveal pet bandana', 'gender reveal dog', 'gender reveal glasses',
  // Sports we missed
  'gender reveal nfl ball', 'gender reveal afl ball', 'gender reveal baseball',
  'gender reveal electric water gun', 'electric water gun gender reveal',
  // Bundles / packs
  'gender reveal party pack', 'gender reveal party supplies',
]

async function getVolume(keywords) {
  const r = await fetch('https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live', {
    method: 'POST',
    headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify([{
      keywords, location_code: 2036, language_code: 'en',
    }]),
  })
  const j = await r.json()
  return j.tasks?.[0]?.result || []
}

console.log(`\n=== KEYWORD VOLUME — Expansion (baby shower, decor, props) ===\n`)
const all = []
for (let i = 0; i < SEEDS.length; i += 100) {
  const batch = SEEDS.slice(i, i + 100)
  const r = await getVolume(batch)
  all.push(...r)
  await new Promise(res => setTimeout(res, 500))
}

const sorted = all
  .filter(x => x.keyword)
  .map(x => ({
    keyword: x.keyword,
    monthlySearches: x.search_volume,
    cpc: x.cpc,
    competition: x.competition,
  }))
  .sort((a,b) => (b.monthlySearches||0) - (a.monthlySearches||0))

console.log('Vol/mo  | CPC    | Comp    | Keyword')
console.log('-'.repeat(80))
for (const s of sorted) {
  const vol = (s.monthlySearches?.toLocaleString() || '—').padStart(6)
  const cpc = s.cpc != null ? `$${s.cpc.toFixed(2)}`.padStart(6) : '   —  '
  const comp = (s.competition || '—').padEnd(7)
  console.log(`${vol} | ${cpc} | ${comp} | ${s.keyword}`)
}

mkdirSync('data/snapshots/keyword-research', { recursive: true })
writeFileSync('data/snapshots/keyword-research/au-volume-expansion.json', JSON.stringify({
  fetchedAt: new Date().toISOString(),
  keywords: sorted,
}, null, 2))
console.log(`\nSaved: data/snapshots/keyword-research/au-volume-expansion.json`)
process.exit(0)
