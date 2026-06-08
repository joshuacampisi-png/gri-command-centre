/**
 * RANK GROWTH REPORT
 * 1. Save TODAY's rankings as a baseline
 * 2. Compare to historical data we have (rank-drops.json + DataForSEO history endpoint where possible)
 * 3. Show what's grown vs declined
 */
import 'dotenv/config'
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs'
const AUTH = 'Basic ' + Buffer.from(`${process.env.DATAFORSEO_EMAIL}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64')

const BASELINE_DIR = 'data/rank-baselines'
mkdirSync(BASELINE_DIR, { recursive: true })

const QUERIES = [
  // Head
  'gender reveal','gender reveal ideas','gender reveal australia','gender reveal smoke bomb','gender reveal smoke bombs','gender reveal cannon','gender reveal cannons','gender reveal extinguisher','gender reveal powder','gender reveal balloon','gender reveal kit','gender reveal bundle','gender reveal burnout',
  // Cities (direct)
  'gender reveal sydney','gender reveal melbourne','gender reveal brisbane','gender reveal perth','gender reveal adelaide','gender reveal gold coast','gender reveal newcastle','gender reveal canberra','gender reveal darwin','gender reveal hobart','gender reveal wollongong','gender reveal sunshine coast','gender reveal launceston','gender reveal townsville','gender reveal cairns',
  // Cities (ideas variant)
  'gender reveal ideas sydney','gender reveal ideas melbourne','gender reveal ideas brisbane','gender reveal ideas perth','gender reveal ideas adelaide','gender reveal ideas gold coast','gender reveal ideas newcastle','gender reveal ideas canberra','gender reveal ideas darwin','gender reveal ideas hobart',
  // States
  'gender reveal nsw','gender reveal vic','gender reveal qld','gender reveal wa','gender reveal sa','gender reveal tas','gender reveal act','gender reveal nt',
]

// 1. Scan current rankings
console.log(`\n=== SCAN — current organic rank for ${QUERIES.length} queries ===`)
const today = {}
let i=0
for (const kw of QUERIES) {
  i++
  process.stdout.write(`\r[${i}/${QUERIES.length}] ${kw.slice(0,45).padEnd(45)}`)
  try {
    const r = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', {
      method:'POST', headers:{Authorization:AUTH,'Content-Type':'application/json'},
      body: JSON.stringify([{keyword:kw, location_code:2036, language_code:'en', device:'desktop', depth:30}])
    }).then(r=>r.json())
    const items = r.tasks?.[0]?.result?.[0]?.items || []
    let orgIdx = 0, rank = null
    for (const it of items) {
      if (it.type === 'organic') {
        orgIdx++
        if (/genderrevealideas\.com\.au/i.test(it.domain||it.url||'') && !rank) rank = orgIdx
      }
    }
    today[kw] = rank
  } catch (e) { today[kw] = null }
  await new Promise(r=>setTimeout(r,200))
}
console.log('\n')

// 2. Save baseline for today
const todayStr = new Date().toISOString().slice(0,10)
writeFileSync(`${BASELINE_DIR}/${todayStr}.json`, JSON.stringify({ ranAt:new Date().toISOString(), ranks: today }, null, 2))
console.log(`Baseline saved: ${BASELINE_DIR}/${todayStr}.json`)

// 3. Build historical map from any prior baselines + rank-drops.json
const history = {}
// Prior baselines
const files = readdirSync(BASELINE_DIR).filter(f => f.endsWith('.json') && f !== `${todayStr}.json`).sort()
for (const f of files) {
  const data = JSON.parse(readFileSync(`${BASELINE_DIR}/${f}`,'utf8'))
  const date = f.replace('.json','')
  for (const [kw,rank] of Object.entries(data.ranks||{})) {
    history[kw] = history[kw]||[]
    history[kw].push({ date, rank })
  }
}
// rank-drops.json data
if (existsSync('data/rank-drops.json')) {
  const drops = JSON.parse(readFileSync('data/rank-drops.json','utf8'))
  for (const d of drops) {
    const kw = d.keyword.toLowerCase()
    if (QUERIES.includes(kw) || QUERIES.some(q=>q.toLowerCase()===kw)) {
      history[kw] = history[kw]||[]
      // The drop showed previousRank then currentRank
      history[kw].push({ date: d.detectedAt?.slice(0,10), rank: d.previousRank, note: 'pre-drop' })
      history[kw].push({ date: d.detectedAt?.slice(0,10), rank: d.currentRank, note: 'post-drop' })
    }
  }
}

// 4. Comparison report
console.log(`\n=== RANK GROWTH vs HISTORICAL DATA ===\n`)
console.log('Keyword                           | Today | Past   | Change')
console.log('----------------------------------+-------+--------+-------')
const growth = []
for (const kw of QUERIES) {
  const cur = today[kw]
  const hist = history[kw] || history[kw.toLowerCase()]
  if (!hist || !hist.length) continue
  const past = hist[0]?.rank
  if (cur==null || past==null) continue
  const delta = past - cur  // positive = improvement (lower rank number = better)
  const change = cur === past ? '=' : delta > 0 ? `↑ ${delta}` : `↓ ${-delta}`
  growth.push({ kw, today: cur, past, delta, pastDate: hist[0]?.date })
  console.log(`${kw.padEnd(33)} | ${(cur?`#${cur}`:'--').padStart(5)} | ${(past?`#${past}`:'--').padStart(6)} | ${change}`)
}

// Sort by biggest gainer
console.log(`\n=== TOP GAINERS ===`)
const gainers = growth.filter(g => g.delta > 0).sort((a,b)=>b.delta-a.delta)
for (const g of gainers.slice(0,10)) console.log(`  ↑ ${g.delta} — ${g.kw} (#${g.past} → #${g.today}, since ${g.pastDate})`)

console.log(`\n=== DECLINERS ===`)
const decliners = growth.filter(g => g.delta < 0).sort((a,b)=>a.delta-b.delta)
for (const g of decliners.slice(0,10)) console.log(`  ↓ ${-g.delta} — ${g.kw} (#${g.past} → #${g.today})`)

// Summary of today's coverage
console.log(`\n=== TODAY'S COVERAGE SNAPSHOT ===`)
const ranking = Object.values(today).filter(r=>r).length
const top1 = Object.values(today).filter(r=>r===1).length
const top3 = Object.values(today).filter(r=>r&&r<=3).length
const top10 = Object.values(today).filter(r=>r&&r<=10).length
console.log(`Ranking: ${ranking}/${QUERIES.length}  |  #1: ${top1}  |  Top 3: ${top3}  |  Top 10: ${top10}`)
console.log(`\nBaseline saved. Re-run anytime to see growth from today forward.`)
process.exit(0)
