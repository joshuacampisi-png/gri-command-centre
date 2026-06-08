/**
 * Last 6 hours Shopify orders + full attribution check
 */
import 'dotenv/config'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const URL = 'https://bdd19a-3.myshopify.com/admin/api/2026-01/graphql.json'

const sixAgoUTC = new Date(Date.now() - 6*60*60*1000).toISOString()

const query = `{
  orders(first: 50, query: "created_at:>=${sixAgoUTC}", sortKey: CREATED_AT, reverse: true) {
    edges { node {
      name createdAt
      totalPriceSet { shopMoney { amount } }
      sourceName
      sourceIdentifier
      customerJourneySummary {
        momentsCount { count }
        daysToConversion
        firstVisit {
          source
          sourceType
          landingPage
          landingPageHtml
          referrerUrl
          utmParameters { source medium campaign content term }
        }
        lastVisit {
          source
          sourceType
          landingPage
          referrerUrl
          utmParameters { source medium campaign content term }
        }
      }
      lineItems(first: 3) { edges { node { title quantity } } }
    } }
  }
}`

const r = await fetch(URL,{method:'POST',headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query})})
const d = await r.json()
if (d.errors) { console.error(JSON.stringify(d.errors, null, 2)); process.exit(1) }

const orders = d.data?.orders?.edges || []
console.log(`\n=== LAST 6 HOURS — ATTRIBUTION REPORT ===\n`)
console.log(`Pulled: ${new Date().toISOString()}`)
console.log(`Cutoff: ${sixAgoUTC}\n`)
console.log(`Total orders: ${orders.length}\n`)

let totalRev = 0
const sourceCount = {}
const firstClickByChannel = {}
const lastClickByChannel = {}

for (const {node:o} of orders) {
  const amt = parseFloat(o.totalPriceSet?.shopMoney?.amount||0)
  totalRev += amt
  const aest = new Date(new Date(o.createdAt).getTime() + 10*60*60*1000).toISOString().slice(11,16)

  const fv = o.customerJourneySummary?.firstVisit
  const lv = o.customerJourneySummary?.lastVisit
  const moments = o.customerJourneySummary?.momentsCount?.count
  const days = o.customerJourneySummary?.daysToConversion

  const firstSrc = fv?.source || fv?.sourceType || 'unknown'
  const lastSrc = lv?.source || lv?.sourceType || 'unknown'
  const firstUtm = fv?.utmParameters
  const lastUtm = lv?.utmParameters

  // Tally
  firstClickByChannel[firstSrc] = (firstClickByChannel[firstSrc] || 0) + amt
  lastClickByChannel[lastSrc] = (lastClickByChannel[lastSrc] || 0) + amt
  sourceCount[o.sourceName||'unknown'] = (sourceCount[o.sourceName||'unknown']||0) + 1

  console.log(`${aest} AEST | ${o.name} | $${amt.toFixed(0).padStart(4)} | source: ${o.sourceName||'?'}`)
  console.log(`  First click: ${firstSrc.padEnd(20)} ${fv?.landingPage ? '→ '+fv.landingPage.slice(0,60) : ''}`)
  if (firstUtm?.source || firstUtm?.medium || firstUtm?.campaign) {
    console.log(`    UTM: source=${firstUtm.source||'-'} medium=${firstUtm.medium||'-'} campaign=${firstUtm.campaign||'-'}`)
  }
  console.log(`  Last click:  ${lastSrc.padEnd(20)} ${lv?.landingPage ? '→ '+lv.landingPage.slice(0,60) : ''}`)
  if (lastUtm?.source || lastUtm?.medium || lastUtm?.campaign) {
    console.log(`    UTM: source=${lastUtm.source||'-'} medium=${lastUtm.medium||'-'} campaign=${lastUtm.campaign||'-'}`)
  }
  console.log(`  Journey: ${moments||'?'} touches, ${days||0}d to convert`)
  console.log()
}

console.log(`\n=== SUMMARY ===`)
console.log(`Orders:   ${orders.length}`)
console.log(`Revenue:  $${totalRev.toFixed(0)}`)
console.log(`AOV:      $${(totalRev/orders.length).toFixed(0)}`)

console.log(`\n--- FIRST-CLICK ATTRIBUTION (revenue) ---`)
for (const [src, rev] of Object.entries(firstClickByChannel).sort((a,b)=>b[1]-a[1])) {
  const pct = (rev/totalRev*100).toFixed(0)
  console.log(`  ${src.padEnd(30)} $${rev.toFixed(0).padStart(5)} (${pct}%)`)
}

console.log(`\n--- LAST-CLICK ATTRIBUTION (revenue) ---`)
for (const [src, rev] of Object.entries(lastClickByChannel).sort((a,b)=>b[1]-a[1])) {
  const pct = (rev/totalRev*100).toFixed(0)
  console.log(`  ${src.padEnd(30)} $${rev.toFixed(0).padStart(5)} (${pct}%)`)
}

console.log(`\n--- SHOPIFY ORDER SOURCE ---`)
for (const [src, count] of Object.entries(sourceCount).sort((a,b)=>b[1]-a[1])) {
  console.log(`  ${src.padEnd(30)} ${count} orders`)
}

process.exit(0)
