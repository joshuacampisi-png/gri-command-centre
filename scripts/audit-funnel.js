/**
 * Add-to-cart funnel audit using Shopify Admin + Google Ads data
 *
 * Shopify Admin doesn't expose session/PV directly via Admin API — that's Storefront/Analytics.
 * But we CAN compute:
 *  - Orders by day (Shopify)
 *  - Sessions/clicks by day (Google Ads)
 *  - Computed CVR = orders/clicks
 *  - Checkout abandonment (started checkouts that didn't complete)
 *  - Average order value trend
 *  - Cart abandonment via abandoned_checkouts endpoint
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const c = getGadsCustomer()
const SHOP = process.env.SHOPIFY_STORE_DOMAIN || 'bdd19a-3.myshopify.com'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN

const SINCE = '2026-05-20'
const UNTIL = '2026-05-28'
const SINCE_LY = '2025-05-20'
const UNTIL_LY = '2025-05-28'

async function shopFetch(path) {
  const r = await fetch(`https://${SHOP}/admin/api/2026-01${path}`, {
    headers: { 'X-Shopify-Access-Token': TOKEN }
  })
  return await r.json()
}

console.log(`\n=== ADD-TO-CART FUNNEL AUDIT (${SINCE} to ${UNTIL}) ===\n`)

// 1. Orders from Shopify
console.log('Pulling Shopify orders + abandoned checkouts...')
let allOrders = []
let pageInfo = null
let firstPage = true
while (firstPage || pageInfo) {
  firstPage = false
  const path = pageInfo
    ? `/orders.json?limit=250&page_info=${pageInfo}`
    : `/orders.json?limit=250&created_at_min=${SINCE}T00:00:00Z&created_at_max=${UNTIL}T23:59:59Z&status=any&financial_status=any`
  const r = await fetch(`https://${SHOP}/admin/api/2026-01${path}`, {
    headers: { 'X-Shopify-Access-Token': TOKEN },
  })
  const j = await r.json()
  allOrders = allOrders.concat(j.orders || [])
  const link = r.headers.get('link') || ''
  const next = link.match(/<[^>]*page_info=([^&>]+)[^>]*>;\s*rel="next"/)
  pageInfo = next?.[1] || null
  if (!pageInfo) break
}
console.log(`  Pulled ${allOrders.length} orders since ${SINCE}`)

// 2. Abandoned checkouts
const abandRes = await shopFetch(`/checkouts.json?limit=250&created_at_min=${SINCE}T00:00:00Z`)
const abandoned = abandRes.checkouts || []
console.log(`  Pulled ${abandoned.length} abandoned checkouts since ${SINCE}`)

// 3. Google Ads sessions/clicks
const adsClicks = await c.query(`
  SELECT segments.date, metrics.clicks, metrics.cost_micros, metrics.conversions
  FROM campaign
  WHERE segments.date BETWEEN '${SINCE}' AND '${UNTIL}'
    AND campaign.status != 'REMOVED'
`)
const byDay = new Map()
for (const r of adsClicks) {
  const d = r.segments?.date
  if (!byDay.has(d)) byDay.set(d, {paidClicks:0,paidSpend:0,paidConv:0,orders:0,revenue:0,refunds:0,abandonedCheckouts:0,abandonedValue:0})
  const x = byDay.get(d)
  x.paidClicks += Number(r.metrics?.clicks||0)
  x.paidSpend += Number(r.metrics?.cost_micros||0)/1e6
  x.paidConv += Number(r.metrics?.conversions||0)
}

// 4. Map orders to days
for (const o of allOrders) {
  const d = o.created_at?.slice(0,10)
  if (!byDay.has(d)) byDay.set(d, {paidClicks:0,paidSpend:0,paidConv:0,orders:0,revenue:0,refunds:0,abandonedCheckouts:0,abandonedValue:0})
  const x = byDay.get(d)
  x.orders++
  x.revenue += Number(o.total_price||0)
  if (o.financial_status === 'refunded' || o.cancelled_at) x.refunds++
}

// 5. Map abandoned checkouts
for (const a of abandoned) {
  const d = a.created_at?.slice(0,10)
  if (!byDay.has(d)) byDay.set(d, {paidClicks:0,paidSpend:0,paidConv:0,orders:0,revenue:0,refunds:0,abandonedCheckouts:0,abandonedValue:0})
  const x = byDay.get(d)
  x.abandonedCheckouts++
  x.abandonedValue += Number(a.total_price||0)
}

console.log('\n--- Daily funnel ---\n')
console.log('Date       | PaidClk | Orders | Revenue | CVR    | AvgOrder | AbandChks | AbandVal   | Cart→Buy Rate')
console.log('-'.repeat(120))
for (const [d,x] of [...byDay.entries()].sort()) {
  const cvr = x.paidClicks>0 ? (x.orders/x.paidClicks*100).toFixed(2)+'%' : '—'
  const aov = x.orders>0 ? '$'+(x.revenue/x.orders).toFixed(0) : '—'
  const totalCarts = x.abandonedCheckouts + x.orders
  const cartBuyRate = totalCarts>0 ? (x.orders/totalCarts*100).toFixed(1)+'%' : '—'
  console.log(`${d} | ${String(x.paidClicks).padStart(6)}  | ${String(x.orders).padStart(6)} | $${x.revenue.toFixed(0).padStart(6)} | ${cvr.padStart(6)} | ${aov.padStart(8)} | ${String(x.abandonedCheckouts).padStart(8)}  | $${x.abandonedValue.toFixed(0).padStart(7)}   | ${cartBuyRate}`)
}

// Aggregate
const tot = [...byDay.values()].reduce((a,x)=>({
  paidClicks: a.paidClicks+x.paidClicks,
  orders: a.orders+x.orders,
  revenue: a.revenue+x.revenue,
  abandonedCheckouts: a.abandonedCheckouts+x.abandonedCheckouts,
  abandonedValue: a.abandonedValue+x.abandonedValue,
  refunds: a.refunds+x.refunds,
}), {paidClicks:0,orders:0,revenue:0,abandonedCheckouts:0,abandonedValue:0,refunds:0})

console.log(`\n--- Week aggregate ---`)
console.log(`Paid clicks:         ${tot.paidClicks}`)
console.log(`Orders:              ${tot.orders}`)
console.log(`Revenue:             $${tot.revenue.toFixed(0)}`)
console.log(`Refunds/cancelled:   ${tot.refunds}`)
console.log(`Abandoned checkouts: ${tot.abandonedCheckouts}  (value $${tot.abandonedValue.toFixed(0)})`)
console.log(`Paid CVR:            ${(tot.orders/tot.paidClicks*100).toFixed(2)}%`)
console.log(`Cart→buy rate:       ${(tot.orders/(tot.orders+tot.abandonedCheckouts)*100).toFixed(1)}%`)
console.log(`Cart abandonment:    ${(tot.abandonedCheckouts/(tot.orders+tot.abandonedCheckouts)*100).toFixed(1)}%`)

// Last year same week
console.log('\n\n=== LAST YEAR SAME WEEK (2025-05-20 to 2025-05-28) ===')
const lyOrders = []
let lyPI = null, lyFirst = true
while (lyFirst || lyPI) {
  lyFirst = false
  const path = lyPI ? `/orders.json?limit=250&page_info=${lyPI}` : `/orders.json?limit=250&created_at_min=${SINCE_LY}T00:00:00Z&created_at_max=${UNTIL_LY}T23:59:59Z&status=any`
  const r = await fetch(`https://${SHOP}/admin/api/2026-01${path}`, { headers: { 'X-Shopify-Access-Token': TOKEN } })
  const j = await r.json()
  lyOrders.push(...(j.orders||[]))
  const link = r.headers.get('link')||''
  const next = link.match(/<[^>]*page_info=([^&>]+)[^>]*>;\s*rel="next"/)
  lyPI = next?.[1] || null
  if (!lyPI) break
}
let lyRev = 0
for (const o of lyOrders) lyRev += Number(o.total_price||0)
const lyAds = await c.query(`SELECT metrics.clicks FROM campaign WHERE segments.date BETWEEN '${SINCE_LY}' AND '${UNTIL_LY}'`)
let lyClicks = 0
for (const r of lyAds) lyClicks += Number(r.metrics?.clicks||0)

console.log(`2025 paid clicks:    ${lyClicks}`)
console.log(`2025 orders:         ${lyOrders.length}`)
console.log(`2025 revenue:        $${lyRev.toFixed(0)}`)
console.log(`2025 paid CVR:       ${(lyOrders.length/lyClicks*100).toFixed(2)}%`)
console.log(`2025 AOV:            $${lyOrders.length>0?(lyRev/lyOrders.length).toFixed(0):0}`)

console.log(`\n\n=== YoY COMPARISON ===`)
console.log(`                 | This week 2026 | Same week 2025 | Δ`)
console.log(`Paid clicks      | ${tot.paidClicks}            | ${lyClicks}             | ${(((tot.paidClicks-lyClicks)/lyClicks)*100).toFixed(0)}%`)
console.log(`Orders           | ${tot.orders}              | ${lyOrders.length}              | ${(((tot.orders-lyOrders.length)/lyOrders.length)*100).toFixed(0)}%`)
console.log(`Revenue          | $${tot.revenue.toFixed(0)}        | $${lyRev.toFixed(0)}        | ${(((tot.revenue-lyRev)/lyRev)*100).toFixed(0)}%`)
console.log(`Paid CVR         | ${(tot.orders/tot.paidClicks*100).toFixed(2)}%        | ${(lyOrders.length/lyClicks*100).toFixed(2)}%         |`)
console.log(`AOV              | $${tot.orders>0?(tot.revenue/tot.orders).toFixed(0):0}             | $${lyOrders.length>0?(lyRev/lyOrders.length).toFixed(0):0}             |`)

process.exit(0)
