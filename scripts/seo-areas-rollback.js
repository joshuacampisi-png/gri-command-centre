/**
 * SEO AREAS ROLLBACK — deletes the 12 collections created May 15 2026.
 * Reads: data/snapshots/seo-areas/snapshot-2026-05-15.json
 *
 * Run: node scripts/seo-areas-rollback.js
 */
import 'dotenv/config'
import { readFileSync } from 'fs'

const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN || process.env.SHOPIFY_TOKEN
const URL = 'https://bdd19a-3.myshopify.com/admin/api/2026-01/graphql.json'

async function gql(q, v = {}) {
  const r = await fetch(URL, { method: 'POST', headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q, variables: v }) })
  return r.json()
}

const snap = JSON.parse(readFileSync('data/snapshots/seo-areas/snapshot-2026-05-15.json', 'utf8'))
console.log(`\nROLLBACK from snapshot ${snap.takenAt}\n`)
console.log(`Will delete ${snap.created.length} created collections (skipped ${snap.skipped.length} pre-existing)\n`)

for (const c of snap.created) {
  console.log(`→ ${c.handle} (${c.id})`)
  const r = await gql(`mutation collectionDelete($input: CollectionDeleteInput!) {
    collectionDelete(input: $input) { deletedCollectionId userErrors { message } }
  }`, { input: { id: c.id } })
  const errs = r.data?.collectionDelete?.userErrors || []
  console.log(`  ${errs.length ? '✗ ' + JSON.stringify(errs) : '✓ deleted ' + r.data?.collectionDelete?.deletedCollectionId}`)
  await new Promise(r2 => setTimeout(r2, 500))
}

console.log('\n✓ Rollback complete.')
process.exit(0)
