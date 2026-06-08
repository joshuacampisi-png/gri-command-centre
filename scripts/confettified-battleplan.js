/**
 * Map every query where Confettified beats us (or co-ranks) — sized by AU search volume.
 * Output a battle plan with $ math on what we'd actually win.
 */
import 'dotenv/config'
const AUTH = 'Basic ' + Buffer.from(`${process.env.DATAFORSEO_EMAIL}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64')

const CATEGORY_KWS = [
  'gender reveal', 'gender reveal ideas', 'gender reveal cannons', 'gender reveal cannon',
  'gender reveal party', 'gender reveal australia', 'gender reveal kit', 'gender reveal balloons',
  'gender reveal smoke bomb', 'gender reveal smoke bombs', 'gender reveal powder',
  'gender reveal powder cannon', 'powder cannon', 'confetti cannon', 'confetti cannons',
  'gender reveal decorations', 'gender reveal cake', 'baby gender reveal',
  'gender reveal extinguisher', 'gender reveal bundle', 'gender reveal supplies',
  'pink or blue gender reveal', 'gender reveal pinata', 'gender reveal football',
  'gender reveal basketball', 'gender reveal soccer ball', 'gender reveal golf ball',
  'gender reveal smoke', 'gender reveal box', 'gender reveal poppers',
]

// Step 1: pull search volumes
console.log('Step 1: Pulling search volumes...\n')
const volRes = await fetch('https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live', {
  method:'POST',
  headers:{Authorization:AUTH,'Content-Type':'application/json'},
  body: JSON.stringify([{ keywords: CATEGORY_KWS, location_code: 2036, language_code: 'en' }])
}).then(r=>r.json())
const volMap = new Map()
for (const it of (volRes.tasks?.[0]?.result||[])) volMap.set(it.keyword, { vol: it.search_volume||0, cpc: it.high_top_of_page_bid||0, comp: it.competition })

// Step 2: scrape SERP for each, capture GRI vs Confettified positions
async function scrape(kw) {
  const r = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/regular', {
    method:'POST', headers:{Authorization:AUTH,'Content-Type':'application/json'},
    body: JSON.stringify([{keyword:kw, location_code:2036, language_code:'en', device:'desktop', depth:20}])
  }).then(r=>r.json())
  return r.tasks?.[0]?.result?.[0]?.items||[]
}

console.log('Step 2: Scraping SERPs (29 queries × 1 device)...\n')
const results = []
for (const kw of CATEGORY_KWS) {
  process.stdout.write(`  ${kw}... `)
  try {
    const items = await scrape(kw)
    const gri = items.find(it => it.type==='organic' && /genderrevealideas/i.test(it.domain||''))
    const conf = items.find(it => it.type==='organic' && /confettified/i.test(it.domain||''))
    const v = volMap.get(kw) || { vol:0, cpc:0 }
    const griRank = gri ? (gri.rank_absolute||gri.rank_group) : null
    const confRank = conf ? (conf.rank_absolute||conf.rank_group) : null
    results.push({ kw, vol:v.vol, cpc:v.cpc, comp:v.comp, griRank, confRank })
    console.log(`vol:${v.vol} | GRI:${griRank||'—'} | Conf:${confRank||'—'}`)
  } catch(e) { console.log('ERR') }
  await new Promise(r=>setTimeout(r,350))
}

// CTR curve
const CTR = { 1:0.30, 2:0.15, 3:0.10, 4:0.07, 5:0.05, 6:0.04, 7:0.03, 8:0.025, 9:0.02, 10:0.018 }
const ctr = r => r && r <= 10 ? CTR[r] : (r ? 0.01 : 0)

console.log('\n\n=== BATTLEFIELD MAP ===\n')
console.log('Keyword                            | Vol/mo | GRI  | Conf | Status                | Their est clicks/mo')
console.log('-'.repeat(115))
let totalAddressable = 0
let confTotalClicks = 0
let griTotalClicks = 0
let confWinning = []  // where conf ranks better than us
let bothRanking = []
for (const r of results.sort((a,b)=>b.vol-a.vol)) {
  totalAddressable += r.vol
  const cClicks = Math.round(r.vol * ctr(r.confRank))
  const gClicks = Math.round(r.vol * ctr(r.griRank))
  confTotalClicks += cClicks
  griTotalClicks += gClicks
  let status = ''
  if (r.confRank && r.griRank) {
    if (r.confRank < r.griRank) { status = `🔴 CONF wins by ${r.griRank-r.confRank}`; confWinning.push(r) }
    else status = `✅ GRI wins by ${r.confRank-r.griRank}`
    bothRanking.push(r)
  } else if (r.confRank && !r.griRank) { status = `🚨 CONF only`; confWinning.push(r) }
  else if (!r.confRank && r.griRank) status = '✅ GRI only'
  else status = '— neither'
  console.log(`${r.kw.padEnd(34)} | ${String(r.vol).padStart(6)} | ${String(r.griRank||'—').padStart(4)} | ${String(r.confRank||'—').padStart(4)} | ${status.padEnd(21)} | ${cClicks}`)
}

console.log(`\n=== SIZE OF PRIZE ===`)
console.log(`Total addressable category volume:  ${totalAddressable.toLocaleString()} searches/mo`)
console.log(`Estimated Confettified clicks/mo:   ${confTotalClicks.toLocaleString()}`)
console.log(`Estimated GRI clicks/mo:            ${griTotalClicks.toLocaleString()}`)
console.log(`Confettified click share:           ${(confTotalClicks/(confTotalClicks+griTotalClicks)*100).toFixed(1)}% of the two of us`)

// Estimate revenue: assume 3% PDP CVR, avg AOV $90
const PDP_CVR = 0.03
const AOV = 90
const confRevMo = confTotalClicks * PDP_CVR * AOV
const griRevMo  = griTotalClicks * PDP_CVR * AOV
console.log(`\nAt 3% CVR × $90 AOV (industry-typical for category):`)
console.log(`  Confettified est revenue:         $${Math.round(confRevMo).toLocaleString()}/mo from organic search`)
console.log(`  GRI est revenue:                  $${Math.round(griRevMo).toLocaleString()}/mo from organic search`)

console.log(`\n=== QUERIES WHERE CONFETTIFIED WINS (priority hit list) ===`)
for (const r of confWinning.sort((a,b)=>b.vol-a.vol)) {
  const winsBy = r.griRank ? (r.griRank - r.confRank) + ' spots' : 'CONF only — we don\'t rank'
  const estClicksToWin = Math.round(r.vol * (ctr(r.confRank) - ctr(r.griRank||30)))
  const estMonthlyValueToWin = Math.round(estClicksToWin * PDP_CVR * AOV)
  console.log(`  ${r.kw.padEnd(34)} | vol ${String(r.vol).padStart(5)} | GRI #${r.griRank||'—'} → CONF #${r.confRank} (${winsBy}) | win = +${estClicksToWin} clk/mo = $${estMonthlyValueToWin}/mo`)
}
process.exit(0)
