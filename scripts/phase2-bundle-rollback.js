/**
 * Phase 2 ROLLBACK — restores the 5 bundle SKUs to their pre-execution state.
 * Reads data/snapshots/phase2-bundles-may19-reference.json (taken before phase 2 ran).
 *
 * Run: node scripts/phase2-bundle-rollback.js
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

const snap = JSON.parse(readFileSync('data/snapshots/phase2-bundles-may19-reference.json', 'utf8'))
console.log(`\nROLLBACK from snapshot taken ${snap.takenAt}\n`)

for (const p of snap.products) {
  const gid = `gid://shopify/Product/${p.id}`
  console.log(`→ ${p.id} ${p.title}`)
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
  console.log(`  productUpdate:`, r1.data?.productUpdate?.userErrors || 'OK')

  const r2 = await gql(
    `mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) { metafieldsSet(metafields:$metafields){ userErrors{message} } }`,
    {
      metafields: [
        {
          ownerId: gid,
          namespace: 'mm-google-shopping',
          key: 'custom_label_0',
          type: 'single_line_text_field',
          value: p.mm_custom_label_0 || '',
        },
        {
          ownerId: gid,
          namespace: 'mm-google-shopping',
          key: 'google_product_category',
          type: 'single_line_text_field',
          value: p.mm_google_product_category || '',
        },
      ],
    }
  )
  console.log(`  metafieldsSet:`, r2.data?.metafieldsSet?.userErrors || 'OK')
  await new Promise(r => setTimeout(r, 800))
}
console.log('\n✓ Rollback complete.')
process.exit(0)
