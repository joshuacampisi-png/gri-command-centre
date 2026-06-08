/**
 * Pull current AU SERP rankings for city queries; compare to baseline from earlier this week.
 */
import 'dotenv/config'
const AUTH = 'Basic ' + Buffer.from(`${process.env.DATAFORSEO_EMAIL}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64')

// Baseline captured earlier this week (verified live)
const BASELINE = {
  'gender reveal sydney':         4,
  'gender reveal melbourne':      5,
  'gender reveal brisbane':       1,
  'gender reveal perth':          3,
  'gender reveal adelaide':       1,
  'gender reveal gold coast':     1,
  'gender reveal darwin':         1,
  'gender reveal newcastle':      null,
  'gender reveal canberra':       null,
  'gender reveal hobart':         null,
  'gender reveal wollongong':     null,
  'gender reveal sunshine coast': null,
  'gender reveal ideas sydney':       null,
  'gender reveal ideas melbourne':    null,
  'gender reveal ideas brisbane':     null,
  'gender reveal ideas perth':        null,
  'gender reveal ideas adelaide':     null,
  'gender reveal ideas gold coast':   null,
}

async function scrape(kw) {
  const r = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/regular', {
    method:'POST', headers:{Authorization:AUTH,'Content-Type':'application/json'},
    body: JSON.stringify([{keyword:kw, location_code:2036, language_code:'en', device:'desktop', depth:30}])
  }).then(r=>r.json())
  return r.tasks?.[0]?.result?.[0]?.items || []
}

console.log(`\n=== LOCATION RANK DELTA — ${new Date().toISOString().slice(0,10)} ===\n`)
console.log('Query                                  | Prev | Now  | Δ            | URL')
console.log('---------------------------------------+------+------+--------------+-------------------------------')

const results = []
const queries = Object.keys(BASELINE)
for (let i=0; i<queries.length; i++) {
  const kw = queries[i]
  process.stdout.write(`  [${i+1}/${queries.length}] ${kw}\r`)
  try {
    const items = await scrape(kw)
    const ours = items.find(it => it.type==='organic' && /genderrevealideas\.com\.au/i.test(it.domain||it.url||''))
    const now = ours ? (ours.rank_absolute || ours.rank_group) : null
    const prev = BASELINE[kw]
    let deltaStr = ''
    if (prev != null && now != null) {
      const d = prev - now  // positive = moved up
      deltaStr = d > 0 ? `▲ +${d} spots` : d < 0 ? `▼ ${d} spots` : `= no change`
    } else if (prev == null && now != null) {
      deltaStr = `🆕 NEW entry`
    } else if (prev != null && now == null) {
      deltaStr = `❌ DROPPED out`
    } else {
      deltaStr = `— not ranking`
    }
    const url = ours ? (ours.url||'').replace('https://genderrevealideas.com.au','').slice(0,40) : ''
    const prevStr = prev==null ? '—' : `#${prev}`
    const nowStr  = now==null  ? '—' : `#${now}`
    console.log(`${kw.padEnd(38)} | ${prevStr.padStart(4)} | ${nowStr.padStart(4)} | ${deltaStr.padEnd(12)} | ${url}`)
    results.push({ kw, prev, now, delta: prev!=null && now!=null ? prev-now : null })
  } catch (e) {
    console.log(`${kw.padEnd(38)} | ERROR: ${e.message?.slice(0,40)}`)
  }
  await new Promise(r=>setTimeout(r,400))
}

// Summary
console.log(`\n=== SUMMARY ===`)
const ranking = results.filter(r => r.now != null)
const top1 = ranking.filter(r => r.now === 1).length
const top3 = ranking.filter(r => r.now <= 3).length
const top10 = ranking.filter(r => r.now <= 10).length
const moved = results.filter(r => r.delta != null && r.delta !== 0)
const totalMovedUp = results.filter(r => r.delta != null && r.delta > 0).reduce((a,b)=>a+b.delta,0)
const totalMovedDown = results.filter(r => r.delta != null && r.delta < 0).reduce((a,b)=>a+b.delta,0)

console.log(`Total queries checked: ${results.length}`)
console.log(`Now ranking in top 30: ${ranking.length}`)
console.log(`  #1:        ${top1}`)
console.log(`  Top 3:     ${top3}`)
console.log(`  Top 10:    ${top10}`)
console.log(`\nNet movement: +${totalMovedUp} spots up, ${totalMovedDown} spots down`)
console.log(`Queries that moved: ${moved.length}`)

process.exit(0)
