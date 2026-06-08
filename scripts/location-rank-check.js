/**
 * LOCATION RANKINGS — current AU SERP positions for city/state queries
 * Uses DataForSEO live organic SERP scrape, location 2036 = AU
 */
import 'dotenv/config'
const AUTH = 'Basic ' + Buffer.from(`${process.env.DATAFORSEO_EMAIL}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64')

const CITIES = ['sydney','melbourne','brisbane','perth','adelaide','gold coast','newcastle','canberra','darwin','hobart','wollongong','sunshine coast','geelong','cairns','central coast','launceston','townsville']
const STATES = ['nsw','vic','qld','wa','sa','tas','act','nt','new south wales','victoria','queensland','western australia','south australia','tasmania']

const QUERIES = [
  ...CITIES.map(c => `gender reveal ${c}`),
  ...CITIES.map(c => `gender reveal ideas ${c}`).slice(0,8),  // top 8 cities only for "ideas" variant
  ...STATES.slice(0,8).map(s => `gender reveal ${s}`),
]

async function scrape(kw) {
  const r = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/regular', {
    method:'POST', headers:{Authorization:AUTH,'Content-Type':'application/json'},
    body: JSON.stringify([{keyword:kw, location_code:2036, language_code:'en', device:'desktop', depth:30}])
  }).then(r=>r.json())
  return r.tasks?.[0]?.result?.[0]?.items||[]
}

console.log(`\n=== LOCATION ORGANIC RANKINGS — ${new Date().toISOString().slice(0,10)} ===\n`)
console.log('Query                                  | Rank | URL preview')
console.log('---------------------------------------+------+------------------------------------')

const results = []
let idx = 0
for (const kw of QUERIES) {
  idx++
  process.stdout.write(`  [${idx}/${QUERIES.length}] ${kw}... `)
  try {
    const items = await scrape(kw)
    const ours = items.find(it => it.type==='organic' && /genderrevealideas\.com\.au/i.test(it.domain||it.url||''))
    if (ours) {
      const rank = ours.rank_absolute || ours.rank_group
      const url = (ours.url||'').replace('https://genderrevealideas.com.au','').slice(0,40)
      console.log(`\r${kw.padEnd(38)} | #${String(rank).padStart(3)}  | ${url}`)
      results.push({ kw, rank, url, found:true })
    } else {
      console.log(`\r${kw.padEnd(38)} | ---  | NOT IN TOP 30`)
      results.push({ kw, rank:null, found:false })
    }
  } catch (e) {
    console.log(`\r${kw.padEnd(38)} | ERR  | ${e.message?.slice(0,40)}`)
  }
  await new Promise(r => setTimeout(r, 300))
}

// Summary
console.log(`\n\n=== SUMMARY ===\n`)
const found = results.filter(r => r.found)
const notFound = results.filter(r => !r.found)
console.log(`Ranking in top 30: ${found.length}/${results.length}`)
console.log(`Not ranking:       ${notFound.length}/${results.length}`)
const top1 = found.filter(r => r.rank===1).length
const top3 = found.filter(r => r.rank<=3).length
const top10 = found.filter(r => r.rank<=10).length
console.log(`#1:        ${top1}`)
console.log(`Top 3:     ${top3}`)
console.log(`Top 10:    ${top10}`)
console.log(`\nNot ranking on:`)
for (const r of notFound) console.log(`  - ${r.kw}`)
process.exit(0)
