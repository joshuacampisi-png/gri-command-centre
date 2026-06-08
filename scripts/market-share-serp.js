/**
 * Real market share calculator — pulls live SERPs for top gender reveal queries
 * Then maps GRI + Confettified + others to estimated click share using CTR curves
 */
import 'dotenv/config'

const D4S_USER = process.env.DATAFORSEO_USER || process.env.DFS_USER
const D4S_PASS = process.env.DATAFORSEO_PASS || process.env.DFS_PASS
const auth = 'Basic ' + Buffer.from(`${D4S_USER}:${D4S_PASS}`).toString('base64')

// Top gender reveal queries in AU (head + product + city + ideas)
const QUERIES = [
  'gender reveal',
  'gender reveal ideas',
  'gender reveal australia',
  'gender reveal cannons',
  'gender reveal cannon',
  'gender reveal smoke bomb',
  'gender reveal smoke bombs',
  'gender reveal extinguisher',
  'gender reveal kit',
  'gender reveal bundle',
  'gender reveal party',
  'gender reveal balloons',
  'gender reveal decorations',
  'gender reveal powder',
  'gender reveal confetti',
  'baby gender reveal',
  'gender reveal blaster',
  'pregnancy announcement',
  'gender reveal sydney',
  'gender reveal melbourne',
  'gender reveal brisbane',
  'gender reveal perth',
  'gender reveal adelaide',
  'gender reveal gold coast',
  'gender reveal ideas sydney',
  'gender reveal ideas melbourne',
  'gender reveal ideas brisbane',
  'gender reveal ideas perth',
  'gender reveal ideas adelaide',
]

// Industry CTR curves
const ORGANIC_CTR = {
  1: 0.30, 2: 0.15, 3: 0.10, 4: 0.07, 5: 0.05,
  6: 0.04, 7: 0.03, 8: 0.025, 9: 0.02, 10: 0.018,
}
const PAID_CTR = {  // top sponsored text ads
  1: 0.08, 2: 0.05, 3: 0.03, 4: 0.02,
}
const SHOPPING_CTR_PER_SLOT = 0.04   // each visible Shopping card
const NO_CLICK_RATE = 0.30   // ~30% of searches end without clicking through

function ctrFromPosition(pos) {
  return ORGANIC_CTR[pos] || 0
}

function isGRI(domain) { return /gender ?reveal ?ideas/i.test(domain || '') }
function isConfetti(domain) { return /confettified/i.test(domain || '') }
function isEtsy(domain) { return /etsy/i.test(domain || '') }
function isAmazon(domain) { return /amazon/i.test(domain || '') }

async function getSerp(query) {
  const body = [{
    keyword: query,
    location_code: 2036,
    language_code: 'en',
    device: 'desktop',
    se_domain: 'google.com.au',
    depth: 30,
  }]
  const r = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', {
    method: 'POST',
    headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return r.json()
}

console.log(`\n=== MARKET SHARE ANALYSIS — Australia gender reveal SERPs ===\n`)
console.log(`Queries: ${QUERIES.length}\n`)

const results = []

for (let i = 0; i < QUERIES.length; i++) {
  const q = QUERIES[i]
  process.stdout.write(`[${i+1}/${QUERIES.length}] ${q.padEnd(38)} `)

  try {
    const j = await getSerp(q)
    const items = j?.tasks?.[0]?.result?.[0]?.items || []
    const r = { query: q, gri:{}, confetti:{}, etsy:0, amazon:0, others:[], paid:[], shopping:[] }

    for (const it of items) {
      if (it.type === 'organic') {
        const pos = it.rank_absolute || it.rank_group
        if (pos > 10) continue   // top 10 only
        if (isGRI(it.domain)) {
          if (!r.gri.organic || pos < r.gri.organic) r.gri.organic = pos
        } else if (isConfetti(it.domain)) {
          if (!r.confetti.organic || pos < r.confetti.organic) r.confetti.organic = pos
        } else if (isEtsy(it.domain)) {
          r.etsy = r.etsy || pos
        } else if (isAmazon(it.domain)) {
          r.amazon = r.amazon || pos
        } else {
          r.others.push({ domain: it.domain, pos })
        }
      }
      // Paid ads
      if (it.type === 'paid') {
        r.paid.push({ domain: it.domain, pos: it.rank_absolute })
        if (isGRI(it.domain)) r.gri.paid = it.rank_absolute
        if (isConfetti(it.domain)) r.confetti.paid = it.rank_absolute
      }
      // Shopping ads (top of page carousel)
      if (it.type === 'shopping' || it.type === 'product_consideration') {
        const slots = it.items || [it]
        for (const s of slots) {
          r.shopping.push({ domain: s.shop_domain || s.domain, source: s.source })
          if (isGRI(s.shop_domain || s.domain)) r.gri.shopping = (r.gri.shopping || 0) + 1
          if (isConfetti(s.shop_domain || s.domain)) r.confetti.shopping = (r.confetti.shopping || 0) + 1
        }
      }
    }

    // Estimate click share for this query
    const griOrgCtr = r.gri.organic ? ctrFromPosition(r.gri.organic) : 0
    const conOrgCtr = r.confetti.organic ? ctrFromPosition(r.confetti.organic) : 0
    const griPdCtr  = r.gri.paid ? (PAID_CTR[r.gri.paid] || 0) : 0
    const conPdCtr  = r.confetti.paid ? (PAID_CTR[r.confetti.paid] || 0) : 0
    const griShopCtr = (r.gri.shopping || 0) * SHOPPING_CTR_PER_SLOT
    const conShopCtr = (r.confetti.shopping || 0) * SHOPPING_CTR_PER_SLOT

    r.griTotalCtr = griOrgCtr + griPdCtr + griShopCtr
    r.conTotalCtr = conOrgCtr + conPdCtr + conShopCtr

    process.stdout.write(`GRI org:${r.gri.organic||'-'} pd:${r.gri.paid||'-'} shop:${r.gri.shopping||0} | Conf org:${r.confetti.organic||'-'} pd:${r.confetti.paid||'-'} shop:${r.confetti.shopping||0}\n`)
    results.push(r)
    await new Promise(r=>setTimeout(r, 400))
  } catch (e) {
    process.stdout.write(`ERR: ${e.message}\n`)
    results.push({ query: q, error: e.message })
  }
}

