/**
 * Full AU location rank scan — every state + every major city
 * Real-website rank (excludes IG/Facebook/Pinterest/Reddit/YouTube/TikTok)
 */
import 'dotenv/config'
const AUTH = 'Basic ' + Buffer.from(`${process.env.DATAFORSEO_EMAIL}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64')

// Baseline from earlier scans (May 17, May 23, May 25)
const BASELINE_MAY17 = {
  'gender reveal sydney': 4, 'gender reveal melbourne': 5, 'gender reveal brisbane': 1,
  'gender reveal perth': 3, 'gender reveal adelaide': 1, 'gender reveal gold coast': 1,
  'gender reveal darwin': 1, 'gender reveal hobart': null, 'gender reveal canberra': null,
  'gender reveal newcastle': null, 'gender reveal wollongong': null, 'gender reveal sunshine coast': null,
}
const BASELINE_MAY25 = {
  'gender reveal sydney': 1, 'gender reveal melbourne': 5, 'gender reveal brisbane': 2,
  'gender reveal perth': 2, 'gender reveal adelaide': 1, 'gender reveal gold coast': 1,
  'gender reveal darwin': 2, 'gender reveal canberra': 7, 'gender reveal hobart': 4,
  'gender reveal sunshine coast': 21, 'gender reveal newcastle': null, 'gender reveal wollongong': null,
  'gender reveal nsw': 4, 'gender reveal vic': 1, 'gender reveal qld': 1, 'gender reveal wa': 1,
  'gender reveal sa': 1, 'gender reveal tas': 3, 'gender reveal act': null, 'gender reveal nt': 3,
}

const CAPITAL_CITIES = ['sydney','melbourne','brisbane','perth','adelaide','darwin','hobart','canberra','gold coast']
const REGIONAL_CITIES = ['newcastle','wollongong','sunshine coast','geelong','cairns','townsville','central coast','launceston','toowoomba','ballarat','bendigo','mackay','rockhampton']
const STATES = ['nsw','vic','qld','wa','sa','tas','act','nt']
const STATE_FULL = ['new south wales','victoria','queensland','western australia','south australia','tasmania']

const QUERIES = [
  ...CAPITAL_CITIES.map(c => `gender reveal ${c}`),
  ...REGIONAL_CITIES.map(c => `gender reveal ${c}`),
  ...STATES.map(s => `gender reveal ${s}`),
  ...STATE_FULL.map(s => `gender reveal ${s}`),
  // "Ideas" variants for top cities
  ...['sydney','melbourne','brisbane','perth','adelaide','gold coast'].map(c => `gender reveal ideas ${c}`),
]

async function scrape(kw) {
  const r = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/regular', {
    method:'POST', headers:{Authorization:AUTH,'Content-Type':'application/json'},
    body: JSON.stringify([{keyword:kw, location_code:2036, language_code:'en', device:'desktop', depth:30}])
  }).then(r=>r.json())
  return r.tasks?.[0]?.result?.[0]?.items||[]
}

function realWebsiteRank(items) {
  const organic = items.filter(it => it.type === 'organic')
  const realSites = organic.filter(it => !/instagram\.com|facebook\.com|pinterest\.|reddit\.com|youtube\.com|tiktok\.com|twitter\.com|x\.com/i.test(it.domain||''))
  const idx = realSites.findIndex(it => /genderrevealideas\.com\.au/i.test(it.domain||it.url||''))
  if (idx < 0) return { rank: null, url: null }
  return { rank: idx+1, url: realSites[idx].url }
}

console.log(`\n=== FULL AU LOCATION SCAN — ${new Date().toISOString().slice(0,10)} ===\n`)
console.log(`Total queries: ${QUERIES.length}\n`)

const results = []
let idx = 0
for (const kw of QUERIES) {
  idx++
  process.stdout.write(`  [${idx}/${QUERIES.length}] ${kw}... `)
  try {
    const items = await scrape(kw)
    const { rank, url } = realWebsiteRank(items)
    const may17 = BASELINE_MAY17[kw] ?? null
    const may25 = BASELINE_MAY25[kw] ?? null
    results.push({ kw, rank, url, may17, may25 })
    console.log(rank ? `#${rank}` : '—')
  } catch(e) {
    console.log(`ERR`)
    results.push({ kw, rank: null, error: e.message })
  }
  await new Promise(r=>setTimeout(r,350))
}

