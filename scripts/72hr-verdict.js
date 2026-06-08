/**
 * TRUE 72-hour verdict
 * Pre-change window:  May 16-18 (3 days, no changes)
 * Post-change window: May 19-21 (3 days, negative removals shipped)
 * Today's data (partial): May 22 (in-flight)
 *
 * Pulls Shopify orders date-based + Google Ads daily + true attribution
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'

const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN
const URL = 'https://bdd19a-3.myshopify.com/admin/api/2026-01/graphql.json'
const c = getGadsCustomer()

async function shopify(query) {
  const r = await fetch(URL,{method:'POST',headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query})})
  return r.json()
}

function categorize(visit) {
  if (!visit) return 'unknown'
  const s = (visit.source||visit.sourceType||'').toLowerCase()
  const utmSrc = (visit.utmParameters?.source||'').toLowerCase()
  const utmMed = (visit.utmParameters?.medium||'').toLowerCase()
  const utmCamp = (visit.utmParameters?.campaign||'').toLowerCase()
  if (s.includes('chatgpt') || s.includes('perplexity')) return 'AI'
  if (utmCamp === 'sag_organic' || (utmSrc==='google' && utmMed==='product_sync')) return 'Google_Free_Shopping'
  if (utmMed === 'paid' && utmSrc === 'google') return 'Google_PAID'
  if (utmMed === 'paid' && utmSrc === 'facebook') return 'Meta_PAID'
  if (s.includes('google') || utmSrc === 'google') return 'Google_Organic'
  if (s.includes('facebook') || utmSrc === 'facebook' || utmSrc === 'fb') return 'Facebook'
  if (s.includes('instagram') || utmSrc === 'instagram' || utmSrc === 'ig') return 'Instagram'
  if (s.includes('tiktok')) return 'TikTok'
  if (s.includes('email') || utmMed === 'email' || s.includes('klaviyo')) return 'Email'
  if (s.includes('direct') || s === '') return 'Direct'
  return 'Other'
}

// Pull 7 days of orders
const startUTC = '2026-05-15T14:00:00Z' // May 16 00:00 AEST
let after = null
let allOrders = []
while (true) {
  const q = `query {
    orders(first: 250, ${after?'after:"'+after+'",':''} query: "created_at:>=${startUTC}", sortKey: CREATED_AT) {
      pageInfo { hasNextPage endCursor }
      edges { node {
        name createdAt
        totalPriceSet { shopMoney { amount } }
        customerJourneySummary {
          firstVisit { source sourceType utmParameters { source medium campaign } }
          lastVisit { source sourceType utmParameters { source medium campaign } }
        }
      } }
    }
  }`
  const j = await shopify(q)
  if (j.errors) { console.error(JSON.stringify(j.errors)); break }
  const edges = j.data?.orders?.edges || []
  allOrders.push(...edges.map(e=>e.node))
  if (!j.data?.orders?.pageInfo?.hasNextPage) break
  after = j.data.orders.pageInfo.endCursor
}

// Group by AEST day
function aestDay(iso) {
  const aest = new Date(new Date(iso).getTime() + 10*60*60*1000)
  return aest.toISOString().slice(0,10)
}

const byDay = {}
for (const o of allOrders) {
  const d = aestDay(o.createdAt)
  if (!byDay[d]) byDay[d] = { orders: 0, rev: 0, byChan: {} }
  const amt = parseFloat(o.totalPriceSet?.shopMoney?.amount||0)
  byDay[d].orders++
  byDay[d].rev += amt
  const fc = categorize(o.customerJourneySummary?.firstVisit)
  if (!byDay[d].byChan[fc]) byDay[d].byChan[fc] = { orders:0, rev:0 }
  byDay[d].byChan[fc].orders++
  byDay[d].byChan[fc].rev += amt
}

console.log(`\n=== TRUE 72-HOUR VERDICT — Friday May 22 ===`)
console.log(`Total orders pulled: ${allOrders.length}\n`)

// Daily summary table
console.log(`--- DAILY SHOPIFY REVENUE (date-based, AEST) ---`)
console.log(`Date       | Orders | Revenue  | Avg/order | Window`)
const sortedDays = Object.keys(byDay).sort()
for (const d of sortedDays) {
  const v = byDay[d]
  let window = ''
  if (d === '2026-05-16' || d === '2026-05-17' || d === '2026-05-18') window = 'PRE-CHANGE'
  if (d === '2026-05-19') window = '⚡ CHANGE DAY 1 (5 brand neg removed)'
  if (d === '2026-05-20') window = '⚡ CHANGE DAY 2 (8 campaign neg removed)'
  if (d === '2026-05-21') window = '⚡ CHANGE DAY 3 (8 product neg removed)'
  if (d === '2026-05-22') window = '⚡ TODAY (in-flight)'
  console.log(`  ${d} |   ${String(v.orders).padStart(3)} | $${v.rev.toFixed(0).padStart(6)} |     $${(v.rev/v.orders).toFixed(0).padStart(4)} | ${window}`)
}

// Windows
const preDays = ['2026-05-16','2026-05-17','2026-05-18']
const postDays = ['2026-05-19','2026-05-20','2026-05-21']

let preO=0, preR=0, postO=0, postR=0
for (const d of preDays) { if(byDay[d]){preO+=byDay[d].orders;preR+=byDay[d].rev}}
for (const d of postDays) { if(byDay[d]){postO+=byDay[d].orders;postR+=byDay[d].rev}}

console.log(`\n--- 3-DAY WINDOW COMPARISON ---`)
console.log(`PRE  (May 16-18): ${preO} orders | $${preR.toFixed(0)} | avg $${(preR/3).toFixed(0)}/day`)
console.log(`POST (May 19-21): ${postO} orders | $${postR.toFixed(0)} | avg $${(postR/3).toFixed(0)}/day`)
console.log(`Δ Orders: ${postO-preO} (${(((postO-preO)/preO)*100).toFixed(0)}%)`)
console.log(`Δ Revenue: $${(postR-preR).toFixed(0)} (${(((postR-preR)/preR)*100).toFixed(0)}%)`)

// Channel mix — true attribution comparison
console.log(`\n--- CHANNEL MIX SHIFT (first-click revenue) ---`)
const channels = new Set()
for (const d of [...preDays, ...postDays]) {
  if (!byDay[d]) continue
  for (const ch of Object.keys(byDay[d].byChan)) channels.add(ch)
}
console.log(`Channel              | Pre 3d $ | Post 3d $ | Δ      | Pre %  | Post %`)
for (const ch of [...channels].sort()) {
  let preV = 0, postV = 0
  for (const d of preDays) preV += byDay[d]?.byChan?.[ch]?.rev || 0
  for (const d of postDays) postV += byDay[d]?.byChan?.[ch]?.rev || 0
  const dPct = preV>0 ? (((postV-preV)/preV)*100).toFixed(0)+'%' : 'new'
  const prePct = preR>0 ? ((preV/preR)*100).toFixed(1)+'%' : '0%'
  const postPct = postR>0 ? ((postV/postR)*100).toFixed(1)+'%' : '0%'
  console.log(`  ${ch.padEnd(20)} | $${preV.toFixed(0).padStart(6)} | $${postV.toFixed(0).padStart(7)} | ${dPct.padStart(6)} | ${prePct.padStart(6)} | ${postPct.padStart(6)}`)
}

// Google Ads — same windows
console.log(`\n--- GOOGLE ADS DAILY (PAID only) ---`)
console.log(`Date       | Spend  | Clicks | Impr   | Conv | Rev    | ROAS`)
for (const d of [...preDays, ...postDays, '2026-05-22']) {
  const camps = await c.query(`SELECT metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions, metrics.conversions_value FROM campaign WHERE campaign.status='ENABLED' AND segments.date='${d}'`)
  let s=0,cl=0,i=0,cv=0,v=0
  for (const r of camps) { s+=Number(r.metrics?.cost_micros||0)/1e6; cl+=Number(r.metrics?.clicks||0); i+=Number(r.metrics?.impressions||0); cv+=Number(r.metrics?.conversions||0); v+=Number(r.metrics?.conversions_value||0)}
  const roas = s>0?(v/s).toFixed(2)+'x':'-'
  console.log(`  ${d} | $${s.toFixed(0).padStart(4)} |  ${String(cl).padStart(4)} | ${String(i).padStart(5)} | ${cv.toFixed(1).padStart(4)} | $${v.toFixed(0).padStart(4)} | ${roas.padStart(5)}`)
}

// Per-campaign breakdown for pre/post
console.log(`\n--- PMAX ALL PRODUCTS — Pre vs Post ---`)
for (const [label, days] of [['PRE  May 16-18', preDays],['POST May 19-21', postDays]]) {
  let s=0,cl=0,cv=0,v=0,i=0
  for (const d of days) {
    const r = await c.query(`SELECT metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions, metrics.conversions_value FROM campaign WHERE campaign.name='GRI PMAX | All Products' AND segments.date='${d}'`)
    for (const x of r) { s+=Number(x.metrics?.cost_micros||0)/1e6; cl+=Number(x.metrics?.clicks||0); i+=Number(x.metrics?.impressions||0); cv+=Number(x.metrics?.conversions||0); v+=Number(x.metrics?.conversions_value||0) }
  }
  console.log(`  ${label} | $${s.toFixed(0)} spend | ${cl} cl | ${i} imp | ${cv.toFixed(1)} conv | $${v.toFixed(0)} rev | ROAS ${s>0?(v/s).toFixed(2):'-'}x`)
}

console.log(`\n--- BRAND DEFENCE — Pre vs Post ---`)
for (const [label, days] of [['PRE  May 16-18', preDays],['POST May 19-21', postDays]]) {
  let s=0,cl=0,i=0,cv=0,v=0
  for (const d of days) {
    const r = await c.query(`SELECT metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions, metrics.conversions_value FROM campaign WHERE campaign.id=23425232813 AND segments.date='${d}'`)
    for (const x of r) { s+=Number(x.metrics?.cost_micros||0)/1e6; cl+=Number(x.metrics?.clicks||0); i+=Number(x.metrics?.impressions||0); cv+=Number(x.metrics?.conversions||0); v+=Number(x.metrics?.conversions_value||0) }
  }
  console.log(`  ${label} | $${s.toFixed(0)} | ${cl} cl | ${i} imp | ${cv} conv (Brand Defence has 24-72hr conv lag)`)
}

process.exit(0)