// === ROLLUP ===
console.log(`\n\n=== MARKET SHARE ROLLUP ===\n`)

const valid = results.filter(r => !r.error)
const totalQueries = valid.length

let griOrganic1=0, griOrganicTop3=0, griOrganicTop10=0
let conOrganic1=0, conOrganicTop3=0, conOrganicTop10=0
let griPaidPresent=0, conPaidPresent=0
let griShoppingSlots=0, conShoppingSlots=0
let etsyTop10=0, amazonTop10=0

let griCtrSum=0, conCtrSum=0

for (const r of valid) {
  if (r.gri.organic === 1) griOrganic1++
  if (r.gri.organic && r.gri.organic <= 3) griOrganicTop3++
  if (r.gri.organic && r.gri.organic <= 10) griOrganicTop10++
  if (r.confetti.organic === 1) conOrganic1++
  if (r.confetti.organic && r.confetti.organic <= 3) conOrganicTop3++
  if (r.confetti.organic && r.confetti.organic <= 10) conOrganicTop10++
  if (r.gri.paid) griPaidPresent++
  if (r.confetti.paid) conPaidPresent++
  griShoppingSlots += r.gri.shopping || 0
  conShoppingSlots += r.confetti.shopping || 0
  if (r.etsy) etsyTop10++
  if (r.amazon) amazonTop10++
  griCtrSum += r.griTotalCtr
  conCtrSum += r.conTotalCtr
}

const avgGriCtr = griCtrSum / totalQueries
const avgConCtr = conCtrSum / totalQueries

console.log(`Queries analyzed: ${totalQueries}\n`)
console.log(`--- ORGANIC SERP COVERAGE ---`)
console.log(`  GRI #1 rankings:        ${griOrganic1}/${totalQueries} (${(griOrganic1/totalQueries*100).toFixed(0)}%)`)
console.log(`  GRI top 3:              ${griOrganicTop3}/${totalQueries} (${(griOrganicTop3/totalQueries*100).toFixed(0)}%)`)
console.log(`  GRI top 10:             ${griOrganicTop10}/${totalQueries} (${(griOrganicTop10/totalQueries*100).toFixed(0)}%)`)
console.log(`  Confettified #1:        ${conOrganic1}/${totalQueries} (${(conOrganic1/totalQueries*100).toFixed(0)}%)`)
console.log(`  Confettified top 3:     ${conOrganicTop3}/${totalQueries} (${(conOrganicTop3/totalQueries*100).toFixed(0)}%)`)
console.log(`  Confettified top 10:    ${conOrganicTop10}/${totalQueries} (${(conOrganicTop10/totalQueries*100).toFixed(0)}%)`)
console.log(`  Etsy top 10:            ${etsyTop10}/${totalQueries} (${(etsyTop10/totalQueries*100).toFixed(0)}%)`)
console.log(`  Amazon top 10:          ${amazonTop10}/${totalQueries} (${(amazonTop10/totalQueries*100).toFixed(0)}%)`)

console.log(`\n--- PAID SERP COVERAGE ---`)
console.log(`  GRI paid present:       ${griPaidPresent}/${totalQueries} (${(griPaidPresent/totalQueries*100).toFixed(0)}%)`)
console.log(`  Confettified paid:      ${conPaidPresent}/${totalQueries} (${(conPaidPresent/totalQueries*100).toFixed(0)}%)`)
console.log(`  GRI Shopping slots:     ${griShoppingSlots} total across all queries`)
console.log(`  Confettified Shopping:  ${conShoppingSlots} total`)

console.log(`\n--- ESTIMATED CLICK SHARE ---`)
console.log(`  GRI average CTR per query:        ${(avgGriCtr*100).toFixed(1)}%`)
console.log(`  Confettified average CTR/query:   ${(avgConCtr*100).toFixed(1)}%`)
console.log(`  No-click (Google AI overview etc): ~${(NO_CLICK_RATE*100).toFixed(0)}%`)
console.log(`  Total clickable share:             ~${((1-NO_CLICK_RATE)*100).toFixed(0)}%`)
console.log(`\n  Of all gender reveal SEARCHES in AU:`)
console.log(`    GRI captures:        ~${(avgGriCtr*100).toFixed(0)}% of clicks`)
console.log(`    Confettified:        ~${(avgConCtr*100).toFixed(0)}% of clicks`)
console.log(`    Combined (us+them):  ~${((avgGriCtr+avgConCtr)*100).toFixed(0)}% of clicks`)
console.log(`    Remaining (Etsy/Amazon/others/no-click): ~${(100-(avgGriCtr+avgConCtr)*100).toFixed(0)}%`)

// Save full results
import { writeFileSync, mkdirSync } from 'fs'
mkdirSync('data/snapshots/market-share', { recursive: true })
writeFileSync('data/snapshots/market-share/serp-' + new Date().toISOString().slice(0,10) + '.json', JSON.stringify(results, null, 2))
console.log(`\nFull data saved: data/snapshots/market-share/serp-${new Date().toISOString().slice(0,10)}.json`)

process.exit(0)
