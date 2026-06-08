import 'dotenv/config'

const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN || process.env.SHOPIFY_TOKEN
const URL = 'https://bdd19a-3.myshopify.com/admin/api/2026-01/graphql.json'

async function gql(query, variables = {}) {
  const r = await fetch(URL, { method: 'POST', headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables }) })
  return r.json()
}

const variantId = 'gid://shopify/ProductVariant/41196797231193'
const productId = 'gid://shopify/Product/7597135036505'

// productVariantsBulkUpdate is the v2026-01 mutation for variant updates
const result = await gql(`mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
  productVariantsBulkUpdate(productId: $productId, variants: $variants) {
    productVariants { id title inventoryPolicy }
    userErrors { field message }
  }
}`, {
  productId,
  variants: [{ id: variantId, inventoryPolicy: 'CONTINUE' }],
})

console.log('\nResult:')
console.log(JSON.stringify(result, null, 2))

// Verify
const verify = await gql(`{
  productVariants(first: 1, query: "sku:67448656931193") {
    edges { node { id title inventoryPolicy } }
  }
}`)
console.log('\nVerify after change:')
console.log(JSON.stringify(verify.data?.productVariants?.edges?.[0], null, 2))

// Also check the live product page to see if it's buyable
const fr = await fetch('https://genderrevealideas.com.au/products/mini-powder-gender-reveal-blaster.js')
const pj = await fr.json()
const pink = pj.variants.find(v => v.id === 41196797231193)
console.log('\nLive product page state for Pink variant:')
console.log(`  available: ${pink?.available}`)
console.log(`  title: ${pink?.title}`)