// Render by category
function render(label, queries) {
  console.log(`\n\n══════════════════════════════════════════════════════════════════════════════`)
  console.log(`  ${label}`)
  console.log(`══════════════════════════════════════════════════════════════════════════════`)
  console.log('Query                                     | May17 | May25 | NOW  | Δ 7d        | Δ 17→26')
  console.log('-'.repeat(110))
  const matching = results.filter(r => queries.some(q => r.kw === q))
  for (const r of matching) {
    const v17 = r.may17 == null ? '—' : `#${r.may17}`
    const v25 = r.may25 == null ? '—' : `#${r.may25}`
    const now = r.rank == null ? '—' : `#${r.rank}`
    const d7 = (r.may25 != null && r.rank != null) ? r.may25 - r.rank : null
    const d17 = (r.may17 != null && r.rank != null) ? r.may17 - r.rank : null
    const fmt = d => d == null ? '—' : d > 0 ? `▲ +${d}` : d < 0 ? `▼ ${d}` : '='
    let newStr = ''
    if (r.may17 == null && r.rank != null) newStr = '🆕 NEW'
    console.log(`${r.kw.padEnd(41)} | ${v17.padStart(5)} | ${v25.padStart(5)} | ${now.padStart(4)} | ${fmt(d7).padEnd(11)} | ${newStr || fmt(d17)}`)
  }
}

render('CAPITAL CITIES (8)', CAPITAL_CITIES.map(c=>`gender reveal ${c}`))
render('REGIONAL CITIES (13)', REGIONAL_CITIES.map(c=>`gender reveal ${c}`))
render('STATES — short codes', STATES.map(s=>`gender reveal ${s}`))
render('STATES — full names', STATE_FULL.map(s=>`gender reveal ${s}`))
render('"GENDER REVEAL IDEAS" variant queries (top 6)', ['sydney','melbourne','brisbane','perth','adelaide','gold coast'].map(c=>`gender reveal ideas ${c}`))

// Summary
console.log(`\n\n══════════════════════════════════════════════════════════════════════════════`)
console.log('  GROWTH SCORECARD')
console.log('══════════════════════════════════════════════════════════════════════════════\n')
const ranking = results.filter(r => r.rank != null)
const top1 = ranking.filter(r => r.rank === 1).length
const top3 = ranking.filter(r => r.rank <= 3).length
const top5 = ranking.filter(r => r.rank <= 5).length
const top10 = ranking.filter(r => r.rank <= 10).length
const movedUp = results.filter(r => r.may25 != null && r.rank != null && r.may25 - r.rank > 0)
const movedDown = results.filter(r => r.may25 != null && r.rank != null && r.may25 - r.rank < 0)
const newEntries = results.filter(r => r.may25 == null && r.rank != null)

console.log(`Total queries checked:      ${results.length}`)
console.log(`Currently ranking in top 30: ${ranking.length} (${(ranking.length/results.length*100).toFixed(0)}%)`)
console.log(`  #1 positions:              ${top1}`)
console.log(`  Top 3:                     ${top3}`)
console.log(`  Top 5:                     ${top5}`)
console.log(`  Top 10:                    ${top10}`)
console.log(`\nMomentum vs 24h ago (May 25):`)
console.log(`  Queries moved UP:          ${movedUp.length} (+${movedUp.reduce((s,r)=>s + (r.may25 - r.rank), 0)} spots)`)
console.log(`  Queries moved DOWN:        ${movedDown.length} (${movedDown.reduce((s,r)=>s + (r.may25 - r.rank), 0)} spots)`)
console.log(`  Brand new entries:         ${newEntries.length}`)
process.exit(0)
