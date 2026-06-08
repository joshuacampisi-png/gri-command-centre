/**
 * Pull Google Shopping competitors via DataForSEO merchant/products endpoint
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
]

// Use organic SERP advanced — it returns shopping rows + popular products + paid ads
async function serpAdvanced(kw) {
  const r = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', {
    method:'POST',
    headers:{Authorization:AUTH,'Content-Type':'application/json'},
    body: JSON.stringify([{keyword:kw, location_code:2036, language_code:'en', device:'desktop', depth:30}])
  }).then(r=>r.json())
  return r.tasks?.[0]?.result?.[0]?.items || []
}

const competitorAppearances = new Map() // domain → count of unique queries appearing in
const shoppingAppearances = new Map()
const paidAppearances = new Map()

console.log('\n=== GOOGLE SHOPPING + PAID COMPETITOR SCAN ===\n')
for (const kw of QUERIES) {
  process.stdout.write(`"${kw}"... `)
  const items = await serpAdvanced(kw)
  let shopCount = 0, paidCount = 0
  for (const it of items) {
    if (it.type === 'shopping' || it.type === 'popular_products' || it.type === 'shopping_serp') {
      const products = it.items || []
      for (const p of products) {
        const url = p.url || p.shop_url || p.shop || ''
        const dom = (url.match(/https?:\/\/([^\/]+)/)?.[1] || url || '').replace(/^www\./,'').toLowerCase()
        if (!dom) continue
        shopCount++
        if (!shoppingAppearances.has(dom)) shoppingAppearances.set(dom, { queries:new Set(), count:0, examples:[] })
        const s = shoppingAppearances.get(dom)
        s.count++
        s.queries.add(kw)
        if (s.examples.length < 2) s.examples.push({ kw, title:(p.title||'').slice(0,50), price:p.price?.current||p.price })
      }
    }
    if (it.type === 'paid') {
      const dom = (it.domain || '').replace(/^www\./,'').toLowerCase()
      if (!dom) continue
      paidCount++
      if (!paidAppearances.has(dom)) paidAppearances.set(dom, { queries:new Set(), count:0 })
      const p = paidAppearances.get(dom)
      p.count++
      p.queries.add(kw)
    }
  }
  console.log(`shopping: ${shopCount} | paid ads: ${paidCount}`)
  await new Promise(r=>setTimeout(r,400))
}

console.log(`\n=== TOP GOOGLE SHOPPING ADVERTISERS (by listing count across ${QUERIES.length} queries) ===\n`)
const shopRanked = [...shoppingAppearances.entries()].sort((a,b)=>b[1].count - a[1].count)
console.log('Rank | Domain                                       | Listings | Queries')
console.log('-'.repeat(95))
shopRanked.slice(0,20).forEach(([dom, s], i) => {
  const star = /genderrevealideas/i.test(dom) ? '⭐' : '  '
  console.log(`${star} #${String(i+1).padStart(2)} | ${dom.slice(0,44).padEnd(44)} | ${String(s.count).padStart(8)} | ${s.queries.size}/${QUERIES.length}`)
})

console.log(`\n=== PAID SEARCH ADS COMPETITORS ===\n`)
if (paidAppearances.size === 0) {
  console.log('No paid Search ads detected on any of the top queries.')
} else {
  const paidRanked = [...paidAppearances.entries()].sort((a,b)=>b[1].count - a[1].count)
  paidRanked.forEach(([dom,p],i) => console.log(`#${i+1} ${dom.padEnd(44)} | ${p.count} ads | ${p.queries.size}/${QUERIES.length} queries`))
}

// Show GRI's shopping coverage
console.log(`\n=== GRI SHOPPING COVERAGE ===`)
const our = shoppingAppearances.get('genderrevealideas.com.au')
if (our) {
  console.log(`Listings: ${our.count} across ${our.queries.size}/${QUERIES.length} queries`)
  console.log(`Queries we appear in: ${[...our.queries].join(', ')}`)
} else {
  console.log('GRI not detected in any shopping carousel ❗')
}
process.exit(0)
