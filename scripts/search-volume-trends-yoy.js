/**
 * AU Search Volume Trends — historical monthly data via DataForSEO
 * To answer: have search volumes for our queries dropped YoY?
 */
import 'dotenv/config'
import { writeFileSync, mkdirSync } from 'fs'

const AUTH = 'Basic ' + Buffer.from(`${process.env.DATAFORSEO_EMAIL}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64')

const KEYWORDS = [
  'gender reveal',
  'gender reveal ideas',
  'gender reveal cannon',
  'gender reveal smoke bombs',
  'gender reveal extinguisher',
  'gender reveal australia',
  'tnt gender reveal',
  'gender reveal balloons',
  'confetti cannon',
  'baby shower decorations',
  'gender reveal mega blaster',
  'gender reveal blasters',
  'gender reveal smoke bomb',
  'gender reveal kit',
  'gender reveal party',
]

async function vol(keywords) {
  // Use historical_search_volume for monthly trends
  const r = await fetch('https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live', {
    method: 'POST',
    headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify([{ keywords, location_code: 2036, language_code: 'en' }]),
  })
  return (await r.json()).tasks?.[0]?.result || []
}

console.log('\n=== AU SEARCH VOLUME — current month + trend if available ===\n')
const r = await vol(KEYWORDS)
console.log('Keyword                              | Avg Vol/mo | CPC    | Comp    | YoY trend (if 12 months data)')
console.log('-'.repeat(105))
for (const x of r) {
  // Some endpoints return monthly_searches array — try to use it
  let yoyNote = ''
  if (Array.isArray(x.monthly_searches) && x.monthly_searches.length >= 12) {
    const latest = x.monthly_searches[0]?.search_volume || 0
    const yearAgo = x.monthly_searches[11]?.search_volume || 0
    if (yearAgo > 0) {
      const delta = ((latest - yearAgo) / yearAgo * 100).toFixed(0)
      yoyNote = `latest:${latest} vs yearAgo:${yearAgo} (${delta>=0?'+':''}${delta}%)`
    }
  }
  console.log(`${(x.keyword||'').padEnd(38)} | ${String(x.search_volume||0).padStart(7)}    | $${(x.cpc||0).toFixed(2)} | ${(x.competition||'—').padEnd(7)} | ${yoyNote}`)
}

// Try historical search volume endpoint — different API endpoint
console.log('\n\n=== HISTORICAL MONTHLY VOLUME (DataForSEO Labs historical) ===\n')
const r2 = await fetch('https://api.dataforseo.com/v3/dataforseo_labs/google/historical_search_volume/live', {
  method: 'POST',
  headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
  body: JSON.stringify([{
    keywords: KEYWORDS,
    location_code: 2036,
    language_code: 'en',
  }]),
}).then(rs => rs.json()).catch(e => null)

if (r2 && !r2.tasks?.[0]?.status_message?.toLowerCase().includes('error')) {
  const items = r2.tasks?.[0]?.result?.[0]?.items || []
  console.log(`Got historical data for ${items.length} keywords\n`)
  for (const x of items) {
    console.log(`\n[${x.keyword}]`)
    if (Array.isArray(x.history)) {
      console.log('Month       | Vol')
      for (const h of x.history.slice(-15)) {
        console.log(`  ${h.year}-${String(h.month).padStart(2,'0')}  | ${h.search_volume}`)
      }
    }
  }
} else {
  console.log('Historical endpoint not available or errored:', r2?.tasks?.[0]?.status_message || 'no data')
}

mkdirSync('data/snapshots/search-volume-trends', { recursive: true })
writeFileSync('data/snapshots/search-volume-trends/snapshot.json', JSON.stringify(r, null, 2))
console.log('\nSaved: data/snapshots/search-volume-trends/snapshot.json')
process.exit(0)
