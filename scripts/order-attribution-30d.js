/**
 * Pull last 30d orders + customer journey attribution
 * Tells us: which channels are converting + what the channel mix actually looks like
 */
import 'dotenv/config'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN
const URL = 'https://bdd19a-3.myshopify.com/admin/api/2026-01/graphql.json'

async function gql(query, variables) {
  const r = await fetch(URL,{method:'POST',headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query,variables})})
  return r.json()
}

const startUTC = new Date(Date.now() - 30*24*60*60*1000).toISOString()
console.log(`\n=== LAST 30 DAYS — ORDER ATTRIBUTION + CHANNEL MIX ===`)
console.log(`Since: ${startUTC}\n`)

let after = null
let allOrders = []
let page = 0
while (true) {
  page++
  const q = `query($after: String) {
    orders(first: 250, after: $after, query: "created_at:>=${startUTC}", sortKey: CREATED_AT, reverse: true) {
      pageInfo { hasNextPage endCursor }
      edges { node {
        name createdAt
        totalPriceSet { shopMoney { amount } }
        sourceName
        customerJourneySummary {
          momentsCount { count }
          daysToConversion
          firstVisit { source sourceType utmParameters { source medium campaign } landingPage }
          lastVisit { source sourceType utmParameters { source medium campaign } landingPage }
        }
      } }
    }
  }`
  const r = await gql(q, { after })
  if (r.errors) { console.error(JSON.stringify(r.errors)); break }
  const edges = r.data?.orders?.edges || []
  allOrders.push(...edges.map(e=>e.node))
  if (!r.data?.orders?.pageInfo?.hasNextPage || page > 10) break
  after = r.data.orders.pageInfo.endCursor
}

console.log(`Total orders pulled: ${allOrders.length}\n`)

// Tally
function categorize(visit) {
  if (!visit) return 'unknown'
  const s = (visit.source || visit.sourceType || '').toLowerCase()
  const utmSrc = (visit.utmParameters?.source || '').toLowerCase()
  const utmMed = (visit.utmParameters?.medium || '').toLowerCase()
  const utmCamp = (visit.utmParameters?.campaign || '').toLowerCase()

  if (s.includes('chatgpt') || s.includes('perplexity') || s.includes('claude')) return 'AI'
  if (utmCamp === 'sag_organic' || (utmSrc==='google' && utmMed==='product_sync')) return 'Google FREE Shopping (sag_organic)'
  if (utmMed === 'paid' && utmSrc === 'facebook') return 'Meta PAID'
  if (utmMed === 'paid' && utmSrc === 'google') return 'Google PAID'
  if (s.includes('google') || utmSrc === 'google') return 'Google Organic Search'
  if (s.includes('facebook') || utmSrc === 'facebook' || utmSrc === 'fb') return 'Facebook'
  if (s.includes('instagram') || utmSrc === 'instagram' || utmSrc === 'ig') return 'Instagram'
  if (s.includes('tiktok')) return 'TikTok'
  if (s.includes('youtube')) return 'YouTube'
  if (s.includes('pinterest')) return 'Pinterest'
  if (s.includes('bing')) return 'Bing'
  if (s.includes('email') || utmMed === 'email') return 'Email'
  if (s.includes('klaviyo')) return 'Email (Klaviyo)'
  if (s.includes('direct') || s === '') return 'Direct'
  if (s.includes('unknown')) return 'Unknown'
  return s.slice(0,30)
}

const firstClick = {}
const lastClick = {}
const dailyOrders = {}
let totalRev = 0

for (const o of allOrders) {
  const amt = parseFloat(o.totalPriceSet?.shopMoney?.amount||0)
  totalRev += amt
  const fcChan = categorize(o.customerJourneySummary?.firstVisit)
  const lcChan = categorize(o.customerJourneySummary?.lastVisit)
  if (!firstClick[fcChan]) firstClick[fcChan] = {orders:0,rev:0}
  if (!lastClick[lcChan]) lastClick[lcChan] = {orders:0,rev:0}
  firstClick[fcChan].orders++
  firstClick[fcChan].rev += amt
  lastClick[lcChan].orders++
  lastClick[lcChan].rev += amt
  const day = new Date(new Date(o.createdAt).getTime() + 10*60*60*1000).toISOString().slice(0,10)
  if (!dailyOrders[day]) dailyOrders[day] = {orders:0,rev:0}
  dailyOrders[day].orders++
  dailyOrders[day].rev += amt
}

