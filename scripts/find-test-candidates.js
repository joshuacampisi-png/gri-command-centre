import 'dotenv/config'
import { readFileSync } from 'fs'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const URL = 'https://bdd19a-3.myshopify.com/admin/api/2026-01/graphql.json'
async function gql(q){const r=await fetch(URL,{method:'POST',headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query:q})});return r.json()}
const AUTH = 'Basic ' + Buffer.from(`${process.env.DATAFORSEO_EMAIL}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64')

// Candidate test products: middle-tier converters, NULL SEO title, not at #1
// From earlier Shopify revenue data — these are "okay sellers"
const CANDIDATES = [
  { handle: 'mini-powder-gender-reveal-blaster', units90d: 192, rev: 9598, primaryQuery: 'mini powder blaster gender reveal' },
  { handle: 'gender-reveal-powder-cannons',     units90d: 65,  rev: 8634, primaryQuery: 'gender reveal cannon extinguisher bundle' },
  { handle: 'gender-reveal-powder-extinguisher', units90d: 35, rev: 5250, primaryQuery: 'gender reveal powder extinguisher' },
  { handle: 'inflatable-baby-costume-gender-reveal', units90d: 20, rev: 3000, primaryQuery: 'inflatable baby costume gender reveal' },
  { handle: 'gender-reveal-ideas-near-me',      units90d: 46,  rev: 2988, primaryQuery: '2 pack gender reveal cannon bundle' },
  { handle: 'gender-reveal-extinguisher-bundle', units90d: 8,  rev: 2240, primaryQuery: 'mega powder extinguisher bundle' },
  { handle: 'gender-reveal-cannons-bundle-australia', units90d: 24, rev: 2160, primaryQuery: '4 pack gender reveal confetti cannon bundle' },
  { handle: 'gender-reveal-smoke-bundle',       units90d: 28,  rev: 2520, primaryQuery: 'double gender reveal smoke cannon bundle' },
  { handle: 'gender-reveal-golf-balls',         units90d: 54,  rev: 1524, primaryQuery: 'gender reveal golf balls australia' },
  { handle: 'gender-reveal-exploding-soccer-ball', units90d: 36, rev: 1405, primaryQuery: 'gender reveal soccer ball' },
  { handle: 'gender-reveal-rugby-ball',         units90d: 24,  rev: 1180, primaryQuery: 'gender reveal rugby ball' },
]

console.log(`\n=== TEST CANDIDATE AUDIT ===\n`)
console.log(`Checking current Shopify SEO state + Google organic rank for ${CANDIDATES.length} mid-tier sellers...\n`)

console.log('Handle                                | 90d Units | 90d Rev | Current Title | Current Rank | Test?')
console.log('--------------------------------------+-----------+---------+---------------+--------------+------')
const results = []
for (const c of CANDIDATES) {
  // Get current Shopify SEO
  const r = await gql(`{ productByHandle(handle:"${c.handle}") { title seo{title description} } }`)
  const p = r.data?.productByHandle
  const seoTitle = p?.seo?.title || 'NULL'

  // Get current Google rank
  let rank = null
  try {
    const sr = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', {
      method:'POST', headers:{Authorization:AUTH,'Content-Type':'application/json'},
      body: JSON.stringify([{keyword:c.primaryQuery, location_code:2036, language_code:'en', device:'desktop', depth:30}])
    }).then(r=>r.json())
    const items = sr.tasks?.[0]?.result?.[0]?.items||[]
    let orgIdx = 0
    for (const it of items) {
      if (it.type==='organic') {
        orgIdx++
        if ((it.url||'').includes(c.handle)) { rank = orgIdx; break }
      }
    }
  } catch (e) {}

  // Decide if this is a good test candidate (NOT ranking #1, has revenue, NULL title)
  const isGoodTest = (!rank || rank > 3) && seoTitle === 'NULL' && c.units90d >= 8
  results.push({ ...c, seoTitle, rank, isGoodTest, productTitle: p?.title })
  console.log(`${c.handle.slice(0,38).padEnd(38)} | ${String(c.units90d).padStart(9)} | $${String(c.rev).padStart(6)} | ${seoTitle.slice(0,13).padEnd(13)} | ${rank?'#'+rank:'NOT RANKING'} | ${isGoodTest?'✅ YES':'❌ NO'}`)
  await new Promise(r=>setTimeout(r,300))
}

console.log(`\n=== TOP 5 RECOMMENDED TEST CANDIDATES ===`)
console.log(`(Real sales but underranking — safest to test SEO changes on)\n`)
const top5 = results.filter(r => r.isGoodTest).slice(0, 5)
for (const c of top5) {
  console.log(`\n📦 ${c.productTitle}`)
  console.log(`   Handle: /products/${c.handle}`)
  console.log(`   90d performance: ${c.units90d} units, $${c.rev} revenue`)
  console.log(`   Current rank for "${c.primaryQuery}": ${c.rank?'#'+c.rank:'NOT IN TOP 30'}`)
  console.log(`   Current SEO title: ${c.seoTitle}`)
  console.log(`   Risk profile: LOW (not at #1, has revenue, real test signal)`)
}
process.exit(0)
