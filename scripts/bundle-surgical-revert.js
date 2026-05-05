/**
 * bundle-surgical-revert.js
 * Surgical fix: Bundle products only
 * - Clear product_type (remove deep Gender Reveal > Bundles categorisation)
 * - Simplify SEO title (remove "Australia" suffix, keep it close to original)
 *
 * Keeps organic SEO wins on non-Bundle products intact.
 */
import 'dotenv/config'

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

async function main() {
  console.log('=== BUNDLE SURGICAL REVERT ===\n')

  // Fetch all Bundle products
  let allProducts = []
  let cursor = null
  let page = 0

  while (true) {
    page++
    const after = cursor ? `, after: "${cursor}"` : ''
    const data = await gql(`{
      products(first: 50, query: "product_type:*Bundles*"${after}) {
        edges {
          node {
            id
            title
            handle
            productType
            seo { title description }
          }
          cursor
        }
        pageInfo { hasNextPage }
      }
    }`)

    const edges = data.data?.products?.edges || []
    allProducts.push(...edges)
    if (!data.data?.products?.pageInfo?.hasNextPage || edges.length === 0) break
    cursor = edges[edges.length - 1].cursor
    if (page > 10) break
  }

  console.log(`Found ${allProducts.length} Bundle products to fix\n`)

  let updated = 0, errors = 0

  for (const {node: p} of allProducts) {
    const numericId = p.id.split('/').pop()

    // Generate clean SEO title — keep original, strip bundle-suffix + Australia
    const cleanTitle = p.title
      .replace(/🎉/g, '')
      .replace(/💥/g, '')
      .replace(/💨/g, '')
      .trim()

    // Simple SEO title = just clean original title (no Australia, no "Gender Reveal Bundle" suffix)
    const newSeoTitle = cleanTitle.substring(0, 70)

    // Simple description, no Australia spam
    const newSeoDesc = `Shop ${cleanTitle} at Gender Reveal Ideas. Save big with our premium gender reveal bundle packs. Fast shipping.`.substring(0, 320)

    // Clear product type to empty
    const mutation = `
      mutation {
        productUpdate(input: {
          id: "${p.id}"
          productType: ""
          seo: {
            title: ${JSON.stringify(newSeoTitle)}
            description: ${JSON.stringify(newSeoDesc)}
          }
        }) {
          product { id title productType seo { title } }
          userErrors { field message }
        }
      }
    `

    try {
      const result = await gql(mutation)
      const ue = result.data?.productUpdate?.userErrors || []
      if (ue.length > 0) {
        console.log(`  ✗ ${p.title.substring(0, 45)} — ${ue[0].message}`)
        errors++
      } else {
        console.log(`  ✓ ${p.title.substring(0, 50).padEnd(51)} | Type cleared | SEO: "${newSeoTitle.substring(0, 50)}"`)
        updated++
      }
    } catch (err) {
      console.log(`  ✗ ${p.title.substring(0, 45)} — ${err.message}`)
      errors++
    }

    await new Promise(r => setTimeout(r, 300))
  }

  console.log(`\n=== COMPLETE ===`)
  console.log(`Updated: ${updated}`)
  console.log(`Errors: ${errors}`)
  console.log(`\nMerchant Centre will re-crawl in 24-48hrs. Expect improvement by Apr 23-24.`)
}

main().catch(err => { console.error('FATAL:', err); process.exit(1) })
