/**
 * Market share v2 — using /serp/google/organic/live/regular endpoint (we have access)
 * Pulls top 30 organic results for top gender reveal queries, classifies each result,
 * estimates GRI vs competitor click share based on CTR curve.
 */
import 'dotenv/config'
import { writeFileSync, mkdirSync } from 'fs'

const auth = 'Basic ' + Buffer.from(`${process.env.DATAFORSEO_EMAIL}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64')

const QUERIES = [
  'gender reveal','gender reveal ideas','gender reveal australia',
  'gender reveal cannons','gender reveal cannon','gender reveal smoke bomb','gender reveal smoke bombs',
  'gender reveal extinguisher','gender reveal kit','gender reveal bundle','gender reveal party',
  'gender reveal balloons','gender reveal decorations','gender reveal powder','gender reveal confetti',
  'baby gender reveal','gender reveal blaster',
  'gender reveal sydney','gender reveal melbourne','gender reveal brisbane','gender reveal perth',
  'gender reveal adelaide','gender reveal gold coast',
  'gender reveal ideas sydney','gender reveal ideas melbourne','gender reveal ideas brisbane',
  'gender reveal ideas perth','gender reveal ideas adelaide',
  'pregnancy announcement',
]

const ORGANIC_CTR = {1:0.30,2:0.15,3:0.10,4:0.07,5:0.05,6:0.04,7:0.03,8:0.025,9:0.02,10:0.018}

function classify(domain) {
  if (!domain) return 'unknown'
  if (/genderrevealideas/i.test(domain)) return 'GRI'
  if (/confettified/i.test(domain)) return 'Confettified'
  if (/etsy/i.test(domain)) return 'Etsy'
  if (/amazon/i.test(domain)) return 'Amazon'
  if (/kmart|bigw|spotlight|target|kogan/i.test(domain)) return 'BigBox'
  if (/pinterest|instagram|tiktok|facebook|youtube/i.test(domain)) return 'Social'
  if (/reddit|quora/i.test(domain)) return 'Forum'
  return 'Other'
}

async function getSerp(q) {
  const r = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/regular', {
    method:'POST', headers:{Authorization:auth,'Content-Type':'application/json'},
    body: JSON.stringify([{keyword:q, location_code:2036, language_code:'en', device:'desktop', depth:30}])
  })
  return r.json()
}

console.log(`\n=== MARKET SHARE — Organic SERP Coverage ===\n`)
console.log(`Pulling top 10 organic results for ${QUERIES.length} AU queries...\n`)

const results = []
for (let i = 0; i < QUERIES.length; i++) {
  const q = QUERIES[i]
  process.stdout.write(`[${(i+1).toString().padStart(2)}/${QUERIES.length}] ${q.padEnd(38)} `)
  try {
    const j = await getSerp(q)
    const items = j?.tasks?.[0]?.result?.[0]?.items || []
    const top10 = items.filter(it => it.type === 'organic' && it.rank_absolute <= 10).slice(0, 10)
    const slots = top10.map(it => ({ pos: it.rank_absolute, domain: it.domain, type: classify(it.domain) }))

    const findFirst = (type) => slots.find(s => s.type === type)?.pos || null
    const r = {
      query: q, slots,
      gri: findFirst('GRI'),
      confetti: findFirst('Confettified'),
      etsy: findFirst('Etsy'),
      amazon: findFirst('Amazon'),
    }
    r.griCtr = r.gri ? (ORGANIC_CTR[r.gri]||0) : 0
    r.conCtr = r.confetti ? (ORGANIC_CTR[r.confetti]||0) : 0
    results.push(r)
    process.stdout.write(`GRI:${r.gri||'-'} Conf:${r.confetti||'-'} Etsy:${r.etsy||'-'} Amz:${r.amazon||'-'}\n`)
    await new Promise(r=>setTimeout(r,400))
  } catch(e) { console.log('ERR:',e.message); results.push({query:q,error:e.message}) }
}

console.log(`\n=== ORGANIC MARKET SHARE ROLLUP ===\n`)
const valid = results.filter(r => !r.error)
const N = valid.length

// Count appearance + position tiers
const tally = {}
for (const r of valid) {
  for (const s of r.slots) {
    if (!tally[s.type]) tally[s.type] = { '1':0,'top3':0,'top5':0,'top10':0,'positions':[] }
    if (s.pos === 1) tally[s.type]['1']++
    if (s.pos <= 3) tally[s.type]['top3']++
    if (s.pos <= 5) tally[s.type]['top5']++
    tally[s.type]['top10']++
    tally[s.type].positions.push(s.pos)
  }
}

console.log(`Competitor                | #1 ranks | Top 3 | Top 5 | Top 10 | Avg position | Coverage %`)
console.log(`-`.repeat(95))
for (const [name, t] of Object.entries(tally).sort((a,b)=>b[1].top10-a[1].top10)) {
  const avg = t.positions.length>0?(t.positions.reduce((a,b)=>a+b,0)/t.positions.length).toFixed(1):'-'
  const cov = (t.top10 / N * 100).toFixed(0)
  console.log(`  ${name.padEnd(24)} | ${String(t['1']).padStart(7)}  | ${String(t.top3).padStart(5)} | ${String(t.top5).padStart(5)} | ${String(t.top10).padStart(6)} | ${avg.padStart(11)}  | ${cov.padStart(5)}%`)
}

// Estimated click share
console.log(`\n=== ESTIMATED ORGANIC CLICK SHARE ===\n`)
const totalGri = valid.reduce((a,r)=>a+r.griCtr,0)
const totalCon = valid.reduce((a,r)=>a+r.conCtr,0)
let totalEtsy=0, totalAmazon=0, totalOther=0
for (const r of valid) {
  for (const s of r.slots) {
    const ctr = ORGANIC_CTR[s.pos]||0
    if (s.type === 'Etsy') totalEtsy += ctr
    else if (s.type === 'Amazon') totalAmazon += ctr
    else if (s.type !== 'GRI' && s.type !== 'Confettified') totalOther += ctr
  }
}
const allClick = totalGri+totalCon+totalEtsy+totalAmazon+totalOther
console.log(`Per-query avg organic click share (top 10 only):`)
console.log(`  GRI:          ${(totalGri/N*100).toFixed(1)}%  (${(totalGri/allClick*100).toFixed(0)}% of all clicked traffic)`)
console.log(`  Confettified: ${(totalCon/N*100).toFixed(1)}%  (${(totalCon/allClick*100).toFixed(0)}%)`)
console.log(`  Etsy:         ${(totalEtsy/N*100).toFixed(1)}%  (${(totalEtsy/allClick*100).toFixed(0)}%)`)
console.log(`  Amazon:       ${(totalAmazon/N*100).toFixed(1)}%  (${(totalAmazon/allClick*100).toFixed(0)}%)`)
console.log(`  Others:       ${(totalOther/N*100).toFixed(1)}%  (${(totalOther/allClick*100).toFixed(0)}%)`)
console.log(`  Sum:          ${(allClick/N*100).toFixed(1)}% (rest is no-click + below-10)`)

// Per-query breakdown — show queries where GRI dominates vs loses
console.log(`\n=== GRI vs CONFETTIFIED HEAD-TO-HEAD ===\n`)
console.log(`Query                                 | GRI | Conf | Winner`)
console.log(`-`.repeat(75))
for (const r of valid) {
  const griPos = r.gri || '—'
  const conPos = r.confetti || '—'
  let win = ''
  if (r.gri && (!r.confetti || r.gri < r.confetti)) win = '✓ GRI'
  else if (r.confetti && (!r.gri || r.confetti < r.gri)) win = '✗ Confetti'
  else win = '—'
  console.log(`  ${r.query.padEnd(38)} | ${String(griPos).padStart(3)} | ${String(conPos).padStart(4)} | ${win}`)
}

const griWins = valid.filter(r => r.gri && (!r.confetti || r.gri < r.confetti)).length
const conWins = valid.filter(r => r.confetti && (!r.gri || r.confetti < r.gri)).length
console.log(`\n  GRI beats Confettified on: ${griWins}/${N} queries (${(griWins/N*100).toFixed(0)}%)`)
console.log(`  Confettified beats GRI on: ${conWins}/${N} queries (${(conWins/N*100).toFixed(0)}%)`)
console.log(`  Neither in top 10:         ${N-griWins-conWins}/${N}`)

mkdirSync('data/snapshots/market-share', { recursive: true })
writeFileSync(`data/snapshots/market-share/${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(results,null,2))

process.exit(0)
