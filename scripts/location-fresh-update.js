/**
 * Fresh location rank update — compare to baseline from May 18
 */
import 'dotenv/config'
import { readFileSync, writeFileSync, existsSync } from 'fs'
const AUTH = 'Basic ' + Buffer.from(`${process.env.DATAFORSEO_EMAIL}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64')

// Load baselines
const baselines = {}
for (const f of ['2026-05-18.json','2026-05-19.json']) {
  const path = `data/rank-baselines/${f}`
  if (existsSync(path)) {
    baselines[f.replace('.json','')] = JSON.parse(readFileSync(path,'utf8')).ranks
  }
}

const LOCATIONS = [
  // Cities (direct)
  'gender reveal sydney','gender reveal melbourne','gender reveal brisbane','gender reveal perth','gender reveal adelaide','gender reveal gold coast','gender reveal newcastle','gender reveal canberra','gender reveal darwin','gender reveal hobart','gender reveal wollongong','gender reveal sunshine coast','gender reveal launceston','gender reveal townsville','gender reveal cairns','gender reveal geelong','gender reveal central coast',
  // Cities ideas variant
  'gender reveal ideas sydney','gender reveal ideas melbourne','gender reveal ideas brisbane','gender reveal ideas perth','gender reveal ideas adelaide','gender reveal ideas gold coast','gender reveal ideas newcastle','gender reveal ideas canberra','gender reveal ideas darwin','gender reveal ideas hobart',
  // States
  'gender reveal nsw','gender reveal vic','gender reveal qld','gender reveal wa','gender reveal sa','gender reveal tas','gender reveal act','gender reveal nt',
]

console.log(`\n=== FRESH LOCATION RANK UPDATE — ${new Date().toISOString().slice(0,16)} ===\n`)
console.log(`Scanning ${LOCATIONS.length} location queries...\n`)

const today = {}
let i=0
for (const kw of LOCATIONS) {
  i++
  process.stdout.write(`\r  [${i}/${LOCATIONS.length}] ${kw.slice(0,45).padEnd(45)}`)
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

// Save current
const todayStr = new Date().toISOString().slice(0,10)
const path = `data/rank-baselines/${todayStr}-locations.json`
writeFileSync(path, JSON.stringify({ ranAt:new Date().toISOString(), ranks: today }, null, 2))

// Compare to Mon May 18 baseline (before batch 2 amplifications)
const may18 = baselines['2026-05-18'] || {}

console.log(`\n=== CITIES — FRESH vs MAY 18 BASELINE ===\n`)
console.log('Query                                  | May 18 | Now    | Δ')
console.log('---------------------------------------+--------+--------+------')
const cityQueries = LOCATIONS.filter(q => !q.includes('ideas') && !['nsw','vic','qld','wa','sa','tas','act','nt'].includes(q.split(' ').pop()))
for (const kw of cityQueries) {
  const old = may18[kw]
  const cur = today[kw]
  const delta = (old && cur) ? old - cur : null
  const change = delta === null ? (cur && !old ? '🆕 NEW' : old && !cur ? '❌ LOST' : '—') : delta > 0 ? `↑${delta}` : delta < 0 ? `↓${-delta}` : '=' 
  console.log(`${kw.padEnd(38)} | ${(old?`#${old}`:'--').padStart(6)} | ${(cur?`#${cur}`:'--').padStart(6)} | ${change}`)
}

console.log(`\n=== "IDEAS" VARIANTS — FRESH vs MAY 18 BASELINE ===\n`)
console.log('Query                                  | May 18 | Now    | Δ')
for (const kw of LOCATIONS.filter(q => q.includes('ideas'))) {
  const old = may18[kw]
  const cur = today[kw]
  const delta = (old && cur) ? old - cur : null
  const change = delta === null ? (cur && !old ? '🆕 NEW' : old && !cur ? '❌ LOST' : '—') : delta > 0 ? `↑${delta}` : delta < 0 ? `↓${-delta}` : '='
  console.log(`${kw.padEnd(38)} | ${(old?`#${old}`:'--').padStart(6)} | ${(cur?`#${cur}`:'--').padStart(6)} | ${change}`)
}

console.log(`\n=== STATES — FRESH vs MAY 18 BASELINE ===\n`)
console.log('Query                                  | May 18 | Now    | Δ')
for (const kw of LOCATIONS.filter(q => ['nsw','vic','qld','wa','sa','tas','act','nt'].includes(q.split(' ').pop()))) {
  const old = may18[kw]
  const cur = today[kw]
  const delta = (old && cur) ? old - cur : null
  const change = delta === null ? (cur && !old ? '🆕 NEW' : old && !cur ? '❌ LOST' : '—') : delta > 0 ? `↑${delta}` : delta < 0 ? `↓${-delta}` : '='
  console.log(`${kw.padEnd(38)} | ${(old?`#${old}`:'--').padStart(6)} | ${(cur?`#${cur}`:'--').padStart(6)} | ${change}`)
}

// Summary
console.log(`\n=== SCORECARD ===`)
const ranking = Object.values(today).filter(r=>r).length
const top1 = Object.values(today).filter(r=>r===1).length
const top3 = Object.values(today).filter(r=>r&&r<=3).length
const top10 = Object.values(today).filter(r=>r&&r<=10).length
console.log(`Total: ${LOCATIONS.length} | Ranking: ${ranking} | #1: ${top1} | Top 3: ${top3} | Top 10: ${top10}`)

const may18Stats = LOCATIONS.map(kw => may18[kw]).filter(r=>r)
console.log(`\nMay 18 baseline: #1=${may18Stats.filter(r=>r===1).length} | Top 3=${may18Stats.filter(r=>r<=3).length} | Top 10=${may18Stats.filter(r=>r<=10).length}`)
process.exit(0)
