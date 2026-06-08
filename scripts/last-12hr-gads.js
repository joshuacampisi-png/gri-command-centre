/**
 * Last 12 hours Google Ads + Shopify cross-reference
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const c = getGadsCustomer()

console.log(`\n=== LAST 12 HOURS — GOOGLE ADS + SHOPIFY ===\n`)
console.log(`Pulled: ${new Date().toISOString()}\n`)

// Hourly breakdown for today (May 20)
const today = '2026-05-20'
console.log(`--- HOURLY BREAKDOWN (${today} AEST) ---`)
const hourly = await c.query(`
  SELECT segments.hour, metrics.cost_micros, metrics.clicks, metrics.impressions,
         metrics.conversions, metrics.conversions_value
  FROM customer
  WHERE segments.date='${today}'
`)
const byHour = new Map()
for (const r of hourly) {
  const h = r.segments?.hour
  if (h === undefined || h === null) continue
  if (!byHour.has(h)) byHour.set(h, { spend:0,clicks:0,impr:0,conv:0,val:0 })
  const x = byHour.get(h)
  x.spend += Number(r.metrics?.cost_micros||0)/1e6
  x.clicks += Number(r.metrics?.clicks||0)
  x.impr   += Number(r.metrics?.impressions||0)
  x.conv   += Number(r.metrics?.conversions||0)
  x.val    += Number(r.metrics?.conversions_value||0)
}
let tS=0,tC=0,tI=0,tCv=0,tV=0
const sortedHours = [...byHour.entries()].sort((a,b)=>a[0]-b[0])
for (const [h, x] of sortedHours) {
  const roas = x.spend>0?(x.val/x.spend).toFixed(2):'-'
  const bar = '█'.repeat(Math.min(Math.round(x.val/20),30))
  console.log(`  ${String(h).padStart(2,'0')}:00 | $${x.spend.toFixed(0).padStart(3)} | ${String(x.clicks).padStart(3)} cl | ${String(x.impr).padStart(4)} imp | ${x.conv.toFixed(1).padStart(4)} conv | $${x.val.toFixed(0).padStart(4)} ${bar} | ${roas}x`)
  tS+=x.spend;tC+=x.clicks;tI+=x.impr;tCv+=x.conv;tV+=x.val
}
console.log(`  TOTAL | $${tS.toFixed(0).padStart(3)} | ${String(tC).padStart(3)} cl | ${String(tI).padStart(4)} imp | ${tCv.toFixed(1).padStart(4)} conv | $${tV.toFixed(0).padStart(4)} | ${tS>0?(tV/tS).toFixed(2):'-'}x`)

// Last 12 hours specifically
const nowHour = new Date().getHours()
const last12cutoff = (nowHour - 12 + 24) % 24
console.log(`\n--- LAST 12hrs WINDOW (since hour ${last12cutoff} local) ---`)
let l12S=0,l12C=0,l12I=0,l12Cv=0,l12V=0
for (const [h,x] of sortedHours) {
  if (h >= last12cutoff) {
    l12S+=x.spend;l12C+=x.clicks;l12I+=x.impr;l12Cv+=x.conv;l12V+=x.val
  }
}
console.log(`  $${l12S.toFixed(0)} spend | ${l12C} clicks | ${l12I} imp | ${l12Cv.toFixed(1)} conv | $${l12V.toFixed(0)} rev | ${l12S>0?(l12V/l12S).toFixed(2):'-'}x ROAS`)

// Today by campaign
console.log(`\n--- TODAY BY CAMPAIGN (${today}) ---`)
const camps = await c.query(`SELECT campaign.name, metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions, metrics.conversions_value FROM campaign WHERE campaign.status='ENABLED' AND segments.date='${today}'`)
for (const r of camps.sort((a,b)=>Number(b.metrics?.cost_micros||0)-Number(a.metrics?.cost_micros||0))) {
  const s=Number(r.metrics?.cost_micros||0)/1e6,cl=Number(r.metrics?.clicks||0),i=Number(r.metrics?.impressions||0),cv=Number(r.metrics?.conversions||0),v=Number(r.metrics?.conversions_value||0)
  if (s>0||cl>0) {
    const roas = s>0?(v/s).toFixed(2):'-'
    console.log(`  ${r.campaign.name.padEnd(40)} $${s.toFixed(0).padStart(3)} | ${String(cl).padStart(3)} cl | ${String(i).padStart(5)} imp | ${cv.toFixed(1).padStart(4)} conv | $${v.toFixed(0).padStart(4)} | ${roas}x`)
  }
}

// SHOPIFY orders last 12hrs
console.log(`\n--- SHOPIFY ORDERS (LAST 12 HOURS) ---`)
const SHOPIFY_URL = 'https://bdd19a-3.myshopify.com/admin/api/2026-01/graphql.json'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN
const twelveAgoUTC = new Date(Date.now() - 12*60*60*1000).toISOString()
const shop = await fetch(SHOPIFY_URL, {
  method:'POST',
  headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json'},
  body: JSON.stringify({ query: `{
    orders(first: 100, query: "created_at:>=${twelveAgoUTC}", sortKey: CREATED_AT, reverse: true) {
      edges { node {
        name createdAt
        totalPriceSet { shopMoney { amount currencyCode } }
        customer { displayName }
        lineItems(first: 5) { edges { node { title quantity } } }
      } }
    }
  }`})
})
const data = await shop.json()
const orders = data.data?.orders?.edges || []
let revTotal = 0
for (const {node:o} of orders) {
  const amt = parseFloat(o.totalPriceSet?.shopMoney?.amount||0)
  revTotal += amt
  const items = o.lineItems.edges.map(e=>`${e.node.quantity}x ${e.node.title.slice(0,30)}`).join(' / ')
  const aest = new Date(new Date(o.createdAt).getTime() + 10*60*60*1000).toISOString().slice(11,16)
  console.log(`  ${aest} AEST | ${o.name} | $${amt.toFixed(0)} | ${items}`)
}
console.log(`\n  TOTAL: ${orders.length} orders | $${revTotal.toFixed(0)} revenue (last 12hrs)`)

process.exit(0)
