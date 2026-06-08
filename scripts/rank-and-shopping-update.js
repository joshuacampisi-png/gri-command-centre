/**
 * Tuesday update — Real data only
 * 1. Rank change since yesterday's baseline
 * 2. Paid Shopping update from Google Ads API
 */
import 'dotenv/config'
import { readFileSync, writeFileSync } from 'fs'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const AUTH = 'Basic ' + Buffer.from(`${process.env.DATAFORSEO_EMAIL}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64')
const c = getGadsCustomer()

const fmt = d => d.toISOString().slice(0,10)
const today = fmt(new Date())
const yesterday = fmt(new Date(Date.now()-86400000))
const sevenDaysAgo = fmt(new Date(Date.now()-7*86400000))

// === Load yesterday's baseline ===
const baseline = JSON.parse(readFileSync('data/rank-baselines/2026-05-18.json','utf8'))
const baselineRanks = baseline.ranks
const QUERIES = Object.keys(baselineRanks)

console.log(`\n╔══════════════════════════════════════════════════════════════╗`)
console.log(`║  TUESDAY UPDATE — ${today}                              ║`)
console.log(`║  Vs Baseline: ${baseline.ranAt?.slice(0,16)}                       ║`)
console.log(`╚══════════════════════════════════════════════════════════════╝`)

// === PART 1: Rank changes ===
console.log(`\n═══ 1. LOCATION + KEYWORD RANK CHANGES ═══\n`)
console.log(`Scanning ${QUERIES.length} queries (this takes ~3 min)...\n`)

const today_ranks = {}
let i=0
for (const kw of QUERIES) {
  i++
  process.stdout.write(`\r  [${i}/${QUERIES.length}] ${kw.slice(0,40).padEnd(40)}`)
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
    today_ranks[kw] = rank
  } catch (e) { today_ranks[kw] = null }
  await new Promise(r=>setTimeout(r,200))
}
console.log('\n')

// Save today's snapshot
writeFileSync(`data/rank-baselines/${today}.json`, JSON.stringify({ ranAt:new Date().toISOString(), ranks: today_ranks }, null, 2))

// Compute deltas
const gainers = []
const decliners = []
const new_ranks = []
const lost = []
for (const kw of QUERIES) {
  const y = baselineRanks[kw]
  const t = today_ranks[kw]
  if (y && t) {
    const delta = y - t // positive = improvement
    if (delta > 0) gainers.push({ kw, was: y, now: t, delta })
    else if (delta < 0) decliners.push({ kw, was: y, now: t, delta })
  } else if (!y && t) new_ranks.push({ kw, now: t })
  else if (y && !t) lost.push({ kw, was: y })
}

console.log(`SUMMARY:`)
console.log(`  Gainers:    ${gainers.length} (rank went UP)`)
console.log(`  Decliners:  ${decliners.length} (rank went DOWN)`)
console.log(`  New rankings: ${new_ranks.length}`)
console.log(`  Lost (now not in top 30): ${lost.length}`)
console.log(`  Unchanged: ${QUERIES.length - gainers.length - decliners.length - new_ranks.length - lost.length}`)

console.log(`\n🟢 TOP GAINERS:`)
for (const g of gainers.sort((a,b)=>b.delta-a.delta).slice(0,15)) {
  console.log(`  ↑${String(g.delta).padStart(2)} | ${g.kw.padEnd(40)} | #${g.was} → #${g.now}`)
}

console.log(`\n🔴 DECLINERS:`)
for (const g of decliners.sort((a,b)=>a.delta-b.delta).slice(0,15)) {
  console.log(`  ↓${String(-g.delta).padStart(2)} | ${g.kw.padEnd(40)} | #${g.was} → #${g.now}`)
}

if (new_ranks.length) {
  console.log(`\n🆕 NEW RANKINGS:`)
  for (const g of new_ranks) console.log(`  + #${g.now} | ${g.kw}`)
}
if (lost.length) {
  console.log(`\n❌ LOST FROM TOP 30:`)
  for (const g of lost) console.log(`  - was #${g.was} | ${g.kw}`)
}

