import 'dotenv/config'

const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN || process.env.SHOPIFY_TOKEN
const URL = 'https://bdd19a-3.myshopify.com/admin/api/2026-01/graphql.json'

async function gql(query, variables = {}) {
  const r = await fetch(URL, { method: 'POST', headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables }) })
  return r.json()
}

const inventoryItemId = 'gid://shopify/InventoryItem/43281346330713'

// 1. Get current inventory levels for this item
const q = await gql(`{
  inventoryItem(id: "${inventoryItemId}") {
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
}`)
console.log('Current state:')
console.log(JSON.stringify(q, null, 2).slice(0, 2000))
