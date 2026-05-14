/**
 * Phase 2 EXPANSION ROLLBACK — restores the bundles to their pre-execution state
 * (whatever they were before phase2-expand-bundles.js ran).
 *
 * Reads data/snapshots/phase2-expand-pre-snapshot.json (taken before phase 2 expansion ran).
 *
 * Run: node scripts/phase2-expand-rollback.js
 */
import 'dotenv/config'
import { readFileSync } from 'fs'

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

const snap = JSON.parse(readFileSync('data/snapshots/phase2-expand-pre-snapshot.json', 'utf8'))
console.log(`\nROLLBACK from snapshot taken ${snap.takenAt}\n`)
console.log(`Reverting ${snap.products.filter(p => !p.error).length} bundles to their pre-Phase-2-expansion state\n`)

for (const p of snap.products) {
  if (p.error) continue
  const gid = `gid://shopify/Product/${p.id}`
  console.log(`→ ${p.id} ${(p.title || '').slice(0, 45)}`)
  const r1 = await gql(
    `mutation productUpdate($input: ProductInput!) { productUpdate(input:$input){ userErrors{message} } }`,
    {
      input: {
        id: gid,
        productType: p.productType || '',
        seo: { title: p.seoTitle || '' },
      },
    }
  )
  console.log(`  productUpdate:`, r1.data?.productUpdate?.userErrors?.length ? r1.data.productUpdate.userErrors : 'OK')

  const r2 = await gql(
    `mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) { metafieldsSet(metafields:$metafields){ userErrors{message} } }`,
    {
      metafields: [
        { ownerId: gid, namespace: 'mm-google-shopping', key: 'custom_label_0', type: 'single_line_text_field', value: p.custom_label_0 || '' },
        { ownerId: gid, namespace: 'mm-google-shopping', key: 'google_product_category', type: 'single_line_text_field', value: p.google_product_category || '' },
      ],
    }
  )
  console.log(`  metafieldsSet:`, r2.data?.metafieldsSet?.userErrors?.length ? r2.data.metafieldsSet.userErrors : 'OK')
  await new Promise(r => setTimeout(r, 800))
}
console.log('\n✓ Rollback complete.')
process.exit(0)