// === PART 2: Shopping/Paid update ===
console.log(`\n\n═══ 2. PAID SHOPPING UPDATE (Google Ads) ═══\n`)
const sp = async (date) => {
  const rows = await c.query(`SELECT metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM shopping_performance_view WHERE segments.date='${date}'`)
  let imp=0,clk=0,cs=0,cv=0,vl=0
  for (const r of rows) {
    imp+=Number(r.metrics?.impressions||0)
    clk+=Number(r.metrics?.clicks||0)
    cs+=Number(r.metrics?.cost_micros||0)/1e6
    cv+=Number(r.metrics?.conversions||0)
    vl+=Number(r.metrics?.conversions_value||0)
  }
  return { imp, clk, sp: cs, conv: cv, val: vl, ctr: imp?clk/imp*100:0, cvr: clk?cv/clk*100:0, roas: cs?vl/cs:0 }
}
const t = await sp(today)
const y = await sp(yesterday)
const w = await sp(sevenDaysAgo)

console.log('Window     | Imp     | Clk  | Spend   | Conv | Value  | CTR  | CVR  | ROAS  ')
console.log('-----------+---------+------+---------+------+--------+------+------+-------')
const row = (l, x) => console.log(`${l.padEnd(10)} | ${String(x.imp).padStart(7)} | ${String(x.clk).padStart(4)} | $${x.sp.toFixed(0).padStart(6)} | ${x.conv.toFixed(0).padStart(4)} | $${x.val.toFixed(0).padStart(5)} | ${x.ctr.toFixed(2).padStart(4)}% | ${x.cvr.toFixed(2).padStart(4)}% | ${x.roas.toFixed(2).padStart(4)}x`)
row('TODAY', t)
row('YESTERDAY', y)
row('7d ago', w)

console.log(`\nToday-vs-Yesterday: Imp ${((t.imp-y.imp)/Math.max(y.imp,1)*100).toFixed(0)}% | Spend ${((t.sp-y.sp)/Math.max(y.sp,1)*100).toFixed(0)}% | ROAS ${((t.roas-y.roas)/Math.max(y.roas,0.01)*100).toFixed(0)}%`)

// === SERP-level paid Shopping check on top 8 commercial queries ===
console.log(`\n--- Live paid-Shopping SERP check (do we appear in Sponsored carousel?) ---`)
const COMMERCIAL = ['gender reveal smoke bombs','gender reveal cannon','gender reveal extinguisher','gender reveal powder','gender reveal bundle','gender reveal burnout','gender reveal smoke bomb','gender reveal australia']
for (const kw of COMMERCIAL) {
  const r = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', {
    method:'POST', headers:{Authorization:AUTH,'Content-Type':'application/json'},
    body: JSON.stringify([{keyword:kw, location_code:2036, language_code:'en', device:'desktop', depth:25}])
  }).then(r=>r.json())
  const items = r.tasks?.[0]?.result?.[0]?.items||[]
  const shoppingBlock = items.find(i => i.type==='popular_products' || i.type==='shopping' || i.type==='shopping_ads')
  let usCount = 0, totalSlots = 0
  if (shoppingBlock?.items) {
    totalSlots = shoppingBlock.items.length
    for (const p of shoppingBlock.items) {
      if (/gender reveal ideas/i.test(p.shop||p.seller||p.domain||'')) usCount++
    }
  }
  console.log(`  "${kw.padEnd(33)}" | Shopping slots: ${totalSlots} | Us: ${usCount} (${totalSlots?Math.round(usCount/totalSlots*100):0}%)`)
  await new Promise(r=>setTimeout(r,300))
}

// === Per-campaign Today
console.log(`\n--- PER-CAMPAIGN TODAY ---`)
const camps = await c.query(`SELECT campaign.name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM campaign WHERE campaign.status='ENABLED' AND segments.date='${today}'`)
const m = new Map()
for (const r of camps) {
  const k = r.campaign?.name
  const cur = m.get(k) || { imp:0,clk:0,sp:0,conv:0,val:0 }
  cur.imp+=Number(r.metrics?.impressions||0)
  cur.clk+=Number(r.metrics?.clicks||0)
  cur.sp+=Number(r.metrics?.cost_micros||0)/1e6
  cur.conv+=Number(r.metrics?.conversions||0)
  cur.val+=Number(r.metrics?.conversions_value||0)
  m.set(k, cur)
}
for (const [name, x] of m) {
  const cvr = x.clk?(x.conv/x.clk*100).toFixed(1):'-'
  const roas = x.sp?(x.val/x.sp).toFixed(2):'-'
  console.log(`  ${(name||'').slice(0,38).padEnd(38)} | ${String(x.imp).padStart(5)}imp ${String(x.clk).padStart(3)}clk $${x.sp.toFixed(0).padStart(4)} | ${x.conv.toFixed(0)}c $${x.val.toFixed(0).padStart(4)} | ${cvr}%CVR ${roas}x`)
}

process.exit(0)
