/**
 * LOCATION PAGES STATUS REPORT
 * Combine current organic rank + descHtml size + amplification status
 */
import 'dotenv/config'
import { readFileSync } from 'fs'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const URL = 'https://bdd19a-3.myshopify.com/admin/api/2026-01/graphql.json'
async function gql(q){const r=await fetch(URL,{method:'POST',headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query:q})});return r.json()}

const PAGES = [
  { handle:'gender-reveal-ideas-adelaide',     query:'gender reveal adelaide',     city:'Adelaide' },
  { handle:'gender-reveal-ideas-darwin',       query:'gender reveal darwin',       city:'Darwin' },
  { handle:'gender-reveal-ideas-gold-coast',   query:'gender reveal gold coast',   city:'Gold Coast' },
  { handle:'gender-reveal-ideas-melbourne',    query:'gender reveal melbourne',    city:'Melbourne' },
  { handle:'gender-reveal-ideas-sydney',       query:'gender reveal sydney',       city:'Sydney' },
  { handle:'gender-reveal-ideas-brisbane',     query:'gender reveal brisbane',     city:'Brisbane' },
  { handle:'gender-reveal-ideas-perth',        query:'gender reveal perth',        city:'Perth' },
  { handle:'gender-reveal-ideas-newcastle',    query:'gender reveal newcastle',    city:'Newcastle' },
  { handle:'gender-reveal-ideas-canberra',     query:'gender reveal canberra',     city:'Canberra' },
  { handle:'gender-reveal-ideas-hobart',       query:'gender reveal hobart',       city:'Hobart' },
  { handle:'gender-reveal-ideas-wollongong',   query:'gender reveal wollongong',   city:'Wollongong' },
  { handle:'gender-reveal-ideas-sunshine-coast',query:'gender reveal sunshine coast', city:'Sunshine Coast' },
  { handle:'gender-reveal-ideas-launceston',   query:'gender reveal launceston',   city:'Launceston' },
  { handle:'gender-reveal-ideas-townsville',   query:'gender reveal townsville',   city:'Townsville' },
  { handle:'gender-reveal-ideas-cairns',       query:'gender reveal cairns',       city:'Cairns' },
  { handle:'gender-reveal-ideas-geelong',      query:'gender reveal geelong',      city:'Geelong' },
  { handle:'gender-reveal-ideas-central-coast',query:'gender reveal central coast',city:'Central Coast' },
  { handle:'gender-reveal-ideas-act',          query:'gender reveal act',          city:'ACT (state)' },
  { handle:'gender-reveal-ideas-queensland',   query:'gender reveal qld',          city:'QLD (state)' },
  { handle:'gender-reveal-ideas-tasmania',     query:'gender reveal tas',          city:'TAS (state)' },
  { handle:'gender-reveals-victoria',          query:'gender reveal vic',          city:'VIC (state)' },
]

// Load today's rank baseline
const baseline = JSON.parse(readFileSync('data/rank-baselines/2026-05-18.json','utf8'))
const ranks = baseline.ranks

console.log(`\n=== LOCATION PAGES STATUS — ${new Date().toISOString().slice(0,16)} ===\n`)
console.log('Page                           | Today | descHtml | Tier   | Status')
console.log('-------------------------------+-------+----------+--------+--------')

const results = []
for (const p of PAGES) {
  const r = await gql(`{ collectionByHandle(handle:"${p.handle}") { descriptionHtml productsCount{count} } }`)
  const c = r.data?.collectionByHandle
  const desc = c?.descriptionHtml?.length || 0
  const rank = ranks[p.query] ?? null
  // Tier: ≥18K = amplified, 3500-5000 = thin, <500 = missing
  const tier = desc>=18000 ? 'AMPLIFIED' : desc>=3000 ? 'THIN' : desc>0 ? 'TINY' : 'MISSING'
  let status = ''
  if (rank===1) status = '🥇 #1'
  else if (rank && rank<=3) status = '🥈 Strong'
  else if (rank && rank<=10) status = '🟡 Mid'
  else if (rank && rank<=20) status = '🟠 Weak'
  else if (rank) status = '🔴 Bottom'
  else status = '❌ Missing'
  if (!c) status = '❌ Page missing'
  results.push({ ...p, rank, desc, tier, status })
  console.log(`${(p.city).padEnd(30)} | ${(rank?`#${rank}`:'---').padStart(5)} | ${String(desc).padStart(8)} | ${tier.padEnd(6)} | ${status}`)
}

console.log(`\n=== AMPLIFICATION OPPORTUNITY ===`)
const thin = results.filter(r => r.tier==='THIN' && r.rank>3)
console.log(`Pages still THIN that aren't yet #1-3 (ship targets):`)
for (const x of thin) console.log(`  • ${x.city}: rank ${x.rank?'#'+x.rank:'---'}, descHtml ${x.desc}c → could become #1-5 with amplification`)

console.log(`\n=== TODAY'S AMPLIFICATIONS (will lift in 7-14 days) ===`)
const todayShipped = ['gender-reveal-ideas-canberra','gender-reveal-ideas-act','gender-reveal-ideas-townsville','gender-reveal-ideas-melbourne']
for (const h of todayShipped) {
  const x = results.find(r => r.handle===h)
  if (x) console.log(`  • ${x.city}: current rank ${x.rank?'#'+x.rank:'new'}, descHtml ${x.desc}c — re-crawl pending`)
}

console.log(`\n=== SCORECARD ===`)
const ranking = results.filter(r => r.rank).length
const top1 = results.filter(r => r.rank===1).length
const top3 = results.filter(r => r.rank && r.rank<=3).length
const top10 = results.filter(r => r.rank && r.rank<=10).length
console.log(`  Total location pages: ${results.length}`)
console.log(`  Ranking: ${ranking}/${results.length}`)
console.log(`  #1:      ${top1}`)
console.log(`  Top 3:   ${top3}`)
console.log(`  Top 10:  ${top10}`)
process.exit(0)
