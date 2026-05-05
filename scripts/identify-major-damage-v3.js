/**
 * v3: Identify products that DROVE THE BUSINESS pre-surgery and have bloated SEO titles.
 * Match by base product title in Shopping data, sum across all variants AND new bloated versions.
 * Rank by pre-surgery REVENUE contribution.
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

// Match strategy: for each Shopify product, build a base-key from its product title,
// then sum all Shopping title rows that START WITH the base title
function buildBaseKey(t) {
  return t.replace(/[🎉💥💨]/g, '').trim().toLowerCase()
}
function sumStartsWith(map, baseKey) {
  let imp = 0, clk = 0, conv = 0, val = 0, spend = 0
  for (const [t, d] of map) {
    if (t.toLowerCase().startsWith(baseKey)) {
      imp += d.imp; clk += d.clk; conv += d.conv; val += d.val; spend += d.spend
    }
  }
  return { imp, clk, conv, val, spend }
}

const results = []
for (const p of damagedSeo) {
  const baseKey = buildBaseKey(p.title)
  const a = sumStartsWith(pre, baseKey)
  const b = sumStartsWith(post, baseKey)

  results.push({
    id: p.id,
    title: p.title,
    currentSeoTitle: p.seo.title,
    currentProductType: p.productType,
    preSpend: Math.round(a.spend),
    preVal: Math.round(a.val),
    preConv: a.conv,
    preRoas: a.spend > 0 ? a.val/a.spend : 0,
    preImpDay: Math.round(a.imp / preDays),
    postSpend: Math.round(b.spend),
    postVal: Math.round(b.val),
    postConv: b.conv,
    postRoas: b.spend > 0 ? b.val/b.spend : 0,
    postImpDay: Math.round(b.imp / postDays),
    valChange: Math.round((b.val/postDays*preDays) - a.val), // normalised projected loss
    convChange: (b.conv/postDays*preDays) - a.conv,
    roasChange: (b.spend > 0 ? b.val/b.spend : 0) - (a.spend > 0 ? a.val/a.spend : 0),
  })
}

// Filter: products that contributed significantly pre-surgery AND took damage
// Major damage = pre revenue ≥ $50 AND (ROAS dropped ≥ 0.5 OR conversions dropped ≥ 30%)
const majorDamage = results.filter(r => {
  if (r.preVal < 50) return false // tiny products skip
  const convDropPct = r.preConv > 0 ? ((r.postConv/postDays*preDays - r.preConv)/r.preConv)*100 : 0
  const roasDrop = r.preRoas - r.postRoas
  return convDropPct <= -30 || roasDrop >= 0.5
})

majorDamage.sort((a, b) => b.preVal - a.preVal)

console.log(`\n=== MAJOR DAMAGE PRODUCTS (${majorDamage.length} of ${damagedSeo.length} bloated) ===`)
console.log(`Filter: pre revenue ≥ $50 AND (ROAS drop ≥ 0.5x OR conv drop ≥ 30%)\n`)
console.log(`  ${'Product'.padEnd(48)} | Pre Rev | Pre→Post ROAS | Pre→Post Conv (norm)`)
console.log(`  ${'-'.repeat(48)} | ------- | ------------- | --------------------`)
for (const r of majorDamage) {
  const projConvLoss = r.postConv / postDays * preDays
  console.log(`  ${r.title.substring(0, 47).padEnd(48)} | $${String(r.preVal).padStart(5)} | ${r.preRoas.toFixed(2)}x → ${r.postRoas.toFixed(2)}x | ${r.preConv.toFixed(1)} → ${projConvLoss.toFixed(1)}`)
}

writeFileSync('./data/snapshots/major-damage-products.json', JSON.stringify(majorDamage, null, 2))
console.log(`\n✅ Saved: data/snapshots/major-damage-products.json (${majorDamage.length} products)`)
process.exit(0)
