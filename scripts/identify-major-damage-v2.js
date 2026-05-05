/**
 * v2: Match Shopping performance to Shopify products by TITLE.
 * Pre-surgery Shopping title ≈ Shopify product.title
 * Post-surgery Shopping title ≈ Shopify product.seo.title (the bloated one)
 */
import 'dotenv/config'
import { readFileSync, writeFileSync } from 'fs'
import { getGadsCustomer } from '../server/lib/gads-client.js'

const customer = getGadsCustomer()
const snapshot = JSON.parse(readFileSync('./data/snapshots/shopify-snapshot-2026-04-27.json', 'utf8'))

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

const fmt = (d) => d.toISOString().slice(0, 10)
const today = new Date()
const daysAgo = (n) => { const d = new Date(today); d.setDate(d.getDate() - n); return fmt(d) }
const preStart = daysAgo(60), preEnd = '2026-04-13', postStart = '2026-04-14', postEnd = daysAgo(1)
const preDays = 44, postDays = 13

async function pullShopping(start, end) {
  const rows = await customer.query(`
    SELECT segments.product_title,
      metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value, metrics.cost_micros
    FROM shopping_performance_view
    WHERE segments.date BETWEEN '${start}' AND '${end}'
  `)
  const m = new Map()
  for (const r of rows) {
    const t = (r.segments?.product_title || '').trim()
    if (!t) continue
    const cur = m.get(t) || { imp: 0, clk: 0, conv: 0, val: 0, spend: 0 }
    cur.imp += Number(r.metrics?.impressions || 0)
    cur.clk += Number(r.metrics?.clicks || 0)
    cur.conv += Number(r.metrics?.conversions || 0)
    cur.val += Number(r.metrics?.conversions_value || 0)
    cur.spend += Number(r.metrics?.cost_micros || 0) / 1e6
    m.set(t, cur)
  }
  return m
}

const [pre, post] = await Promise.all([pullShopping(preStart, preEnd), pullShopping(postStart, postEnd)])
console.log(`Pre titles: ${pre.size} | Post titles: ${post.size}\n`)

// For each damaged Shopify product, sum impressions matching its product.title (pre)
// and its seo.title (post). Match by title containment (variant titles include base).
function sumMatching(map, baseTitle) {
  let imp = 0, clk = 0, conv = 0, val = 0, spend = 0
  const lc = baseTitle.toLowerCase().slice(0, 40) // first 40 chars unique enough
  for (const [t, d] of map) {
    if (t.toLowerCase().includes(lc)) {
      imp += d.imp; clk += d.clk; conv += d.conv; val += d.val; spend += d.spend
    }
  }
  return { imp, clk, conv, val, spend }
}

const damaged = []
for (const p of damagedSeo) {
  const cleanTitle = p.title.replace(/[🎉💥💨]/g, '').trim()
  const seoTitle = p.seo.title

  const preData = sumMatching(pre, cleanTitle)
  // Post: match against either the bloated SEO title OR the original (in case some old variants still showed)
  const postFromBloated = sumMatching(post, seoTitle.slice(0, 40))
  const postFromOriginal = sumMatching(post, cleanTitle)
  // Combine but de-dupe by taking max (titles overlap)
  const post_ = {
    imp: Math.max(postFromBloated.imp, postFromOriginal.imp) === postFromBloated.imp ? postFromBloated.imp + (postFromOriginal.imp > postFromBloated.imp ? 0 : 0) : postFromOriginal.imp,
    spend: postFromBloated.spend + postFromOriginal.spend,
    conv: postFromBloated.conv + postFromOriginal.conv,
    val: postFromBloated.val + postFromOriginal.val,
  }
  // Simpler: just take the post that came from original (most accurate when bloated SEO title contains original)
  const postBest = postFromOriginal.imp >= postFromBloated.imp ? postFromOriginal : postFromBloated

  const preImpDay = preData.imp / preDays
  const postImpDay = postBest.imp / postDays
  const dropPct = preImpDay > 0 ? ((postImpDay - preImpDay) / preImpDay) * 100 : 0

  if (preImpDay >= 20 && dropPct <= -30) {
    damaged.push({
      id: p.id,
      title: p.title,
      currentSeoTitle: p.seo?.title,
      currentProductType: p.productType,
      preImpDay: Math.round(preImpDay),
      postImpDay: Math.round(postImpDay),
      dropPct: Math.round(dropPct),
      preConv: preData.conv.toFixed(1),
      postConv: postBest.conv.toFixed(1),
      preSpend: Math.round(preData.spend),
      postSpend: Math.round(postBest.spend),
      preRoas: preData.spend > 0 ? (preData.val/preData.spend).toFixed(2) : '-',
      postRoas: postBest.spend > 0 ? (postBest.val/postBest.spend).toFixed(2) : '-',
    })
  }
}

damaged.sort((a, b) => b.preImpDay - a.preImpDay)

console.log(`=== MAJOR DAMAGE PRODUCTS (${damaged.length}) ===`)
console.log(`Filter: pre-surgery ≥20 imp/day AND drop ≥30%\n`)
for (const d of damaged) {
  console.log(`  ${d.title.substring(0, 48).padEnd(49)} | ${String(d.preImpDay).padStart(4)}/d → ${String(d.postImpDay).padStart(3)}/d (${d.dropPct}%) | ${d.preConv}→${d.postConv} conv | $${d.preSpend} → $${d.postSpend} | ROAS ${d.preRoas}x→${d.postRoas}x`)
}

writeFileSync('./data/snapshots/major-damage-products.json', JSON.stringify(damaged, null, 2))
console.log(`\n✅ Saved: data/snapshots/major-damage-products.json (${damaged.length} products)`)
process.exit(0)
