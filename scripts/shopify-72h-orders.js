/**
 * Shopify orders 72h — Mon/Tue/Wed Jun 1-3
 * Track:
 *  - Orders per day
 *  - Revenue per day
 *  - Order source/referrer (UTM)
 *  - Compare to Google Ads conversions for attribution gap
 */
import 'dotenv/config'
import { writeFileSync, mkdirSync } from 'fs'

const SHOP = process.env.SHOPIFY_STORE_DOMAIN || 'bdd19a-3.myshopify.com'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN

async function getAllOrders(since, until) {
  const all = []
  let pageInfo = null
  let firstPage = true
  while (firstPage || pageInfo) {
    firstPage = false
    const qs = pageInfo
      ? `limit=250&page_info=${pageInfo}`
      : `limit=250&created_at_min=${since}T00:00:00%2B10:00&created_at_max=${until}T23:59:59%2B10:00&status=any&financial_status=any&fields=id,name,created_at,total_price,subtotal_price,financial_status,referring_site,landing_site,source_name,note_attributes,cancelled_at`
    const r = await fetch(`https://${SHOP}/admin/api/2026-01/orders.json?${qs}`, { headers: { 'X-Shopify-Access-Token': TOKEN } })
    const j = await r.json()
    all.push(...(j.orders||[]))
    const link = r.headers.get('link') || ''
    const next = link.match(/<[^>]*page_info=([^&>]+)[^>]*>;\s*rel="next"/)
    pageInfo = next?.[1] || null
    if (!pageInfo) break
  }
  return all
}

console.log(`\n=== SHOPIFY ORDERS 72H (Jun 1-3 AEST) ===\n`)
const orders = await getAllOrders('2026-06-01','2026-06-03')
console.log(`Total orders pulled: ${orders.length}\n`)

// Per day
const byDay = new Map()
for (const o of orders) {
  // Convert to AEST date
  const created = new Date(o.created_at)
  const aestOffset = 10 * 60 * 60 * 1000
  const aestDate = new Date(created.getTime() + aestOffset)
  const d = aestDate.toISOString().slice(0,10)
  if (!byDay.has(d)) byDay.set(d, {orders:0,revenue:0,cancelled:0,sources:new Map(),refSites:new Map()})
  const x = byDay.get(d)
  x.orders++
  x.revenue += Number(o.total_price||0)
  if (o.cancelled_at) x.cancelled++
  const src = o.source_name || 'web'
  x.sources.set(src, (x.sources.get(src)||0)+1)
  const ref = (o.referring_site || '(direct)').replace(/^https?:\/\//,'').split('/')[0].split('?')[0]
  x.refSites.set(ref, (x.refSites.get(ref)||0)+1)
}

console.log('━━━ ORDERS PER DAY (AEST) ━━━')
console.log('Date       | Day | Orders | Revenue   | AOV')
for (const [d,x] of [...byDay.entries()].sort()) {
  const dayName = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(d).getUTCDay()]
  const aov = x.orders > 0 ? '$'+(x.revenue/x.orders).toFixed(0) : '—'
  console.log(`${d} | ${dayName} | ${String(x.orders).padStart(6)} | $${x.revenue.toFixed(0).padStart(7)} | ${aov}`)
}

const tot = [...byDay.values()].reduce((a,x)=>({orders:a.orders+x.orders,revenue:a.revenue+x.revenue}),{orders:0,revenue:0})
console.log(`\nTotal 72h: ${tot.orders} orders, $${tot.revenue.toFixed(0)} revenue, AOV $${tot.orders>0?(tot.revenue/tot.orders).toFixed(0):0}`)

// Source breakdown
console.log(`\n━━━ ORDER SOURCES BY DAY ━━━\n`)
for (const [d,x] of [...byDay.entries()].sort()) {
  console.log(`\n${d}:`)
  console.log(`  Source: ${[...x.sources.entries()].sort((a,b)=>b[1]-a[1]).map(([s,n])=>`${s}=${n}`).join(', ')}`)
}

