/**
 * Bundle feed + inventory health check
 *  1. Find all "bundle" products in Shopify (by title/tag/handle/collection)
 *  2. Check status + inventory + published state
 *  3. Cross-check with Google Ads shopping_performance_view → last 7d perf per SKU
 *  4. Flag any disapproved / out of stock / unpublished items in the bundles
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'

const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const REST = 'https://bdd19a-3.myshopify.com/admin/api/2026-01'
async function rest(p){const r=await fetch(`${REST}${p}`,{headers:{'X-Shopify-Access-Token':TOKEN}});return r.json()}

console.log('\n=== BUNDLE FEED CHECK ===\n')

// 1. Find bundle products by title or handle
console.log('Step 1: scanning Shopify for bundle products...\n')
const all = []
let pageInfo = ''
let page = 1
while (true) {
  const url = `/products.json?limit=250${pageInfo}`
  const res = await rest(url)
  if (!res.products) break
  all.push(...res.products)
  if (res.products.length < 250) break
  pageInfo = `&page_info=${encodeURIComponent(res.products[res.products.length-1].id)}`
  page++
  if (page>5) break
}

const bundles = all.filter(p => {
  const txt = `${p.title} ${p.handle} ${p.product_type} ${(p.tags||'').toLowerCase()}`.toLowerCase()
  return /bundle|pack|combo|kit|2x|2 pack|3 pack|4 pack/i.test(txt)
})

console.log(`Total Shopify products: ${all.length}`)
console.log(`Bundle/pack/kit products identified: ${bundles.length}\n`)

// 2. Health check each bundle
console.log('Step 2: bundle health check\n')
console.log('Status | Inv  | Title                                                | Issues')
console.log('-'.repeat(120))
const issues = { unpublished:0, outOfStock:0, archived:0, lowStock:0, healthy:0 }
const bundleSkus = []
for (const p of bundles) {
  const status = p.status // active | draft | archived
  const published = !!p.published_at
  const totalInv = (p.variants||[]).reduce((s,v) => s + (v.inventory_quantity ?? 0), 0)
  const inStockVariants = (p.variants||[]).filter(v => (v.inventory_quantity ?? 0) > 0).length
  const totalVariants = (p.variants||[]).length
  const variantsWithSku = (p.variants||[]).filter(v => v.sku).length

  const problems = []
  if (status === 'archived') { problems.push('ARCHIVED'); issues.archived++ }
  if (status === 'draft') { problems.push('DRAFT'); issues.unpublished++ }
  if (!published) problems.push('NOT-PUBLISHED')
  if (totalInv === 0) { problems.push('OUT-OF-STOCK'); issues.outOfStock++ }
  else if (totalInv < 10) { problems.push(`LOW-STOCK(${totalInv})`); issues.lowStock++ }
  if (inStockVariants === 0 && totalVariants > 0) problems.push('NO-VARIANT-IN-STOCK')
  if (problems.length === 0) issues.healthy++

  const statusIcon = problems.length === 0 ? '🟢' : problems.includes('OUT-OF-STOCK')||problems.includes('ARCHIVED') ? '🔴' : '🟡'
  console.log(`${statusIcon} ${status.padEnd(4)} | ${String(totalInv).padStart(4)} | ${p.title.slice(0,52).padEnd(52)} | ${problems.join(', ')}`)

  // Collect SKUs for Google Ads cross-check
  for (const v of (p.variants||[])) {
    if (v.sku) bundleSkus.push({ sku: v.sku, productTitle: p.title, variantTitle: v.title, qty: v.inventory_quantity ?? 0, status })
  }
}

console.log(`\nSUMMARY:`)
console.log(`  🟢 Healthy:           ${issues.healthy}`)
console.log(`  🟡 Low stock (<10):   ${issues.lowStock}`)
console.log(`  🔴 Out of stock:      ${issues.outOfStock}`)
console.log(`  🔴 Archived:          ${issues.archived}`)
console.log(`  🟡 Draft/unpublished: ${issues.unpublished}`)

// 3. Cross-check Google Ads — what bundle SKUs got Shopping impressions last 7 days?
console.log(`\nStep 3: Google Ads shopping_performance_view (last 7d) — SKU-level perf\n`)
const customer = getGadsCustomer()
try {
  const rows = await customer.query(`
    SELECT segments.product_item_id, segments.product_title,
           metrics.impressions, metrics.clicks, metrics.cost_micros,
           metrics.conversions, metrics.conversions_value
    FROM shopping_performance_view
    WHERE segments.date DURING LAST_7_DAYS
  `)
  // Aggregate by product
  const byProd = new Map()
  for (const r of rows) {
    const id = r.segments?.product_item_id || ''
    const title = r.segments?.product_title || ''
    const k = id + '|' + title
    if (!byProd.has(k)) byProd.set(k, { id, title, imp:0, clk:0, spend:0, conv:0, value:0 })
    const x = byProd.get(k)
    x.imp += Number(r.metrics?.impressions||0)
    x.clk += Number(r.metrics?.clicks||0)
    x.spend += Number(r.metrics?.cost_micros||0)/1e6
    x.conv += Number(r.metrics?.conversions||0)
    x.value += Number(r.metrics?.conversions_value||0)
  }
  // Filter to bundles
  const bundleResults = [...byProd.values()].filter(p => /bundle|pack|combo|kit|2x|2 pack|3 pack|4 pack/i.test(p.title))
  bundleResults.sort((a,b) => b.spend - a.spend)
  console.log(`Found ${bundleResults.length} bundle products with Shopping data (last 7d):\n`)
  console.log('Spend  | Imp  | Clk | Conv | Rev    | ROAS  | Title')
  console.log('-'.repeat(120))
  for (const p of bundleResults.slice(0,30)) {
    const roas = p.spend>0 ? (p.value/p.spend).toFixed(2)+'x' : '—'
    console.log(`$${p.spend.toFixed(0).padStart(4)} | ${String(p.imp).padStart(4)} | ${String(p.clk).padStart(3)} | ${p.conv.toFixed(1).padStart(4)} | $${p.value.toFixed(0).padStart(5)} | ${roas.padStart(5)} | ${p.title.slice(0,65)}`)
  }
  const bundleSpend = bundleResults.reduce((s,p)=>s+p.spend,0)
  const bundleRev = bundleResults.reduce((s,p)=>s+p.value,0)
  console.log(`\nBundle TOTAL 7d: $${bundleSpend.toFixed(0)} spend → $${bundleRev.toFixed(0)} revenue → ${bundleSpend>0?(bundleRev/bundleSpend).toFixed(2)+'x':'—'} ROAS`)
  console.log(`Zero-impression bundles (in Shopify but not appearing): ${bundles.length - bundleResults.length} of ${bundles.length}`)
} catch(e) {
  console.log('Google Ads query failed:', e.errors?.[0]?.message || e.message)
}

process.exit(0)
