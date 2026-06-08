/**
 * FIX: Prepend visible review block to descriptionHtml on the 2 pre-existing
 * collections (Victoria + Queensland). Idempotent — checks marker first.
 */
import 'dotenv/config'
import { REVIEW_BLOCK_HTML, REVIEW_BLOCK_MARKER } from './seo-areas-data.js'

const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN || process.env.SHOPIFY_TOKEN
const URL = 'https://bdd19a-3.myshopify.com/admin/api/2026-01/graphql.json'

async function gql(q, v = {}) {
  const r = await fetch(URL, { method: 'POST', headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q, variables: v }) })
  return r.json()
}

const targets = [
  { handle: 'gender-reveal-ideas-victoria', id: 'gid://shopify/Collection/282308018265' },
  { handle: 'gender-reveal-ideas-queensland', id: 'gid://shopify/Collection/282307821657' },
]

for (const t of targets) {
  // Get current descriptionHtml
  const r = await gql(`{ collection(id: "${t.id}") { id descriptionHtml } }`)
  const current = r.data?.collection?.descriptionHtml || ''
  if (current.includes(REVIEW_BLOCK_MARKER)) {
    console.log(`✓ ${t.handle} — already has review block, skipping`)
    continue
  }
  const newHtml = REVIEW_BLOCK_HTML + '\n' + current
  const u = await gql(`mutation collectionUpdate($input: CollectionInput!) {
    collectionUpdate(input: $input) { userErrors { message } }
  }`, { input: { id: t.id, descriptionHtml: newHtml } })
  const errs = u.data?.collectionUpdate?.userErrors || []
  console.log(`${errs.length ? '✗' : '✓'} ${t.handle} — ${errs.length ? JSON.stringify(errs) : 'review block prepended'}`)
  await new Promise(r => setTimeout(r, 400))
}
process.exit(0)