// Referrer breakdown (all 72h aggregated)
console.log(`\n\n━━━ REFERRING SITES (all 72h) ━━━\n`)
const allRef = new Map()
for (const [_,x] of byDay) {
  for (const [r,n] of x.refSites) allRef.set(r, (allRef.get(r)||0)+n)
}
const sortedRef = [...allRef.entries()].sort((a,b)=>b[1]-a[1])
for (const [ref, n] of sortedRef) {
  console.log(`  ${String(n).padStart(3)} orders | ${ref}`)
}

// Order-level UTM extraction from landing_site (where they entered)
console.log(`\n\n━━━ LANDING SITE / UTM ANALYSIS ━━━\n`)
const utmSources = new Map()
const utmMediums = new Map()
const utmCampaigns = new Map()
const directOrUnknown = []
for (const o of orders) {
  const landing = o.landing_site || ''
  const utm_source = landing.match(/utm_source=([^&]+)/)?.[1]
  const utm_medium = landing.match(/utm_medium=([^&]+)/)?.[1]
  const utm_campaign = landing.match(/utm_campaign=([^&]+)/)?.[1]
  if (utm_source) utmSources.set(utm_source, (utmSources.get(utm_source)||0)+1)
  if (utm_medium) utmMediums.set(utm_medium, (utmMediums.get(utm_medium)||0)+1)
  if (utm_campaign) utmCampaigns.set(utm_campaign, (utmCampaigns.get(utm_campaign)||0)+1)
  if (!utm_source) directOrUnknown.push({ id: o.name, total: o.total_price, ref: o.referring_site, landing: landing.slice(0,80) })
}
console.log(`UTM Source breakdown (${[...utmSources.values()].reduce((a,b)=>a+b,0)}/${orders.length} orders had utm_source):`)
for (const [s,n] of [...utmSources.entries()].sort((a,b)=>b[1]-a[1])) {
  console.log(`  ${String(n).padStart(3)} orders | utm_source=${s}`)
}
console.log(`\nUTM Medium breakdown:`)
for (const [m,n] of [...utmMediums.entries()].sort((a,b)=>b[1]-a[1])) {
  console.log(`  ${String(n).padStart(3)} orders | utm_medium=${m}`)
}
console.log(`\nUTM Campaign breakdown (top 15):`)
for (const [c,n] of [...utmCampaigns.entries()].sort((a,b)=>b[1]-a[1]).slice(0,15)) {
  console.log(`  ${String(n).padStart(3)} orders | utm_campaign=${c.slice(0,60)}`)
}

console.log(`\n\n━━━ ORDERS WITHOUT UTM SOURCE (${directOrUnknown.length}) ━━━`)
const refCounts = new Map()
for (const o of directOrUnknown) {
  const r = (o.ref || '(direct)').replace(/^https?:\/\//,'').split('/')[0].split('?')[0] || '(direct)'
  refCounts.set(r, (refCounts.get(r)||0)+1)
}
for (const [r,n] of [...refCounts.entries()].sort((a,b)=>b[1]-a[1])) {
  console.log(`  ${String(n).padStart(3)} orders | referring=${r}`)
}

mkdirSync('data/snapshots/shopify-72h', { recursive: true })
writeFileSync('data/snapshots/shopify-72h/data.json', JSON.stringify({
  byDay: Object.fromEntries([...byDay.entries()].map(([k,v])=>[k,{...v, sources:[...v.sources], refSites:[...v.refSites]}])),
  utmSources: [...utmSources.entries()], utmMediums: [...utmMediums.entries()], utmCampaigns: [...utmCampaigns.entries()],
  ordersWithoutUtm: directOrUnknown,
}, null, 2))
console.log(`\nFull data: data/snapshots/shopify-72h/data.json`)
process.exit(0)
