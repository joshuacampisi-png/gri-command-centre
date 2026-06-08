import 'dotenv/config'
import { readFileSync, existsSync } from 'fs'
const AUTH = 'Basic ' + Buffer.from(`${process.env.DATAFORSEO_EMAIL}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64')

const HEAD = [
  'gender reveal','gender reveal ideas','gender reveal australia',
  'gender reveal smoke bomb','gender reveal smoke bombs',
  'gender reveal cannon','gender reveal cannons',
  'gender reveal extinguisher','gender reveal powder',
  'gender reveal balloon','gender reveal kit','gender reveal bundle',
  'gender reveal burnout','gender reveal poppers',
  'gender reveal party','gender reveal ideas australia',
  'gender reveal smoke','gender reveal confetti',
  'baby gender reveal','gender reveal gift'
]

// Load baselines
const may18 = existsSync('data/rank-baselines/2026-05-18.json') ? JSON.parse(readFileSync('data/rank-baselines/2026-05-18.json','utf8')).ranks : {}
const rankDrops = existsSync('data/rank-drops.json') ? JSON.parse(readFileSync('data/rank-drops.json','utf8')) : []

console.log(`\n=== HEAD TERM RANKINGS — FRESH SCAN ${new Date().toISOString().slice(0,16)} ===\n`)
console.log(`Scanning ${HEAD.length} head terms...\n`)

const today = {}
let i=0
for (const kw of HEAD) {
  i++
  process.stdout.write(`\r  [${i}/${HEAD.length}] ${kw.slice(0,45).padEnd(45)}`)
  try {
    const r = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', {
      method:'POST', headers:{Authorization:AUTH,'Content-Type':'application/json'},
      body: JSON.stringify([{keyword:kw, location_code:2036, language_code:'en', device:'desktop', depth:30}])
    }).then(r=>r.json())
    const items = r.tasks?.[0]?.result?.[0]?.items||[]
    let orgIdx=0, rank=null
    for (const it of items) {
      if (it.type==='organic') { orgIdx++; if (/genderrevealideas\.com\.au/i.test(it.domain||it.url||'') && !rank) rank=orgIdx }
    }
    today[kw] = rank
  } catch (e) { today[kw] = null }
  await new Promise(r=>setTimeout(r,200))
}
console.log('\n')

console.log('Query                             | May 18  | Now   | Δ      | History')
console.log('----------------------------------+---------+-------+--------+--------')
for (const kw of HEAD) {
  const old = may18[kw]
  const cur = today[kw]
  const delta = (old && cur) ? old - cur : null
  const change = delta === null ? (cur && !old ? '🆕 NEW' : old && !cur ? '❌ LOST' : '—') : delta > 0 ? `↑${delta}` : delta < 0 ? `↓${-delta}` : '='
  const drop = rankDrops.find(d => d.keyword.toLowerCase() === kw.toLowerCase())
  let history = ''
  if (drop) history = `was #${drop.previousRank} (${drop.detectedAt?.slice(0,10)})`
  console.log(`${kw.padEnd(33)} | ${(old?`#${old}`:'--').padStart(6)} | ${(cur?`#${cur}`:'--').padStart(5)} | ${change.padStart(6)} | ${history}`)
}

console.log(`\n=== HEAD TERM SCORECARD ===`)
const may18Stats = HEAD.map(kw => may18[kw]).filter(r=>r)
const todayStats = HEAD.map(kw => today[kw]).filter(r=>r)
console.log('Metric        | May 18 | Now | Δ')
console.log('--------------+--------+-----+-----')
console.log(`Ranking total | ${may18Stats.length.toString().padStart(6)} | ${todayStats.length.toString().padStart(3)} | ${todayStats.length-may18Stats.length}`)
console.log(`At #1         | ${may18Stats.filter(r=>r===1).length.toString().padStart(6)} | ${todayStats.filter(r=>r===1).length.toString().padStart(3)} | ${todayStats.filter(r=>r===1).length - may18Stats.filter(r=>r===1).length}`)
console.log(`Top 3         | ${may18Stats.filter(r=>r<=3).length.toString().padStart(6)} | ${todayStats.filter(r=>r<=3).length.toString().padStart(3)} | ${todayStats.filter(r=>r<=3).length - may18Stats.filter(r=>r<=3).length}`)
console.log(`Top 5         | ${may18Stats.filter(r=>r<=5).length.toString().padStart(6)} | ${todayStats.filter(r=>r<=5).length.toString().padStart(3)} | ${todayStats.filter(r=>r<=5).length - may18Stats.filter(r=>r<=5).length}`)
console.log(`Top 10        | ${may18Stats.filter(r=>r<=10).length.toString().padStart(6)} | ${todayStats.filter(r=>r<=10).length.toString().padStart(3)} | ${todayStats.filter(r=>r<=10).length - may18Stats.filter(r=>r<=10).length}`)

// Average position
const may18Avg = may18Stats.length ? (may18Stats.reduce((a,b)=>a+b,0)/may18Stats.length).toFixed(1) : '-'
const todayAvg = todayStats.length ? (todayStats.reduce((a,b)=>a+b,0)/todayStats.length).toFixed(1) : '-'
console.log(`Avg position  | ${may18Avg.padStart(6)} | ${todayAvg.padStart(3)} | (lower = better)`)

process.exit(0)
