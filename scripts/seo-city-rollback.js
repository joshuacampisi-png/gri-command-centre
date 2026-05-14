/**
 * SEO CITY ROLLBACK — restores existing 7 collections to pre-execution state.
 * For the 5 newly-CREATED collections: deletes them.
 *
 * Reads: data/snapshots/seo-cities/snapshot-2026-05-14.json
 *
 * Run: node scripts/seo-city-rollback.js
 */
import 'dotenv/config'
import { readFileSync } from 'fs'

const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN || process.env.SHOPIFY_TOKEN
const URL = 'https://bdd19a-3.myshopify.com/admin/api/2026-01/graphql.json'

async function gql(q, v = {}) {
  const r = await fetch(URL, { method: 'POST', headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q, variables: v }) })
  return r.json()
}

const snap = JSON.parse(readFileSync('data/snapshots/seo-cities/snapshot-2026-05-14.json', 'utf8'))

console.log(`\nROLLBACK from snapshot ${snap.takenAt}\n`)

// 1. Restore existing collections (7)
console.log('--- RESTORING EXISTING (7) ---\n')
for (const [handle, state] of Object.entries(snap.existing)) {
  if (!state) continue
  console.log(`→ ${handle}`)
  const r1 = await gql(`mutation collectionUpdate($input: CollectionInput!) {
    collectionUpdate(input: $input) { userErrors { message } }
  }`, {
    input: {
      id: state.id,
      descriptionHtml: state.descriptionHtml,
      seo: { title: state.title_tag, description: state.description_tag },
    },
  })
  console.log(`  collectionUpdate:`, r1.data?.collectionUpdate?.userErrors?.length ? r1.data.collectionUpdate.userErrors : 'OK')

  const r2 = await gql(`mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) { userErrors { message } }
  }`, {
    metafields: [
      { ownerId: state.id, namespace: 'global', key: 'title_tag', type: 'single_line_text_field', value: state.title_tag },
      { ownerId: state.id, namespace: 'global', key: 'description_tag', type: 'single_line_text_field', value: state.description_tag },
      { ownerId: state.id, namespace: 'custom', key: 'looking_to_buy_location_text', type: 'rich_text_field', value: state.looking_to_buy_location_text },
      { ownerId: state.id, namespace: 'custom', key: 'custom_schema', type: 'multi_line_text_field', value: state.custom_schema },
    ],
  })
  console.log(`  metafieldsSet:`, r2.data?.metafieldsSet?.userErrors?.length ? r2.data.metafieldsSet.userErrors : 'OK')
  await new Promise(r => setTimeout(r, 600))
}

// 2. Delete newly-created collections (5)
console.log(`\n--- DELETING NEW CREATED (${snap.newCreated.length}) ---\n`)
for (const created of snap.newCreated) {
  console.log(`→ ${created.handle} (${created.id})`)
  const r = await gql(`mutation collectionDelete($input: CollectionDeleteInput!) {
    collectionDelete(input: $input) { deletedCollectionId userErrors { message } }
  }`, { input: { id: created.id } })
  console.log(`  delete:`, r.data?.collectionDelete?.userErrors?.length ? r.data.collectionDelete.userErrors : 'OK · ' + r.data?.collectionDelete?.deletedCollectionId)
  await new Promise(r2 => setTimeout(r2, 600))
}

console.log('\n✓ Rollback complete.')
process.exit(0)
