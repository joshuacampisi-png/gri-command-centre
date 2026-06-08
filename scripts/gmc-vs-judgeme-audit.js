import 'dotenv/config'
const EMAIL = process.env.DATAFORSEO_EMAIL
const PASSWORD = process.env.DATAFORSEO_PASSWORD
const AUTH = 'Basic ' + Buffer.from(`${EMAIL}:${PASSWORD}`).toString('base64')

async function dfs(path, body) {
  const r = await fetch(`https://api.dataforseo.com/v3/${path}`, {
    method: 'POST', headers: { Authorization: AUTH, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  return r.json()
}

// 1. Pull GMC Shopping listings + ratings for our products
const queries = [
  'gender reveal smoke bomb australia', 'gender reveal extinguisher', 'gender reveal cannon',
  'gender reveal cannons', 'gender reveal smoke', 'gender reveal powder',
  'gender reveal burnout', 'gender reveal tnt', 'gender reveal box',
  'gender reveal football', 'gender reveal golf ball', 'gender reveal dry ice',
]
const gmcData = {}  // title -> {rating, votes}
for (const kw of queries) {
  process.stdout.write(`Scanning GMC: ${kw}...`)
  const r = await dfs('serp/google/organic/live/advanced', [{
    keyword: kw, location_code: 2036, language_code: 'en', device: 'desktop', depth: 10,
  }])
  const items = r.tasks?.[0]?.result?.[0]?.items || []
  let n = 0
  for (const it of items) {
    if (it.type === 'popular_products' && it.items) {
      for (const p of it.items) {
        const shop = (p.shop || p.seller || '').toLowerCase()
        if (!shop.includes('gender reveal ideas')) continue
        const title = (p.title || '').trim()
        if (!gmcData[title]) {
          gmcData[title] = {
            rating: p.rating?.value || null,
            votes: p.rating?.votes_count || 0,
          }
          n++
        }
      }
    }
  }
  console.log(` +${n} unique products`)
}

// 2. For each product, fetch the matching Shopify product to compare Judge.me rating
// We need to find the Shopify product handle from the title. Let me pull all our products with Judge.me metafields.
console.log('\nFetching Judge.me ratings from Shopify product pages...')

const SHOPIFY_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
async function gql(query) {
  const r = await fetch('https://bdd19a-3.myshopify.com/admin/api/2026-01/graphql.json', {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  return r.json()
}

// Pull all active products with their Judge.me metafields
let cursor = null
const allProducts = []
while (true) {
  const r = await gql(`{
    products(first: 50${cursor ? `, after: "${cursor}"` : ''}, query: "status:active") {
      edges {
        cursor
        node {
          id title handle
          jmrating: metafield(namespace: "reviews", key: "rating") { value }
          jmcount: metafield(namespace: "reviews", key: "rating_count") { value }
        }
      }
      pageInfo { hasNextPage }
    }
  }`)
  const edges = r.data?.products?.edges || []
  for (const e of edges) {
    const n = e.node
    let rating = null, count = 0
    try {
      const ratingObj = n.jmrating?.value ? JSON.parse(n.jmrating.value) : null
      rating = ratingObj?.value || ratingObj
      count = Number(n.jmcount?.value || 0)
    } catch { rating = n.jmrating?.value }
    allProducts.push({ title: n.title, handle: n.handle, jmRating: rating, jmCount: count })
  }
  if (!r.data?.products?.pageInfo?.hasNextPage) break
  cursor = edges[edges.length - 1].cursor
}
console.log(`Fetched ${allProducts.length} active products from Shopify`)

// 3. Compare
console.log('\n=== GMC STAR vs JUDGE.ME — MISMATCHES & MATCHES ===\n')
console.log('Product                                              | GMC ★/votes  | Judge.me ★/count  | Match?')
console.log('-----------------------------------------------------+--------------+-------------------+-------')

const matched = []
for (const [gmcTitle, gmc] of Object.entries(gmcData)) {
  // Find matching Shopify product (fuzzy match on title)
  const lcTitle = gmcTitle.toLowerCase()
  let best = null, bestScore = 0
  for (const p of allProducts) {
    const lcP = p.title.toLowerCase()
    // simple token overlap score
    const tokens = lcTitle.split(/\s+/).filter(t => t.length > 3)
    let score = 0
    for (const t of tokens) if (lcP.includes(t)) score++
    if (score > bestScore) { bestScore = score; best = p }
  }
  if (!best || bestScore < 2) continue
  const gmcStar = gmc.rating ? Number(gmc.rating).toFixed(1) : '—'
  const jmStar = best.jmRating ? Number(best.jmRating).toFixed(1) : '—'
  const gmcVotes = gmc.votes
  const jmCount = best.jmCount
  const starMatch = gmcStar === jmStar
  const votesMatch = Math.abs(gmcVotes - jmCount) <= 5
  const ok = starMatch && votesMatch
  matched.push({ gmcTitle, jmTitle: best.title, gmcStar, gmcVotes, jmStar, jmCount, ok })
  const flag = ok ? '✓' : '🔴 MISMATCH'
  console.log(`${gmcTitle.slice(0, 52).padEnd(52)} | ${(gmcStar+'★/'+gmcVotes).padEnd(12)} | ${(jmStar+'★/'+jmCount).padEnd(17)} | ${flag}`)
}

console.log('\n=== POTENTIAL MISMATCHES (to discuss with Brian) ===')
for (const m of matched) {
  if (!m.ok) {
    console.log(`\n  PRODUCT: ${m.gmcTitle}`)
    console.log(`    Matched Shopify: ${m.jmTitle}`)
    console.log(`    GMC shows: ${m.gmcStar}★ from ${m.gmcVotes} votes`)
    console.log(`    Judge.me has: ${m.jmStar}★ from ${m.jmCount} reviews`)
    if (m.gmcVotes === 100) console.log(`    ⚠ GMC showing exactly 100 votes — possible default/cached value, Judge.me may have more recent count`)
  }
}
