/**
 * Full revert of Apr 14 feed surgery.
 * - Clears seo.title (defaults to product title)
 * - Clears seo.description (defaults to product description)
 * - Clears productType (where bloat exists)
 * Authorisation: Josh, 2026-04-27, "I want everything back to pre surgery"
 *
 * Reads from snapshot to identify damaged products.
 * Logs each change with before/after.
 */
import 'dotenv/config'
import { readFileSync, writeFileSync } from 'fs'

const SHOPIFY_URL = 'https://bdd19a-3.myshopify.com/admin/api/2026-01/graphql.json'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN

async function gql(query) {
  const res = await fetch(SHOPIFY_URL, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query })
  })
  return await res.json()
}

const snapshot = JSON.parse(readFileSync('./data/snapshots/shopify-snapshot-2026-04-27.json', 'utf8'))

// Identify damaged products (same logic as snapshot script)
const damaged = snapshot.filter(p => {
  const seoT = p.seo?.title || ''
  if (!seoT) return false
  if (seoT === p.title) return false
  return (
    seoT.includes(' Australia |') ||
    seoT.endsWith(' Australia') ||
    seoT.includes('| Gender Reveal Powder Blaste') ||
    seoT.includes('| Gender Reveal Bundle') ||
    seoT.includes('| Gender Reveal Party') ||
    seoT.includes('| Gender Reveal Powder') ||
    seoT.includes('| Gender Reveal Hire') ||
    seoT.includes('| Gender Reveal Decoration') ||
    seoT.includes('| Gender Reveal Tyre') ||
    seoT.includes('Pink Blue Holi Powder Australia') ||
    seoT.includes('Holi Colour Australia') ||
    seoT.includes('| Party Supplies Australia') ||
    seoT.includes('| Colour Powder Cannon Australia')
  )
})

console.log(`=== REVERT FEED SURGERY ===`)
console.log(`Reverting ${damaged.length} products to pre-Apr-14 state.\n`)

const results = []
let updated = 0, errors = 0

for (const p of damaged) {
  // Build mutation: empty SEO + empty productType = Shopify default behaviour
  const mutation = `
    mutation {
      productUpdate(input: {
        id: "${p.id}"
        productType: ""
        seo: {
          title: ""
          description: ""
        }
      }) {
        product { id title productType seo { title description } }
        userErrors { field message }
      }
    }
  `

  try {
    const result = await gql(mutation)
    const ue = result.data?.productUpdate?.userErrors || []
    if (ue.length > 0) {
      console.log(`  ✗ ${p.title.substring(0, 50)} — ${ue[0].message}`)
      errors++
      results.push({ id: p.id, title: p.title, status: 'ERROR', error: ue[0].message })
    } else {
      const newSeo = result.data?.productUpdate?.product?.seo?.title || '(empty → defaults to title)'
      console.log(`  ✓ ${p.title.substring(0, 50).padEnd(51)} | SEO cleared`)
      updated++
      results.push({
        id: p.id,
        title: p.title,
        status: 'OK',
        before: { seoTitle: p.seo?.title, productType: p.productType },
        after: { seoTitle: newSeo, productType: '' }
      })
    }
  } catch (err) {
    console.log(`  ✗ ${p.title.substring(0, 50)} — ${err.message}`)
    errors++
    results.push({ id: p.id, title: p.title, status: 'EXCEPTION', error: err.message })
  }

  await new Promise(r => setTimeout(r, 350)) // rate limit
}

const date = new Date().toISOString().slice(0, 10)
writeFileSync(`./data/snapshots/revert-log-${date}.json`, JSON.stringify(results, null, 2))

console.log(`\n=== COMPLETE ===`)
console.log(`Reverted: ${updated}`)
console.log(`Errors:   ${errors}`)
console.log(`Log saved: data/snapshots/revert-log-${date}.json`)
console.log(`\nMerchant Centre will re-crawl in 24-48 hours. Expect impression recovery within 5-7 days.`)
process.exit(0)
