/**
 * Scan top buyer queries on Google Shopping (popular_products + shopping carousel)
 * Count GRI's appearances NOW vs what we observed 3 days ago
 */
import 'dotenv/config'
const AUTH = 'Basic ' + Buffer.from(`${process.env.DATAFORSEO_EMAIL}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64')

const QUERIES = [
  'gender reveal cannons',
  'gender reveal cannon',
  'gender reveal extinguisher',
  'gender reveal',
  'gender reveal ideas',
  'gender reveal smoke bombs',
  'gender reveal smoke bomb',
  'gender reveal powder cannon',
  'gender reveal balloons',
  'gender reveal bundle'
]

async function scrape(kw, device='desktop') {
  const r = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', {
    method:'POST', headers:{Authorization:AUTH,'Content-Type':'application/json'},
    body: JSON.stringify([{keyword:kw, location_code:2036, language_code:'en', device, depth:30}])
  }).then(r=>r.json())
  return r.tasks?.[0]?.result?.[0]?.items || []
}

function normSeller(s){ if(!s) return ''; return s.split(' - ')[0].split('|')[0].trim() }

console.log(`\n=== SHOPPING SERP SCAN — TODAY ${new Date().toISOString().slice(0,10)} ===\n`)

const sellerAgg = new Map()
const griPositionsPerQuery = []
let totalShoppingSlots = 0, totalGRISlots = 0

for (const kw of QUERIES) {
  process.stdout.write(`  "${kw}"... `)
  let queryShop = 0, queryGRI = 0
  let griPositions = []

  for (const device of ['desktop','mobile']) {
    try {
      const items = await scrape(kw, device)
      for (const it of items) {
        if ((it.type === 'popular_products' || it.type === 'shopping_serp' || it.type === 'shopping') && Array.isArray(it.items)) {
          let position = 0
          for (const p of it.items) {
            position++
            const seller = normSeller(p.seller || '')
            if (!seller) continue
            queryShop++; totalShoppingSlots++
            if (!sellerAgg.has(seller)) sellerAgg.set(seller, { count:0, queries:new Set() })
            const s = sellerAgg.get(seller); s.count++; s.queries.add(kw)
            if (/genderreveal\s*ideas?/i.test(seller)) {
              queryGRI++; totalGRISlots++
              griPositions.push(`${device}#${position}`)
            }
          }
        }
      }
    } catch(e) { /* ignore */ }
    await new Promise(r=>setTimeout(r,250))
  }

  griPositionsPerQuery.push({ kw, total: queryShop, gri: queryGRI, positions: griPositions })
  console.log(`shop:${queryShop} gri:${queryGRI}`)
}

console.log(`\n=== GRI SHOPPING POSITIONS BY QUERY ===\n`)
console.log('Query                          | Total slots | GRI count | GRI positions (device#rank)')
console.log('-'.repeat(120))
for (const r of griPositionsPerQuery) {
  console.log(`${r.kw.padEnd(30)} | ${String(r.total).padStart(11)} | ${String(r.gri).padStart(9)} | ${r.positions.slice(0,10).join(', ')}`)
}

console.log(`\n=== AGGREGATE: GRI vs ALL ===`)
console.log(`Total Shopping slots across ${QUERIES.length} queries × 2 devices: ${totalShoppingSlots}`)
console.log(`GRI Shopping slots:                                        ${totalGRISlots} (${totalShoppingSlots>0?((totalGRISlots/totalShoppingSlots*100).toFixed(1)+'%'):'0%'})`)

console.log(`\n=== TOP 10 SHOPPING SELLERS ===`)
const ranked = [...sellerAgg.entries()].sort((a,b)=>b[1].count-a[1].count).slice(0,10)
console.log('Rank | Seller                                       | Count | Queries')
console.log('-'.repeat(90))
ranked.forEach(([s,x],i) => {
  const star = /genderreveal\s*ideas?/i.test(s) ? '⭐' : '  '
  console.log(`${star} #${String(i+1).padStart(2)} | ${s.slice(0,44).padEnd(44)} | ${String(x.count).padStart(5)} | ${x.queries.size}/${QUERIES.length}`)
})
process.exit(0)
