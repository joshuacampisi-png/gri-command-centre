/**
 * GMC DISAPPROVAL AUDIT (via Google Ads + Shopify)
 *
 * Can't directly query Content API disapproval reasons without that scope,
 * but we CAN identify products that:
 *  a) Have low/no Shopping impressions despite being in feed (likely disapproved/limited)
 *  b) Are out-of-stock in Shopify but might still be in GMC
 *  c) Have missing essential GMC attributes
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const c = getGadsCustomer()
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const URL = 'https://bdd19a-3.myshopify.com/admin/api/2026-01/graphql.json'
async function gql(q,v){const r=await fetch(URL,{method:'POST',headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query:q,variables:v})});return r.json()}

const end = new Date().toISOString().slice(0,10)
const start = new Date(Date.now()-30*86400000).toISOString().slice(0,10)

console.log(`\n=== GMC FEED HEALTH AUDIT ===\n`)

// 1. Pull ALL Shopify products
const prods = []
let cursor = null
for (let i=0; i<10; i++) {
  const r = await gql(`{
    products(first:250 ${cursor?`,after:"${cursor}"`:''}, query:"status:active") {
      edges { cursor node { id title handle status totalInventory variants(first:1){edges{node{availableForSale price}}} } }
      pageInfo { hasNextPage }
    }
  }`)
  const edges = r.data?.products?.edges||[]
  for (const e of edges) prods.push(e.node)
  if (!r.data?.products?.pageInfo?.hasNextPage) break
  cursor = edges[edges.length-1].cursor
}
console.log(`Total active Shopify products: ${prods.length}`)

// 2. Pull all SKUs served from PMAX Shopping in last 30d
const served = await c.query(`SELECT campaign.id, segments.product_item_id, metrics.impressions FROM shopping_performance_view WHERE segments.date BETWEEN '${start}' AND '${end}'`)
const servedMap = new Map()
for (const r of served) {
  const id = r.segments?.productItemId || r.segments?.product_item_id || ''
  // Extract Shopify product id from shopify_au_{productId}_{variantId}
  const match = id.match(/shopify_au_(\d+)/)
  if (match) {
    const pid = match[1]
    servedMap.set(pid, (servedMap.get(pid)||0) + Number(r.metrics?.impressions||0))
  }
}
console.log(`Total unique Shopify product IDs served in PMAX (30d): ${servedMap.size}`)

// 3. Cross-reference
const inFeedButNotServing = []
const outOfStockButActive = []
for (const p of prods) {
  const pid = p.id.split('/').pop()
  const imp = servedMap.get(pid) || 0
  const inv = p.totalInventory
  const available = p.variants?.edges?.[0]?.node?.availableForSale
  const price = parseFloat(p.variants?.edges?.[0]?.node?.price||'0')

  if (imp === 0) inFeedButNotServing.push({ ...p, pid, imp, inv, available, price })
  if (!available || (inv != null && inv <= 0)) outOfStockButActive.push({ ...p, pid, imp, inv, available })
}

console.log(`\n=== PRODUCTS NOT SERVING IN PMAX (30d) ===`)
console.log(`Total: ${inFeedButNotServing.length} of ${prods.length} active Shopify products`)
console.log(`(These are likely: out-of-stock, GMC disapproved, or PMAX algorithm filtered)\n`)
console.log('Title                                     | Inv | Price  | Available')
console.log('------------------------------------------+-----+--------+----------')
// Show top 30 by alphabetical
const sorted = inFeedButNotServing.slice(0, 30)
for (const p of sorted) {
  console.log(`${(p.title||'').slice(0,40).padEnd(40)} | ${String(p.inv||'?').padStart(3)} | $${p.price.toFixed(0).padStart(5)} | ${p.available?'YES':'no'}`)
}

console.log(`\n=== ACTIVE PRODUCTS THAT ARE OUT-OF-STOCK (should be removed from feed) ===`)
console.log(`Total: ${outOfStockButActive.length}`)
for (const p of outOfStockButActive.slice(0, 15)) {
  console.log(`  ${p.title?.slice(0,55)} (inv: ${p.inv})`)
}

console.log(`\n=== SUMMARY ===`)
console.log(`✓ Serving: ${servedMap.size} products`)
console.log(`⚠ Not serving (likely disapproved/filtered/OOS): ${inFeedButNotServing.length}`)
console.log(`🚨 Active but OOS (eating feed slots): ${outOfStockButActive.length}`)
console.log(`\nNote: For exact disapproval reasons, check Merchant Center → Products → Disapproved (requires manual UI access)`)
process.exit(0)
