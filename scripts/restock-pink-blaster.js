import 'dotenv/config'

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

// 1. Find the Pink Mini Powder Blaster variant + its inventory item + locations
const variantGid = 'gid://shopify/ProductVariant/41196797231193'
const q = await gql(`{
  productVariant(id: "${variantGid}") {
    id
    title
    sku
    inventoryPolicy
    inventoryItem {
      id
      tracked
      inventoryLevels(first: 10) {
        edges {
          node {
            id
            location { id name }
            quantities(names: ["available", "on_hand"]) { name quantity }
          }
        }
      }
    }
    product {
      id
      title
      variants(first: 10) {
        edges {
          node {
            id title sku inventoryPolicy
            inventoryItem { tracked inventoryLevels(first: 3) { edges { node { quantities(names: ["available"]) { name quantity } location { name } } } } }
          }
        }
      }
    }
  }
}`)

console.log('\nPink Mini Powder Blaster variant state:')
const v = q.data?.productVariant
console.log(`  Title: ${v?.title}`)
console.log(`  SKU: ${v?.sku}`)
console.log(`  inventoryPolicy: ${v?.inventoryPolicy}`)
console.log(`  tracked: ${v?.inventoryItem?.tracked}`)
console.log(`  Inventory levels:`)
for (const e of v?.inventoryItem?.inventoryLevels?.edges || []) {
  const avail = e.node.quantities?.find(x => x.name === 'available')?.quantity
  const onHand = e.node.quantities?.find(x => x.name === 'on_hand')?.quantity
  console.log(`    ${e.node.location.name}: available=${avail}, on_hand=${onHand} (${e.node.id})`)
}

console.log('\nSibling variants on same product (for reference):')
for (const e of v?.product?.variants?.edges || []) {
  const n = e.node
  const avail = n.inventoryItem?.inventoryLevels?.edges?.[0]?.node?.quantities?.find(x => x.name === 'available')?.quantity
  console.log(`  ${n.title.padEnd(20)} | policy=${n.inventoryPolicy} | tracked=${n.inventoryItem?.tracked} | available=${avail}`)
}
