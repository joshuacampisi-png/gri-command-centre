/**
 * Combined visibility scan:
 *  A. Paid + Shopping carousel — top 8 category queries (desktop+mobile)
 *  B. Location rankings — 8 states + 12 cities (desktop)
 * All AU SERPs, real data.
 */
import 'dotenv/config'
const AUTH = 'Basic ' + Buffer.from(`${process.env.DATAFORSEO_EMAIL}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64')

const CATEGORY = [
  'gender reveal cannons', 'gender reveal cannon', 'gender reveal',
  'gender reveal ideas', 'gender reveal smoke bombs', 'gender reveal balloons',
  'gender reveal kit', 'gender reveal powder cannon',
]
const STATES = ['nsw','vic','qld','wa','sa','tas','act','nt']
const CITIES = ['sydney','melbourne','brisbane','perth','adelaide','gold coast','darwin','newcastle','canberra','hobart','wollongong','sunshine coast']

// Prior baseline (last week from earlier scan)
const PREV = {
  // cities
  'gender reveal sydney':4, 'gender reveal melbourne':7, 'gender reveal brisbane':4,
  'gender reveal perth':3, 'gender reveal adelaide':3, 'gender reveal gold coast':4,
  'gender reveal darwin':1, 'gender reveal newcastle':null, 'gender reveal canberra':9,
  'gender reveal hobart':9, 'gender reveal wollongong':null, 'gender reveal sunshine coast':28,
  // states
  'gender reveal nsw':null, 'gender reveal vic':null, 'gender reveal qld':null,
  'gender reveal wa':null, 'gender reveal sa':null, 'gender reveal tas':null,
  'gender reveal act':null, 'gender reveal nt':null,
}

async function scrape(kw, device='desktop') {
  const r = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', {
    method:'POST', headers:{Authorization:AUTH,'Content-Type':'application/json'},
    body: JSON.stringify([{keyword:kw, location_code:2036, language_code:'en', device, depth:30}])
  }).then(r=>r.json())
  return r.tasks?.[0]?.result?.[0]?.items || []
}

// ======================== A. PAID + SHOPPING VISIBILITY ========================
console.log('\n═══════════════════════════════════════════════════════════════════')
console.log('  A. PAID ADS + SHOPPING CAROUSEL VISIBILITY (last 3d snapshot)')
console.log('═══════════════════════════════════════════════════════════════════\n')

const sellerAgg = new Map()
const paidAgg = new Map()
const ourShopByQuery = new Map()

function normSeller(s) {
  if (!s) return ''
  return s.split(' - ')[0].split('|')[0].trim()
}

for (const device of ['desktop','mobile']) {
  console.log(`\n--- ${device.toUpperCase()} ---`)
  for (const kw of CATEGORY) {
    process.stdout.write(`  "${kw}"... `)
    try {
      const items = await scrape(kw, device)
      let shop=0, paid=0, ourShop=0
      for (const it of items) {
        if (it.type === 'popular_products' || it.type === 'shopping_serp' || it.type === 'shopping') {
          for (const p of (it.items||[])) {
            const seller = normSeller(p.seller || '')
            if (!seller) continue
            shop++
            if (!sellerAgg.has(seller)) sellerAgg.set(seller, { count:0, queries:new Set() })
            const s = sellerAgg.get(seller); s.count++; s.queries.add(kw)
            if (/genderreveal\s*ideas?/i.test(seller)) ourShop++
          }
        }
        if (it.type === 'paid') {
          paid++
          const dom = (it.domain||'').replace(/^www\./,'').toLowerCase()
          if (!dom) continue
          if (!paidAgg.has(dom)) paidAgg.set(dom, { count:0, queries:new Set() })
          const x = paidAgg.get(dom); x.count++; x.queries.add(kw)
        }
      }
      const key = `${device}|${kw}`
      ourShopByQuery.set(key, { shop, paid, ourShop })
      console.log(`shop:${shop} | ours:${ourShop} | paidAds:${paid}`)
    } catch(e) { console.log(`ERR ${e.message?.slice(0,40)}`) }
    await new Promise(r=>setTimeout(r,350))
  }
}

console.log(`\n=== TOP 10 SHOPPING SELLERS (combined desktop+mobile, ${CATEGORY.length} queries × 2) ===\n`)
console.log('Rank | Seller                                       | Listings | Query coverage')
const sorted = [...sellerAgg.entries()].sort((a,b)=>b[1].count-a[1].count).slice(0,10)
sorted.forEach(([s,x],i) => {
  const star = /genderreveal\s*ideas?/i.test(s) ? '⭐' : '  '
  console.log(`${star} #${String(i+1).padStart(2)} | ${s.slice(0,44).padEnd(44)} | ${String(x.count).padStart(8)} | ${x.queries.size}/${CATEGORY.length}`)
})