console.log(`Total revenue: $${totalRev.toFixed(0)}`)
console.log(`AOV: $${(totalRev/allOrders.length).toFixed(0)}`)
console.log(`Avg orders/day: ${(allOrders.length/30).toFixed(1)}\n`)

console.log(`--- FIRST-CLICK ATTRIBUTION (30d) ---`)
console.log(`  Channel                              | Orders | Revenue   | % of rev`)
for (const [chan, d] of Object.entries(firstClick).sort((a,b)=>b[1].rev-a[1].rev)) {
  const pct = ((d.rev/totalRev)*100).toFixed(1)
  const bar = '█'.repeat(Math.min(Math.round(d.rev/500), 30))
  console.log(`  ${chan.padEnd(36)} | ${String(d.orders).padStart(6)} | $${d.rev.toFixed(0).padStart(7)} | ${pct.padStart(5)}% ${bar}`)
}

console.log(`\n--- LAST-CLICK ATTRIBUTION (30d) ---`)
console.log(`  Channel                              | Orders | Revenue   | % of rev`)
for (const [chan, d] of Object.entries(lastClick).sort((a,b)=>b[1].rev-a[1].rev)) {
  const pct = ((d.rev/totalRev)*100).toFixed(1)
  const bar = '█'.repeat(Math.min(Math.round(d.rev/500), 30))
  console.log(`  ${chan.padEnd(36)} | ${String(d.orders).padStart(6)} | $${d.rev.toFixed(0).padStart(7)} | ${pct.padStart(5)}% ${bar}`)
}

// Daily trend
console.log(`\n--- DAILY ORDERS TREND ---`)
const sortedDays = Object.entries(dailyOrders).sort((a,b)=>a[0].localeCompare(b[0]))
for (const [day, d] of sortedDays) {
  const bar = '█'.repeat(Math.min(d.orders, 40))
  console.log(`  ${day} | ${String(d.orders).padStart(3)} orders | $${d.rev.toFixed(0).padStart(5)} ${bar}`)
}

// Journey length analysis
const journeyBuckets = {'1 touch':0,'2-3 touches':0,'4-9 touches':0,'10+ touches':0}
const daysBuckets = {'<1 day':0,'1-3 days':0,'4-7 days':0,'8-14 days':0,'15-30 days':0,'30+ days':0}
for (const o of allOrders) {
  const m = o.customerJourneySummary?.momentsCount?.count || 0
  const d = o.customerJourneySummary?.daysToConversion || 0
  if (m === 1) journeyBuckets['1 touch']++
  else if (m <= 3) journeyBuckets['2-3 touches']++
  else if (m <= 9) journeyBuckets['4-9 touches']++
  else journeyBuckets['10+ touches']++
  if (d < 1) daysBuckets['<1 day']++
  else if (d <= 3) daysBuckets['1-3 days']++
  else if (d <= 7) daysBuckets['4-7 days']++
  else if (d <= 14) daysBuckets['8-14 days']++
  else if (d <= 30) daysBuckets['15-30 days']++
  else daysBuckets['30+ days']++
}
console.log(`\n--- CUSTOMER JOURNEY (30d) ---`)
console.log(`Touchpoints before purchase:`)
for (const [b, c] of Object.entries(journeyBuckets)) console.log(`  ${b.padEnd(15)} ${c} (${((c/allOrders.length)*100).toFixed(0)}%)`)
console.log(`\nDays to conversion:`)
for (const [b, c] of Object.entries(daysBuckets)) console.log(`  ${b.padEnd(15)} ${c} (${((c/allOrders.length)*100).toFixed(0)}%)`)

process.exit(0)
