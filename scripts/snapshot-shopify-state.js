/**
 * Snapshot all Shopify product SEO + productType state.
 * Read-only. No mutations. Saves to data/seo-snapshot-{date}.json.
 */
import 'dotenv/config'
import { writeFileSync, mkdirSync } from 'fs'

const SHOPIFY_URL = 'https://bdd19a-3.myshopify.com/admin/api/2026-01/graphql.json'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN
if (!TOKEN) { console.error('SHOPIFY_ADMIN_ACCESS_TOKEN env var required'); process.exit(1) }

async function gql(query) {
  const res = await fetch(SHOPIFY_URL, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query })
  })
  return await res.json()
}

console.log('=== SNAPSHOTTING ALL ACTIVE PRODUCTS ===\n')

let all = []
let cursor = null
let page = 0

while (true) {
  page++
  const after = cursor ? `, after: "${cursor}"` : ''
  const data = await gql(`{
    products(first: 50, query: "status:active"${after}) {
      edges {
        node {
          id
          title
          handle
          status
          productType
          seo { title description }
          tags
        }
        cursor
      }
      pageInfo { hasNextPage }
    }
  }`)

  const edges = data.data?.products?.edges || []
  for (const e of edges) all.push(e.node)
  console.log(`  Page ${page}: +${edges.length} products (total: ${all.length})`)

  if (!data.data?.products?.pageInfo?.hasNextPage || edges.length === 0) break
  cursor = edges[edges.length - 1].cursor
  if (page > 30) break
  await new Promise(r => setTimeout(r, 250))
}

const date = new Date().toISOString().slice(0, 10)
mkdirSync('./data/snapshots', { recursive: true })
const path = `./data/snapshots/shopify-snapshot-${date}.json`
writeFileSync(path, JSON.stringify(all, null, 2))

console.log(`\n✅ Snapshot saved: ${path}`)
console.log(`Total products: ${all.length}`)
console.log(`File size: ${(JSON.stringify(all).length/1024).toFixed(0)}KB`)

// Identify candidates for revert: products with SEO title NOT matching product title (we changed them)
const damaged = all.filter(p => {
  const seoT = p.seo?.title || ''
  if (!seoT) return false
  if (seoT === p.title) return false
  // bloat patterns we added on Apr 14
  if (seoT.includes(' Australia |') ||
      seoT.endsWith(' Australia') ||
      seoT.includes('| Gender Reveal Powder Blaste') ||
      seoT.includes('| Gender Reveal Bundle') ||
      seoT.includes('| Gender Reveal Party') ||
      seoT.includes('| Gender Reveal Powder') ||
      seoT.includes('| Gender Reveal Hire') ||
      seoT.includes('| Gender Reveal Decoration') ||
      seoT.includes('| Gender Reveal Tyre') ||
      seoT.includes('Pink Blue Holi Powder Australia') ||
      seoT.includes('Holi Colour Australia')) {
    return true
  }
  return false
})

console.log(`\n--- REVERT CANDIDATES (SEO title bloat pattern) ---`)
console.log(`Found ${damaged.length} damaged products.\n`)
for (const p of damaged.slice(0, 100)) {
  console.log(`  ${p.title.substring(0, 50).padEnd(51)} → SEO: "${p.seo.title.substring(0, 60)}"`)
}
console.log(`\nTotal to revert: ${damaged.length}`)
process.exit(0)
