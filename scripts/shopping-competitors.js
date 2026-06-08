/**
 * Pull Google Shopping results for top GRI queries and count competitor visibility
 */
import 'dotenv/config'
const AUTH = 'Basic ' + Buffer.from(`${process.env.DATAFORSEO_EMAIL}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64')

const QUERIES = [
  'gender reveal cannons',
  'gender reveal cannon',
  'gender reveal smoke bombs',
  'gender reveal balloons',
  'gender reveal powder',
  'gender reveal powder cannon',
  'gender reveal kit',
  'confetti cannon gender reveal',
  'gender reveal bundle',
  'gender reveal ideas',
]

async function shopping(kw, device='desktop') {
  const r = await fetch('https://api.dataforseo.com/v3/serp/google/shopping/live/advanced', {
    method:'POST',
    headers:{Authorization:AUTH,'Content-Type':'application/json'},
    body: JSON.stringify([{keyword:kw, location_code:2036, language_code:'en', device, depth:30}])
  }).then(r=>r.json())
  return r.tasks?.[0]?.result?.[0]?.items || []
}

const seller = new Map()  // domain → { appearances, totalSpots, products: [] }
const ourPresence = new Map() // query → our positions in shopping

console.log('\n=== GOOGLE SHOPPING COMPETITOR SCAN (AU, desktop, top 30) ===\n')
for (const kw of QUERIES) {
  process.stdout.write(`Pulling "${kw}"... `)
  try {
    const items = await shopping(kw, 'desktop')
    const products = items.filter(it => it.type === 'shopping_serp')
    // shopping_serp items have shop, title, price, rank
    let count = 0
    const ourSpots = []
    for (const p of items) {
      // The shopping endpoint returns items with type "shopping_serp" each containing seller info
      const shop = (p.shop || p.seller || p.domain || '').toLowerCase().trim()
      if (!shop) continue
      count++
      if (!seller.has(shop)) seller.set(shop, { appearances:0, queries:new Set(), examples:[] })
      const s = seller.get(shop)
      s.appearances++
      s.queries.add(kw)
      if (s.examples.length < 2) s.examples.push({ kw, title:(p.title||'').slice(0,55), price:p.price?.current||p.price })
      if (/genderrevealideas/i.test(shop)) ourSpots.push(p.rank_absolute || p.rank_group)
    }
    ourPresence.set(kw, { totalProducts: count, ourSpots })
    console.log(`${count} listings | GRI in ${ourSpots.length} spots${ourSpots.length?` (positions ${ourSpots.slice(0,5).join(', ')})`:''}`)
  } catch (e) {
    console.log(`ERR ${e.message}`)
  }
  await new Promise(r=>setTimeout(r,400))
}

// Rank by appearances
console.log(`\n=== TOP 20 GOOGLE SHOPPING ADVERTISERS (by appearance count across ${QUERIES.length} queries) ===\n`)
const ranked = [...seller.entries()].sort((a,b)=>b[1].appearances - a[1].appearances).slice(0,20)
console.log('Rank | Domain                                       | Listings | Queries appeared in')
console.log('-'.repeat(110))
ranked.forEach(([dom, s], i) => {
  const marker = /genderrevealideas/i.test(dom) ? '⭐ GRI' : '     '
  console.log(`${marker} #${String(i+1).padStart(2)} | ${dom.slice(0,44).padEnd(44)} | ${String(s.appearances).padStart(8)} | ${s.queries.size}/${QUERIES.length}`)
})

console.log(`\n=== OUR SHOPPING COVERAGE ===`)
let totalSpots = 0, ourSpots = 0
for (const [kw, p] of ourPresence.entries()) {
  totalSpots += p.totalProducts
  ourSpots += p.ourSpots.length
  console.log(`  ${kw.padEnd(40)} | ${p.ourSpots.length}/${p.totalProducts} listings ${p.ourSpots.length?'GRI at #'+p.ourSpots.slice(0,3).join(',#'):''}`)
}
console.log(`\nOverall GRI Shopping share: ${ourSpots}/${totalSpots} (${(ourSpots/totalSpots*100).toFixed(1)}%) of all shopping listings`)
process.exit(0)
