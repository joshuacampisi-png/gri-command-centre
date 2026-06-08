/**
 * Shopping competitor scan v3 — correctly parses `seller` field
 */
import 'dotenv/config'
const AUTH = 'Basic ' + Buffer.from(`${process.env.DATAFORSEO_EMAIL}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64')

const QUERIES = [
  'gender reveal cannons',
  'gender reveal cannon',
  'gender reveal smoke bomb',
  'gender reveal balloons',
  'gender reveal powder cannon',
  'confetti cannon',
  'gender reveal kit',
  'gender reveal extinguisher',
  'gender reveal powder',
  'baby gender reveal',
]

async function serpAdvanced(kw, device='desktop') {
  const r = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', {
    method:'POST',
    headers:{Authorization:AUTH,'Content-Type':'application/json'},
    body: JSON.stringify([{keyword:kw, location_code:2036, language_code:'en', device, depth:30}])
  }).then(r=>r.json())
  return r.tasks?.[0]?.result?.[0]?.items || []
}

// seller → { count, multiStoreCount, queries, examples, totalValue }
const sellers = new Map()
const paidAds = new Map()
const queryStats = new Map()

function normSeller(s) {
  if (!s) return ''
  // Strip "Amazon AU - Amazon.com.au-Seller" → "Amazon AU"
  return s.split(' - ')[0].split('|')[0].trim()
}

console.log('\n=== GOOGLE SHOPPING + PAID COMPETITOR SCAN (AU desktop + mobile) ===\n')
for (const device of ['desktop','mobile']) {
  console.log(`\n--- ${device.toUpperCase()} ---`)
  for (const kw of QUERIES) {
    process.stdout.write(`  "${kw}"... `)
    try {
      const items = await serpAdvanced(kw, device)
      let shoppingProducts = 0, paidCount = 0
      for (const it of items) {
        if ((it.type === 'popular_products' || it.type === 'shopping_serp' || it.type === 'shopping') && Array.isArray(it.items)) {
          for (const p of it.items) {
            const seller = normSeller(p.seller || '')
            if (!seller) continue
            shoppingProducts++
            if (!sellers.has(seller)) sellers.set(seller, { count:0, multiStoreHits:0, queries:new Set(), devices:new Set(), examples:[] })
            const s = sellers.get(seller)
            s.count++
            s.queries.add(kw)
            s.devices.add(device)
            if (p.more_sellers) s.multiStoreHits++
            if (s.examples.length < 2) s.examples.push({ kw, title:(p.title||'').slice(0,55), price:p.price?.displayed_price })
          }
        }
        if (it.type === 'paid') {
          paidCount++
          const dom = (it.domain || '').replace(/^www\./,'').toLowerCase()
          if (!dom) continue
          if (!paidAds.has(dom)) paidAds.set(dom, { count:0, queries:new Set() })
          const p = paidAds.get(dom)
          p.count++
          p.queries.add(kw)
        }
      }
      const key = `${device}|${kw}`
      queryStats.set(key, { shopping:shoppingProducts, paid:paidCount })
      console.log(`shop: ${shoppingProducts} | paid: ${paidCount}`)
    } catch (e) {
      console.log(`ERR ${e.message?.slice(0,40)}`)
    }
    await new Promise(r=>setTimeout(r,400))
  }
}

console.log(`\n\n═══════════════════════════════════════════════════════════════════`)
console.log(`  TOP GOOGLE SHOPPING ADVERTISERS — by listing count across ${QUERIES.length} queries × 2 devices`)
console.log(`═══════════════════════════════════════════════════════════════════\n`)
const ranked = [...sellers.entries()].sort((a,b)=>b[1].count - a[1].count)
console.log('Rank | Seller                                       | Listings | Queries | Devices | MultiStore')
console.log('-'.repeat(110))
ranked.slice(0,20).forEach(([sel, s], i) => {
  const star = /genderreveal\s*ideas?/i.test(sel) ? '⭐' : '  '
  console.log(`${star} #${String(i+1).padStart(2)} | ${sel.slice(0,44).padEnd(44)} | ${String(s.count).padStart(8)} | ${String(s.queries.size).padStart(4)}/${QUERIES.length} | ${[...s.devices].join('+').padEnd(7)} | ${s.multiStoreHits}`)
})

console.log(`\n=== TOP 3 EXAMPLES PER LEADER ===`)
ranked.slice(0,5).forEach(([sel, s]) => {
  console.log(`\n[${sel}] — ${s.count} total listings`)
  s.examples.slice(0,2).forEach(e => console.log(`  • "${e.title}" (${e.price}) on "${e.kw}"`))
})

console.log(`\n=== PAID SEARCH ADS COMPETITORS ===`)
if (paidAds.size === 0) {
  console.log('No paid Search ads detected in scan. The Search auction is empty for these queries.')
} else {
  [...paidAds.entries()].sort((a,b)=>b[1].count-a[1].count).slice(0,10)
    .forEach(([dom,p],i) => console.log(`#${i+1} ${dom.padEnd(44)} | ${p.count} ads | ${p.queries.size}/${QUERIES.length}`))
}

process.exit(0)
