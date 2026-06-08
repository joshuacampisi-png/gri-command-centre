/**
 * Paid visibility check — impression share, head-term coverage, conv lag check
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const c = getGadsCustomer()

console.log(`\n=== PAID VISIBILITY + RECOVERY TRUTH CHECK ===\n`)

// Impression share — last 48hrs vs pre-change
console.log(`--- IMPRESSION SHARE (Search campaigns) ---`)
const winLast = `'2026-05-21' AND '2026-05-22'`
const winPre = `'2026-05-17' AND '2026-05-18'`

for (const [campId, label] of [['21094179575','Search Cannons'],['23425232813','Brand Defence']]) {
  const last = await c.query(`SELECT metrics.search_impression_share, metrics.search_top_impression_share, metrics.search_absolute_top_impression_share, metrics.search_budget_lost_impression_share, metrics.search_rank_lost_impression_share FROM campaign WHERE campaign.id=${campId} AND segments.date BETWEEN ${winLast}`)
  const pre = await c.query(`SELECT metrics.search_impression_share, metrics.search_top_impression_share, metrics.search_absolute_top_impression_share FROM campaign WHERE campaign.id=${campId} AND segments.date BETWEEN ${winPre}`)
  function avg(rows, field) {
    const vals = rows.map(r => Number(r.metrics?.[field]||0)).filter(v => v>0)
    return vals.length ? (vals.reduce((a,b)=>a+b,0)/vals.length*100).toFixed(0)+'%' : 'n/a'
  }
  console.log(`\n  ${label}`)
  console.log(`    IS (any):       Pre: ${avg(pre,'search_impression_share')} | Now: ${avg(last,'search_impression_share')}`)
  console.log(`    Top IS:         Pre: ${avg(pre,'search_top_impression_share')} | Now: ${avg(last,'search_top_impression_share')}`)
  console.log(`    Abs Top IS:     Pre: ${avg(pre,'search_absolute_top_impression_share')} | Now: ${avg(last,'search_absolute_top_impression_share')}`)
  if (last.length) {
    const lostBudget = avg(last,'search_budget_lost_impression_share')
    const lostRank = avg(last,'search_rank_lost_impression_share')
    console.log(`    Lost to budget: ${lostBudget} | Lost to rank: ${lostRank}`)
  }
}

// Brand Defence + Cannons search queries served last 48hr — proving coverage
console.log(`\n--- HEAD TERM SERVING (last 48hr) ---`)
for (const [campId, label] of [['23425232813','Brand Defence'],['21094179575','Search Cannons']]) {
  const sq = await c.query(`SELECT search_term_view.search_term, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM search_term_view WHERE campaign.id=${campId} AND segments.date BETWEEN ${winLast} ORDER BY metrics.impressions DESC LIMIT 10`)
  console.log(`\n  ${label}: ${sq.length} unique queries served`)
  for (const r of sq.slice(0,8)) {
    console.log(`    "${r.search_term_view?.search_term}" | ${r.metrics?.impressions} impr | ${r.metrics?.clicks} cl | $${(Number(r.metrics?.cost_micros||0)/1e6).toFixed(2)} | ${r.metrics?.conversions||0} conv`)
  }
}

// PMAX All Products search categories last 48hr
console.log(`\n--- PMAX ALL PRODUCTS query categories (last 48hr) ---`)
try {
  const pmax = await c.query(`SELECT campaign_search_term_insight.category_label, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM campaign_search_term_insight WHERE campaign.id=22841772135 AND segments.date BETWEEN ${winLast} ORDER BY metrics.impressions DESC LIMIT 10`)
  if (pmax.length) {
    for (const r of pmax) console.log(`    "${r.campaign_search_term_insight?.category_label}" | ${r.metrics?.impressions} impr | ${r.metrics?.clicks} cl`)
  } else { console.log('    (no insight rows)') }
} catch(e) { console.log(`    (skip - ${e?.errors?.[0]?.message?.slice(0,80)})`) }

// Conversion lag check
console.log(`\n--- CONVERSION LAG CHECK (Brand Defence + Cannons clicks vs conv) ---`)
for (const [campId, label] of [['23425232813','Brand Defence'],['21094179575','Search Cannons']]) {
  const r = await c.query(`SELECT segments.date, metrics.clicks, metrics.conversions, metrics.all_conversions FROM campaign WHERE campaign.id=${campId} AND segments.date BETWEEN '2026-05-19' AND '2026-05-22'`)
  console.log(`\n  ${label}`)
  for (const x of r) {
    console.log(`    ${x.segments?.date}: ${x.metrics?.clicks} clicks | ${x.metrics?.conversions} conv | ${x.metrics?.all_conversions} all_conv`)
  }
}

process.exit(0)