console.log(`\n=== PAID SEARCH ADS ===`)
if (paidAgg.size === 0) console.log('  Zero paid Search ads detected across any category query (auction empty).')
else {
  [...paidAgg.entries()].sort((a,b)=>b[1].count-a[1].count).forEach(([d,p],i) =>
    console.log(`  #${i+1} ${d.padEnd(40)} | ${p.count} ads | ${p.queries.size}/${CATEGORY.length} queries`))
}

// GRI share summary
let totalShop=0, ourTotal=0
for (const [k,v] of ourShopByQuery) { totalShop+=v.shop; ourTotal+=v.ourShop }
console.log(`\n=== GRI SHOPPING SHARE ===`)
console.log(`  Total listings counted:  ${totalShop}`)
console.log(`  GRI listings:            ${ourTotal} (${totalShop>0?(ourTotal/totalShop*100).toFixed(1):0}%)`)

// ======================== B. LOCATION RANKINGS ========================
console.log('\n\n═══════════════════════════════════════════════════════════════════')
console.log('  B. LOCATION ORGANIC RANKINGS — AU desktop, real-website rank')
console.log('═══════════════════════════════════════════════════════════════════\n')

function realWebsiteRank(items, ourDomainRegex = /genderrevealideas\.com\.au/i) {
  // Filter to organic results that aren't social profiles (IG, Facebook, Pinterest, Reddit)
  const organic = items.filter(it => it.type === 'organic')
  const realSites = organic.filter(it => !/instagram\.com|facebook\.com|pinterest\.|reddit\.com|youtube\.com|tiktok\.com|twitter\.com|x\.com/i.test(it.domain||''))
  // Renumber starting at 1
  const idx = realSites.findIndex(it => ourDomainRegex.test(it.domain||it.url||''))
  if (idx < 0) return { rank:null, url:null }
  return { rank: idx+1, url: realSites[idx].url }
}

const queries = [
  ...CITIES.map(c => `gender reveal ${c}`),
  ...STATES.map(s => `gender reveal ${s}`),
]
console.log('Query                                  | Prev | Now  | Δ                | URL')
console.log('-'.repeat(120))
const locResults = []
for (const kw of queries) {
  try {
    const items = await scrape(kw, 'desktop')
    const { rank, url } = realWebsiteRank(items)
    const prev = PREV[kw] ?? null
    let dStr = ''
    if (prev != null && rank != null) {
      const change = prev - rank
      dStr = change > 0 ? `▲ +${change} spots` : change < 0 ? `▼ ${change} spots` : `= no change`
    } else if (prev == null && rank != null) dStr = '🆕 NEW'
    else if (prev != null && rank == null) dStr = '❌ DROPPED'
    else dStr = '— not ranking'
    const prevStr = prev==null?'—':`#${prev}`
    const nowStr  = rank==null?'—':`#${rank}`
    const urlShort = url ? url.replace('https://genderrevealideas.com.au','').slice(0,45) : ''
    console.log(`${kw.padEnd(38)} | ${prevStr.padStart(4)} | ${nowStr.padStart(4)} | ${dStr.padEnd(16)} | ${urlShort}`)
    locResults.push({ kw, prev, rank, delta:(prev!=null&&rank!=null)?prev-rank:null })
  } catch(e) {
    console.log(`${kw.padEnd(38)} | ERROR: ${e.message?.slice(0,40)}`)
  }
  await new Promise(r=>setTimeout(r,350))
}

console.log(`\n=== LOCATION SUMMARY ===`)
const ranking = locResults.filter(r => r.rank != null)
const top1 = ranking.filter(r => r.rank === 1).length
const top3 = ranking.filter(r => r.rank <= 3).length
const top10 = ranking.filter(r => r.rank <= 10).length
const movedUp = locResults.filter(r => r.delta != null && r.delta > 0)
const movedDown = locResults.filter(r => r.delta != null && r.delta < 0)
console.log(`Queries checked:    ${locResults.length}`)
console.log(`Now ranking top 30: ${ranking.length}`)
console.log(`  #1:        ${top1}`)
console.log(`  Top 3:     ${top3}`)
console.log(`  Top 10:    ${top10}`)
console.log(`Moved UP:    ${movedUp.length} queries (+${movedUp.reduce((a,b)=>a+b.delta,0)} total spots)`)
console.log(`Moved DOWN:  ${movedDown.length} queries (${movedDown.reduce((a,b)=>a+b.delta,0)} total spots)`)
process.exit(0)
