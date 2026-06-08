/**
 * AU GENDER REVEAL MARKET SHARE
 *
 * For every gender reveal commercial-intent query (volume >= 20/mo in AU),
 * pull the top 10 organic SERP results, then compute estimated market share
 * per domain using position-based CTR × monthly volume.
 *
 * Sources:
 *   - DataForSEO Google Ads search_volume (live)
 *   - DataForSEO Google organic SERP (live, location_code=2036=AU)
 *
 * CTR by position (Advanced Web Ranking 2024 industry baseline):
 *   1: 28%, 2: 15%, 3: 11%, 4: 8%, 5: 6%, 6: 5%, 7: 4%, 8: 3%, 9: 2.5%, 10: 2%
 */
import 'dotenv/config'

const EMAIL = process.env.DATAFORSEO_EMAIL
const PASSWORD = process.env.DATAFORSEO_PASSWORD
const AUTH = 'Basic ' + Buffer.from(`${EMAIL}:${PASSWORD}`).toString('base64')

const CTR = { 1: 0.28, 2: 0.15, 3: 0.11, 4: 0.08, 5: 0.06, 6: 0.05, 7: 0.04, 8: 0.03, 9: 0.025, 10: 0.02 }

// All gender reveal commercial-intent queries (product / location intent only — excludes "cake", "test kit" pregnancy tests)
const KEYWORDS = [
  // Head terms
  'gender reveal', 'gender reveal ideas', 'gender reveal australia', 'gender reveal party',
  // Product categories
  'gender reveal cannon', 'gender reveal cannons', 'gender reveal poppers', 'gender reveal balloon',
  'gender reveal box', 'gender reveal smoke', 'gender reveal smoke bomb', 'gender reveal smoke cannon',
  'gender reveal extinguisher', 'gender reveal powder', 'gender reveal confetti', 'gender reveal kit',
  'gender reveal supplies', 'gender reveal blaster', 'gender reveal tnt', 'gender reveal burnout',
  'gender reveal dry ice', 'gender reveal football', 'gender reveal golf ball', 'gender reveal fireworks',
  // Cities
  'gender reveal sydney', 'gender reveal melbourne', 'gender reveal brisbane', 'gender reveal perth',
  'gender reveal adelaide', 'gender reveal gold coast', 'gender reveal newcastle', 'gender reveal canberra',
  'gender reveal hobart', 'gender reveal sunshine coast', 'gender reveal wollongong', 'gender reveal darwin',
  'gender reveal geelong', 'gender reveal cairns', 'gender reveal launceston', 'gender reveal central coast',
  // States
  'gender reveal nsw', 'gender reveal victoria', 'gender reveal queensland', 'gender reveal wa', 'gender reveal sa',
  'gender reveal tasmania', 'gender reveal act', 'gender reveal nt', 'gender reveal western australia',
  'gender reveal south australia', 'gender reveal northern territory',
]

async function dfs(path, body) {
  const r = await fetch(`https://api.dataforseo.com/v3/${path}`, {
    method: 'POST',
    headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return r.json()
}

// 1. Pull search volumes for all keywords
console.log(`\n=== PULLING SEARCH VOLUMES (${KEYWORDS.length} keywords) ===`)
const volRes = await dfs('keywords_data/google_ads/search_volume/live', [{
  location_code: 2036, language_code: 'en', keywords: KEYWORDS,
}])
const volumes = {}
for (const it of volRes.tasks?.[0]?.result || []) {
  volumes[it.keyword] = it.search_volume || 0
}
const totalVolume = Object.values(volumes).reduce((a,b)=>a+b, 0)
console.log(`Total monthly search volume across all queries: ${totalVolume}`)
console.log(`Top 10 by volume:`)
const sortedVol = Object.entries(volumes).sort((a,b) => b[1]-a[1])
for (const [kw, v] of sortedVol.slice(0, 12)) {
  console.log(`  ${v.toString().padStart(5)} | ${kw}`)
}

// 2. Pull SERP for each keyword — DFS live SERP only allows 1 task per request, batch sequentially
console.log(`\n=== PULLING LIVE SERP FOR EACH KEYWORD (${KEYWORDS.length} queries, ~13s each) ===`)
const serps = {}
let i = 0
for (const kw of KEYWORDS) {
  i++
  process.stdout.write(`  [${i}/${KEYWORDS.length}] ${kw.padEnd(45)}`)
  try {
    const serpRes = await dfs('serp/google/organic/live/regular', [{
      keyword: kw, location_code: 2036, language_code: 'en', device: 'desktop', depth: 10,
    }])
    const items = serpRes.tasks?.[0]?.result?.[0]?.items || []
    const organic = items.filter(it => it.type === 'organic').slice(0, 10)
    serps[kw] = organic.map((it) => ({
      position: it.rank_group,  // organic rank position 1-10
      domain: it.domain,
      url: it.url,
      title: it.title,
    }))
    const top = serps[kw][0]?.domain || 'NONE'
    console.log(` → top: ${top}`)
  } catch (e) {
    console.log(` → ERROR ${e.message?.slice(0,60)}`)
    serps[kw] = []
  }
}

// 3. Calculate market share
console.log(`\n=== CALCULATING MARKET SHARE ===`)
const domainStats = {}  // domain -> { clicks, queries, top1, top3, top10 }

function addStat(domain, key, val = 1) {
  if (!domain) return
  domainStats[domain] = domainStats[domain] || { clicks: 0, queries: 0, top1: 0, top3: 0, top10: 0 }
  domainStats[domain][key] += val
}

let totalClicks = 0
for (const kw of KEYWORDS) {
  const vol = volumes[kw] || 0
  const results = serps[kw] || []
  for (const r of results) {
    const ctr = CTR[r.position] || 0
    const clicks = vol * ctr
    totalClicks += clicks
    addStat(r.domain, 'clicks', clicks)
    addStat(r.domain, 'queries')
    if (r.position === 1) addStat(r.domain, 'top1')
    if (r.position <= 3) addStat(r.domain, 'top3')
    if (r.position <= 10) addStat(r.domain, 'top10')
  }
}

const ranked = Object.entries(domainStats)
  .map(([d, s]) => ({ domain: d, ...s, share: s.clicks / totalClicks * 100 }))
  .sort((a,b) => b.share - a.share)

console.log(`\nTotal estimated monthly clicks across all queries: ${Math.round(totalClicks)}`)
console.log(`Total monthly search volume: ${totalVolume}`)
console.log(`\n=== TOP 20 DOMAINS BY MARKET SHARE (organic clicks captured) ===\n`)
console.log('Rank | Share% | Est Clicks/mo | Top-1s | Top-3s | Top-10s | Domain')
console.log('-----+--------+---------------+--------+--------+---------+--------')
for (const [i, d] of ranked.slice(0, 20).entries()) {
  console.log(`${(i+1).toString().padStart(4)} | ${d.share.toFixed(1).padStart(5)}% | ${Math.round(d.clicks).toString().padStart(13)} | ${d.top1.toString().padStart(6)} | ${d.top3.toString().padStart(6)} | ${d.top10.toString().padStart(7)} | ${d.domain}`)
}

// Save full data
const fs = await import('fs')
fs.mkdirSync('data/snapshots/market-share', { recursive: true })
fs.writeFileSync('data/snapshots/market-share/au-gender-reveal-' + new Date().toISOString().slice(0,10) + '.json', JSON.stringify({ runAt: new Date().toISOString(), totalVolume, totalClicks, volumes, serps, ranked }, null, 2))
console.log(`\nFull snapshot saved.`)
process.exit(0)
