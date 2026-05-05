/**
 * Identify products with MAJOR DAMAGE from Apr 14 surgery.
 * Criteria:
 *   - SEO title has the bloat pattern (we changed it)
 *   - PRE-surgery: ≥30 impressions/day on Google Shopping
 *   - POST-surgery: impressions/day dropped ≥40%
 * Output: data/snapshots/major-damage-products.json
 */
import 'dotenv/config'
import { readFileSync, writeFileSync } from 'fs'
import { getGadsCustomer } from '../server/lib/gads-client.js'

const customer = getGadsCustomer()
const snapshot = JSON.parse(readFileSync('./data/snapshots/shopify-snapshot-2026-04-27.json', 'utf8'))

// Step 1: damaged SEO list
const damagedSeo = snapshot.filter(p => {
  const t = p.seo?.title || ''
  if (!t || t === p.title) return false
  return (
    t.includes(' Australia |') ||
    t.endsWith(' Australia') ||
    t.includes('Pink Blue Holi Powder Australia') ||
    t.includes('Holi Colour Australia') ||
    t.includes('| Party Supplies Australia') ||
    t.includes('| Colour Powder Cannon Australia')
  )
})
console.log(`Damaged SEO products: ${damagedSeo.length}`)

// Step 2: pull Shopping performance pre vs post Apr 14
const fmt = (d) => d.toISOString().slice(0, 10)
const today = new Date()
const daysAgo = (n) => { const d = new Date(today); d.setDate(d.getDate() - n); return fmt(d) }

const preStart = daysAgo(60), preEnd = '2026-04-13', postStart = '2026-04-14', postEnd = daysAgo(1)
const preDays = 44, postDays = 13

async function pullShopping(start, end) {
  const rows = await customer.query(`
    SELECT segments.product_item_id, segments.product_title,
      metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value, metrics.cost_micros
    FROM shopping_performance_view
    WHERE segments.date BETWEEN '${start}' AND '${end}'
  `)
  // Aggregate by item id
  const m = new Map()
  for (const r of rows) {
    const id = r.segments?.product_item_id
    if (!id) continue
    const cur = m.get(id) || { title: r.segments?.product_title, imp: 0, clk: 0, conv: 0, val: 0, spend: 0 }
    cur.imp += Number(r.metrics?.impressions || 0)
    cur.clk += Number(r.metrics?.clicks || 0)
    cur.conv += Number(r.metrics?.conversions || 0)
    cur.val += Number(r.metrics?.conversions_value || 0)
    cur.spend += Number(r.metrics?.cost_micros || 0) / 1e6
    m.set(id, cur)
  }
  return m
}

const [pre, post] = await Promise.all([
  pullShopping(preStart, preEnd),
  pullShopping(postStart, postEnd),
])

// Step 3: match Shopify product handle/id to Shopping item_id
// Item id in Merchant Centre is usually "shopify_AU_<productId>_<variantId>"
// We'll match by title containment as fallback
const numericId = (gid) => gid?.split('/').pop()

const damaged = []
for (const p of damagedSeo) {
  const pid = numericId(p.id)
  // Sum across all variants whose item_id contains the product id
  let preImp = 0, preConv = 0, preVal = 0, preSpend = 0
  let postImp = 0, postConv = 0, postVal = 0, postSpend = 0
  for (const [iid, d] of pre) {
    if (iid.includes(pid)) {
      preImp += d.imp; preConv += d.conv; preVal += d.val; preSpend += d.spend
    }
  }
  for (const [iid, d] of post) {
    if (iid.includes(pid)) {
      postImp += d.imp; postConv += d.conv; postVal += d.val; postSpend += d.spend
    }
  }
  const preImpDay = preImp / preDays
  const postImpDay = postImp / postDays
  const dropPct = preImpDay > 0 ? ((postImpDay - preImpDay) / preImpDay) * 100 : 0

  // MAJOR DAMAGE = pre had ≥30 imp/day AND drop ≥40%
  if (preImpDay >= 30 && dropPct <= -40) {
    damaged.push({
      id: p.id,
      title: p.title,
      currentSeoTitle: p.seo?.title,
      currentProductType: p.productType,
      preImpDay: Math.round(preImpDay),
      postImpDay: Math.round(postImpDay),
      dropPct: Math.round(dropPct),
      preConv: preConv.toFixed(1),
      postConv: postConv.toFixed(1),
      preSpend: Math.round(preSpend),
      postSpend: Math.round(postSpend),
      preRoas: preSpend > 0 ? (preVal/preSpend).toFixed(2) : '-',
      postRoas: postSpend > 0 ? (postVal/postSpend).toFixed(2) : '-',
    })
  }
}

damaged.sort((a, b) => b.preImpDay - a.preImpDay)

console.log(`\n=== MAJOR DAMAGE PRODUCTS (${damaged.length}) ===\n`)
console.log('  Sorted by pre-surgery impressions/day\n')
for (const d of damaged) {
  console.log(`  ${d.title.substring(0, 50).padEnd(51)} | ${d.preImpDay}/d → ${d.postImpDay}/d (${d.dropPct}%) | ${d.preConv} → ${d.postConv} conv | ROAS ${d.preRoas}x → ${d.postRoas}x`)
}

writeFileSync('./data/snapshots/major-damage-products.json', JSON.stringify(damaged, null, 2))
console.log(`\n✅ Saved: data/snapshots/major-damage-products.json`)
console.log(`Total to revert: ${damaged.length}`)
process.exit(0)
