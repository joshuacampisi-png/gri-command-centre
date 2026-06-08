import 'dotenv/config'

const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN || process.env.SHOPIFY_TOKEN
const URL = 'https://bdd19a-3.myshopify.com/admin/api/2026-01/graphql.json'

async function gql(query, variables = {}) {
  const r = await fetch(URL, { method: 'POST', headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables }) })
  return r.json()
}

// Find variant by SKU instead (more reliable)
const q = await gql(`{
  productVariants(first: 10, query: "sku:67448656931193") {
    edges { node { id title sku inventoryPolicy inventoryItem { id tracked } } }
  }
}`)
console.log('SKU lookup:', JSON.stringify(q, null, 2))
