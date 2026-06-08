/**
 * GMC SERVING-STATUS AUDIT — read-only, ship nothing
 *
 * For each of the 4 head queries, identify:
 *  - Which of our SKUs served in Shopping last 30d (impressions, clicks, cost, conv, ROAS)
 *  - Which SKUs SHOULD match the query but got 0 impressions (the gap)
 *  - Per-query top SKUs ranked by impression share proxy
 *  - Feed-level signals: missing GTIN, product_type, custom labels
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'

const c = getGadsCustomer()
const fmt = d => d.toISOString().slice(0,10)
const end = fmt(new Date(Date.now()-86400000))
const start = fmt(new Date(Date.now()-30*86400000))

const HEAD_QUERIES = ['gender reveal ideas','gender reveal smoke bomb','gender reveal cannon','gender reveal extinguisher']

// 1. All SKUs that served in Shopping last 30d
console.log(`\n========== SHOPPING SERVING AUDIT (${start} → ${end}) ==========\n`)
const skuRows = await c.query(`
  SELECT segments.product_item_id, segments.product_title,
         metrics.impressions, metrics.clicks, metrics.cost_micros,
         metrics.conversions, metrics.conversions_value
  FROM shopping_performance_view
  WHERE segments.date BETWEEN '${start}' AND '${end}'
`)
const skuMap = new Map()
for (const r of skuRows) {
  const id = r.segments?.productItemId || r.segments?.product_item_id || 'unknown'
  const title = r.segments?.productTitle || r.segments?.product_title || ''
  const cur = skuMap.get(id) || { id, title, imp:0, clk:0, sp:0, conv:0, val:0 }
  cur.imp += Number(r.metrics?.impressions||0)
  cur.clk += Number(r.metrics?.clicks||0)
  cur.sp  += Number(r.metrics?.cost_micros||0)/1e6
  cur.conv+= Number(r.metrics?.conversions||0)
  cur.val += Number(r.metrics?.conversions_value||0)
  if (!cur.title && title) cur.title = title
  skuMap.set(id, cur)
}
const allSkus = [...skuMap.values()].sort((a,b)=>b.imp-a.imp)
console.log(`Total SKUs that served in Shopping (30d): ${allSkus.length}`)
console.log(`Total Shopping impressions: ${allSkus.reduce((s,x)=>s+x.imp,0).toLocaleString()}`)
console.log(`Total Shopping spend: $${allSkus.reduce((s,x)=>s+x.sp,0).toFixed(0)}`)
console.log(`Total Shopping revenue: $${allSkus.reduce((s,x)=>s+x.val,0).toFixed(0)}`)

// 2. Per-query serving breakdown via search_term_view + product segmentation
console.log(`\n========== PER-QUERY SKU SERVING ==========`)
for (const q of HEAD_QUERIES) {
  console.log(`\n--- "${q}" ---`)
  try {
    const rows = await c.query(`
      SELECT search_term_view.search_term, segments.product_item_id,
             metrics.impressions, metrics.clicks, metrics.cost_micros,
             metrics.conversions, metrics.conversions_value
      FROM search_term_view
      WHERE segments.date BETWEEN '${start}' AND '${end}'
        AND search_term_view.search_term = '${q}'
    `)
    const byProduct = new Map()
    for (const r of rows) {
      const id = r.segments?.productItemId || r.segments?.product_item_id || 'TEXT_AD'
      const cur = byProduct.get(id) || { imp:0, clk:0, sp:0, conv:0, val:0 }
      cur.imp += Number(r.metrics?.impressions||0)
      cur.clk += Number(r.metrics?.clicks||0)
      cur.sp  += Number(r.metrics?.cost_micros||0)/1e6
      cur.conv+= Number(r.metrics?.conversions||0)
      cur.val += Number(r.metrics?.conversions_value||0)
      byProduct.set(id, cur)
    }
    if (!byProduct.size) { console.log('  (no data — query may flow through PMAX which hides search terms)'); continue }
    console.log(`  SKUs served on this query: ${byProduct.size}`)
    for (const [id,x] of [...byProduct.entries()].sort((a,b)=>b[1].imp-a[1].imp).slice(0,10)) {
      const title = (skuMap.get(id)?.title || id).slice(0,55)
      const roas = x.sp ? (x.val/x.sp).toFixed(1) : '-'
      console.log(`    ${String(x.imp).padStart(5)}imp ${String(x.clk).padStart(3)}clk $${x.sp.toFixed(0).padStart(3)} ${roas}x | ${title}`)
    }
  } catch (e) { console.log(`  ERROR: ${e.message?.slice(0,80)}`) }
}

// 3. PMAX-aggregated search themes (asset_group_view doesn't expose terms but we can pull PMAX Shopping spend by product)
console.log(`\n========== PMAX SHOPPING TOP SKUs (30d) ==========`)
for (const x of allSkus.slice(0,25)) {
  const roas = x.sp ? (x.val/x.sp).toFixed(2) : '-'
  const cvr = x.clk ? (x.conv/x.clk*100).toFixed(1) : '-'
  console.log(`  ${String(x.imp).padStart(6)}imp ${String(x.clk).padStart(4)}clk ${cvr.padStart(4)}%CVR $${x.sp.toFixed(0).padStart(4)} ${roas.padStart(4)}x | ${x.id.slice(0,15).padEnd(15)} ${(x.title||'').slice(0,55)}`)
}

// 4. ZERO-impression SKUs (potential eligibility gap)
console.log(`\n========== HIGH-IMPRESSION vs ZERO-IMPRESSION CHECK ==========`)
console.log(`SKUs with 0 impressions in 30d but in catalog = potential feed disapproval / low feed quality`)
console.log(`(Would need GMC Content API to confirm exact disapproval reasons — Google Ads API can't see Merchant Center status directly)`)
const lowImp = allSkus.filter(s => s.imp < 10).length
console.log(`SKUs with <10 impressions (30d): ${lowImp} of ${allSkus.length}`)

process.exit(0)
