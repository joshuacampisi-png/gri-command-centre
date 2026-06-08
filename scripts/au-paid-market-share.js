/**
 * AU GENDER REVEAL — PAID MARKET SHARE
 *
 * For every commercial query, pulls the full live AU SERP and extracts:
 *   - popular_products (paid + free Shopping carousel)
 *   - paid (sponsored text ads)
 *   - product_carousel
 *
 * Aggregates by domain to compute share of paid placements.
 * Cross-references with our Google Ads impression share data.
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'

const EMAIL = process.env.DATAFORSEO_EMAIL
const PASSWORD = process.env.DATAFORSEO_PASSWORD
const AUTH = 'Basic ' + Buffer.from(`${EMAIL}:${PASSWORD}`).toString('base64')

const KEYWORDS = [
  'gender reveal', 'gender reveal ideas', 'gender reveal australia',
  'gender reveal cannon', 'gender reveal cannons', 'gender reveal poppers', 'gender reveal balloon',
  'gender reveal box', 'gender reveal smoke', 'gender reveal smoke bomb', 'gender reveal smoke cannon',
  'gender reveal extinguisher', 'gender reveal powder', 'gender reveal confetti', 'gender reveal kit',
  'gender reveal blaster', 'gender reveal tnt', 'gender reveal burnout', 'gender reveal dry ice',
  'gender reveal football', 'gender reveal golf ball',
  'gender reveal sydney', 'gender reveal melbourne', 'gender reveal brisbane', 'gender reveal perth',
  'gender reveal adelaide', 'gender reveal gold coast', 'gender reveal newcastle', 'gender reveal canberra',
]

async function dfs(path, body) {
  const r = await fetch(`https://api.dataforseo.com/v3/${path}`, {
    method: 'POST',
    headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return r.json()
}

console.log(`\n=== AU GENDER REVEAL PAID MARKET SHARE — ${KEYWORDS.length} queries ===\n`)

// Get volumes
const volRes = await dfs('keywords_data/google_ads/search_volume/live', [{
  location_code: 2036, language_code: 'en', keywords: KEYWORDS,
}])
const volumes = {}
for (const it of volRes.tasks?.[0]?.result || []) {
  volumes[it.keyword] = it.search_volume || 0
}

// Pull ADVANCED SERP for each (includes paid + Shopping items)
const shoppingByDomain = {}  // popular_products domain → { appearances, volume_weight }
const paidByDomain = {}      // sponsored ad domain → { appearances, volume_weight }
const shoppingPositionShare = {}  // domain → estimated impressions in Shopping carousel

let i = 0
for (const kw of KEYWORDS) {
  i++
  process.stdout.write(`  [${i}/${KEYWORDS.length}] ${kw.padEnd(40)}`)
  try {
    const r = await dfs('serp/google/organic/live/advanced', [{
      keyword: kw, location_code: 2036, language_code: 'en', device: 'desktop', depth: 10, calculate_rectangles: false,
    }])
    const items = r.tasks?.[0]?.result?.[0]?.items || []
    const vol = volumes[kw] || 0

    let pop = 0, paid = 0
    for (const it of items) {
      // popular_products = the Shopping carousel "Popular products"
      if (it.type === 'popular_products' && it.items) {
        for (const p of it.items) {
          const d = p.shop || p.domain || p.seller || null
          if (!d) continue
          shoppingByDomain[d] = shoppingByDomain[d] || { appearances: 0, volWeight: 0, listings: 0 }
          shoppingByDomain[d].appearances += 1
          shoppingByDomain[d].listings += 1
          shoppingByDomain[d].volWeight += vol
          pop++
        }
      }
      // paid = sponsored text ads
      if (it.type === 'paid' && it.domain) {
        paidByDomain[it.domain] = paidByDomain[it.domain] || { appearances: 0, volWeight: 0 }
        paidByDomain[it.domain].appearances += 1
        paidByDomain[it.domain].volWeight += vol
        paid++
      }
    }
    console.log(` Shopping:${pop} Paid:${paid}`)
  } catch (e) {
    console.log(` ERROR ${e.message?.slice(0,50)}`)
  }
}

// Summarise Shopping (popular_products)
console.log(`\n=== SHOPPING CAROUSEL MARKET SHARE (popular_products) ===`)
console.log(`Domain                                          | Listings | Vol-Weight | Share%`)
console.log('------------------------------------------------+----------+-----------+-------')
const totalShoppingWeight = Object.values(shoppingByDomain).reduce((s, x) => s + x.volWeight, 0)
const shopRanked = Object.entries(shoppingByDomain)
  .map(([d, s]) => ({ domain: d, ...s, share: s.volWeight / totalShoppingWeight * 100 }))
  .sort((a,b) => b.share - a.share)
for (const x of shopRanked.slice(0, 20)) {
  console.log(`${x.domain.padEnd(48)} | ${x.listings.toString().padStart(8)} | ${x.volWeight.toString().padStart(9)} | ${x.share.toFixed(1).padStart(5)}%`)
}

// Summarise Paid text ads
console.log(`\n=== PAID TEXT ADS MARKET SHARE (sponsored search ads) ===`)
console.log(`Domain                                          | Appearances | Vol-Weight | Share%`)
console.log('------------------------------------------------+-------------+-----------+-------')
const totalPaidWeight = Object.values(paidByDomain).reduce((s, x) => s + x.volWeight, 0)
const paidRanked = Object.entries(paidByDomain)
  .map(([d, s]) => ({ domain: d, ...s, share: s.volWeight / Math.max(totalPaidWeight, 1) * 100 }))
  .sort((a,b) => b.share - a.share)
for (const x of paidRanked.slice(0, 20)) {
  console.log(`${x.domain.padEnd(48)} | ${x.appearances.toString().padStart(11)} | ${x.volWeight.toString().padStart(9)} | ${x.share.toFixed(1).padStart(5)}%`)
}

console.log(`\n=== OUR GOOGLE ADS AUCTION DATA (30d, internal IS metrics) ===`)
const c = getGadsCustomer()
const end = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
const start = new Date(Date.now() - 30*86400000).toISOString().slice(0, 10)
const isRows = await c.query(`
  SELECT campaign.name, campaign.advertising_channel_type,
         metrics.impressions, metrics.cost_micros,
         metrics.search_impression_share, metrics.search_top_impression_share,
         metrics.search_absolute_top_impression_share
  FROM campaign
  WHERE segments.date BETWEEN '${start}' AND '${end}'
    AND campaign.status = 'ENABLED'
`)
const ourIS = new Map()
for (const r of isRows) {
  const k = r.campaign?.name
  const cur = ourIS.get(k) || { ch: r.campaign?.advertising_channel_type, imp: 0, sp: 0, is: 0, top: 0, abs: 0, n: 0 }
  cur.imp += Number(r.metrics?.impressions || 0)
  cur.sp += Number(r.metrics?.cost_micros || 0) / 1e6
  if (r.metrics?.search_impression_share != null) {
    cur.is += Number(r.metrics.search_impression_share)
    cur.top += Number(r.metrics.search_top_impression_share || 0)
    cur.abs += Number(r.metrics.search_absolute_top_impression_share || 0)
    cur.n++
  }
  ourIS.set(k, cur)
}
for (const [name, x] of ourIS) {
  if (x.imp < 1000) continue
  const is = x.n ? (x.is/x.n*100).toFixed(0) : '-'
  const top = x.n ? (x.top/x.n*100).toFixed(0) : '-'
  const abs = x.n ? (x.abs/x.n*100).toFixed(0) : '-'
  console.log(`  ${name.padEnd(40)} | ${x.imp.toString().padStart(7)}imp | $${x.sp.toFixed(0)} | IS:${is}% Top:${top}% Abs:${abs}%`)
}

process.exit(0)
