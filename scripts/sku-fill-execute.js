/**
 * SKU FILL — Generate SKUs for variants currently missing them.
 *
 * Format: GRI-{productId}-{variantIdSuffix4}
 * Example: GRI-7512867831897-2138
 *
 * Per Brian (Judge.me support): "Add SKUs to your products. Then we will use
 * those SKUs and convert them to MPN" — fixes STRONG_IDS_NOT_PRESENT blocking
 * 1,361 reviews from matching products in Google's review aggregation system.
 *
 * Touches: ONLY variants with empty SKU field. Existing SKUs left untouched.
 * Side effects: None visible to customers. SKU is backend-only.
 *
 * Snapshot saved before execution. Rollback script: sku-fill-rollback.js.
 *
 * Run: node scripts/sku-fill-execute.js
 */
import 'dotenv/config'
import { writeFileSync, mkdirSync } from 'fs'

const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN || process.env.SHOPIFY_TOKEN
const URL = 'https://bdd19a-3.myshopify.com/admin/api/2026-01/graphql.json'

async function gql(query, variables = {}) {
  const r = await fetch(URL, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  return r.json()
}

mkdirSync('data/snapshots/sku-fill', { recursive: true })

console.log(`\n========== SKU FILL — ${new Date().toISOString().slice(0, 19)} ==========\n`)

// === STEP 1: snapshot all variants ===
console.log('--- STEP 1: SNAPSHOT ALL VARIANTS ---')
let after = null
const products = []
while (true) {
  const q = `{ products(first: 100, query: "status:active"${after ? `, after: "${after}"` : ''}) {
    edges { cursor node { id title handle status
      variants(first: 100) { edges { node { id title sku } } }
    } }
    pageInfo { hasNextPage }
  } }`
  const r = await gql(q)
  const edges = r.data?.products?.edges || []
  for (const e of edges) {
    const p = e.node
    products.push({
      id: p.id.replace('gid://shopify/Product/', ''),
      title: p.title,
      handle: p.handle,
      variants: (p.variants?.edges || []).map(v => ({
        id: v.node.id.replace('gid://shopify/ProductVariant/', ''),
        gidVariant: v.node.id,
        title: v.node.title,
        sku: v.node.sku || '',
      })),
    })
  }
  if (!r.data?.products?.pageInfo?.hasNextPage) break
  after = edges[edges.length - 1]?.cursor
}

// Find variants missing SKU
const updates = [] // [{productGid, variants:[{id, sku}]}]
const snapshot = { takenAt: new Date().toISOString(), products }
let missingCount = 0
for (const p of products) {
  const missing = p.variants.filter(v => !v.sku || v.sku.trim() === '')
  if (missing.length === 0) continue
  const variantUpdates = missing.map(v => {
    const suffix = v.id.slice(-4) // last 4 digits of variant ID
    return { id: v.gidVariant, sku: `GRI-${p.id}-${suffix}` }
  })
  updates.push({ productGid: `gid://shopify/Product/${p.id}`, productTitle: p.title, variants: variantUpdates })
  missingCount += variantUpdates.length
}
writeFileSync('data/snapshots/sku-fill/snapshot-2026-05-14.json', JSON.stringify(snapshot, null, 2))
console.log(`✓ Snapshotted ${products.length} products, ${products.reduce((s, p) => s + p.variants.length, 0)} variants`)
console.log(`✓ ${updates.length} products need updates (${missingCount} variants missing SKU)\n`)

// === STEP 2: bulk update SKUs ===
console.log('--- STEP 2: BULK UPDATE SKUs ---')
const mutation = `mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
  productVariantsBulkUpdate(productId: $productId, variants: $variants) {
    productVariants { id sku }
    userErrors { field message }
  }
}`

const executionLog = { ranAt: new Date().toISOString(), results: [], totalUpdated: 0, totalErrors: 0 }

let i = 0
for (const u of updates) {
  i++
  const r = await gql(mutation, {
    productId: u.productGid,
    variants: u.variants.map(v => ({ id: v.id, inventoryItem: { sku: v.sku } })),
  })
  const errors = r.data?.productVariantsBulkUpdate?.userErrors || []
  const success = r.data?.productVariantsBulkUpdate?.productVariants || []
  if (errors.length) {
    executionLog.results.push({ productGid: u.productGid, title: u.productTitle, status: 'ERROR', errors, attempted: u.variants })
    executionLog.totalErrors += u.variants.length
    console.log(`  ✗ [${i}/${updates.length}] ${u.productTitle?.slice(0, 50)} — ${JSON.stringify(errors).slice(0, 200)}`)
  } else {
    executionLog.results.push({ productGid: u.productGid, title: u.productTitle, status: 'OK', updated: success.length })
    executionLog.totalUpdated += success.length
    if (i % 10 === 0 || i === updates.length) console.log(`  ✓ [${i}/${updates.length}] ${u.productTitle?.slice(0, 45)} (${success.length} variants)`)
  }
  await new Promise(r => setTimeout(r, 250))
}

writeFileSync('data/snapshots/sku-fill/execution-log-2026-05-14.json', JSON.stringify(executionLog, null, 2))

// === STEP 3: verify ===
console.log('\n--- STEP 3: VERIFY ---')
let verifyAfter = null
let totalVariants = 0
let withSku = 0
let withoutSku = 0
while (true) {
  const q = `{ products(first: 100, query: "status:active"${verifyAfter ? `, after: "${verifyAfter}"` : ''}) {
    edges { cursor node { id variants(first: 100) { edges { node { sku } } } } }
    pageInfo { hasNextPage }
  } }`
  const r = await gql(q)
  const edges = r.data?.products?.edges || []
  for (const e of edges) {
    for (const v of (e.node.variants?.edges || [])) {
      totalVariants++
      if (v.node.sku && v.node.sku.trim() !== '') withSku++
      else withoutSku++
    }
  }
  if (!r.data?.products?.pageInfo?.hasNextPage) break
  verifyAfter = edges[edges.length - 1]?.cursor
}

console.log(`\n========== SUMMARY ==========`)
console.log(`Products updated:     ${executionLog.results.filter(r => r.status === 'OK').length}`)
console.log(`Variants updated:     ${executionLog.totalUpdated}`)
console.log(`Errors:               ${executionLog.totalErrors}`)
console.log(`\nPost-execution verify:`)
console.log(`  Total variants:     ${totalVariants}`)
console.log(`  With SKU:           ${withSku} (${(withSku / totalVariants * 100).toFixed(0)}%)`)
console.log(`  Still missing SKU:  ${withoutSku}`)
console.log(`\nSnapshot: data/snapshots/sku-fill/snapshot-2026-05-14.json`)
console.log(`Log:      data/snapshots/sku-fill/execution-log-2026-05-14.json`)
console.log(`Rollback: node scripts/sku-fill-rollback.js`)
process.exit(0)
