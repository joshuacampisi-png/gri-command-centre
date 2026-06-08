/**
 * SKU FILL ROLLBACK — Restores variant SKUs to pre-execution state.
 * Reads: data/snapshots/sku-fill/snapshot-2026-05-14.json
 * Variants that had no SKU before will be cleared back to empty.
 *
 * Run: node scripts/sku-fill-rollback.js
 */
import 'dotenv/config'
import { readFileSync } from 'fs'

const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN || process.env.SHOPIFY_TOKEN
const URL = 'https://bdd19a-3.myshopify.com/admin/api/2026-01/graphql.json'

async function gql(q, v = {}) {
  const r = await fetch(URL, { method: 'POST', headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q, variables: v }) })
  return r.json()
}

const snap = JSON.parse(readFileSync('data/snapshots/sku-fill/snapshot-2026-05-14.json', 'utf8'))
console.log(`\nROLLBACK from snapshot ${snap.takenAt}\n`)

const mutation = `mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
  productVariantsBulkUpdate(productId: $productId, variants: $variants) {
    userErrors { message }
  }
}`

let touched = 0
for (const p of snap.products) {
  const previouslyEmpty = p.variants.filter(v => !v.sku || v.sku.trim() === '')
  if (previouslyEmpty.length === 0) continue
  const r = await gql(mutation, {
    productId: `gid://shopify/Product/${p.id}`,
    variants: previouslyEmpty.map(v => ({ id: v.gidVariant, inventoryItem: { sku: '' } })),
  })
  const errs = r.data?.productVariantsBulkUpdate?.userErrors || []
  if (errs.length) {
    console.log(`  ✗ ${p.title?.slice(0, 50)} — ${JSON.stringify(errs).slice(0, 150)}`)
  } else {
    touched += previouslyEmpty.length
  }
  await new Promise(r => setTimeout(r, 250))
}
console.log(`\n✓ Rolled back ${touched} variants to empty SKU.`)
process.exit(0)
