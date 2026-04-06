/**
 * Inventory Sorter — pushes out-of-stock products to the bottom of their collections.
 *
 * Triggered by Shopify products/update webhook when a product's inventory hits 0.
 * Also exposes a full-sweep function for manual/cron use.
 */
import { env } from './env.js'

const GQL_URL = `https://${env.shopify.storeDomain}/admin/api/2025-01/graphql.json`

async function gql(query, variables = {}) {
  const res = await fetch(GQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': env.shopify.adminAccessToken,
    },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors) {
    console.error('[inventory-sorter] GraphQL errors:', JSON.stringify(json.errors))
    throw new Error('GraphQL error')
  }
  return json.data
}

/**
 * Find all collections that contain a given product and push it to the bottom.
 */
export async function pushProductToBottom(productGid) {
  // 1. Find all collections this product belongs to
  const data = await gql(`{
    product(id: "${productGid}") {
      title
      totalInventory
      collections(first: 100) {
        edges { node { id title sortOrder } }
      }
    }
  }`)

  if (!data.product) {
    console.log(`[inventory-sorter] Product ${productGid} not found`)
    return
  }

  const product = data.product
  const collections = product.collections.edges.map(e => e.node)

  if (collections.length === 0) {
    console.log(`[inventory-sorter] "${product.title}" is not in any collection`)
    return
  }

  console.log(`[inventory-sorter] "${product.title}" (inventory: ${product.totalInventory}) → reordering ${collections.length} collection(s)`)

  for (const col of collections) {
    await reorderCollection(col.id, col.title)
  }
}

/**
 * Reorder a single collection: in-stock first, OOS last.
 */
async function reorderCollection(collectionId, collectionTitle) {
  // Fetch all products in the collection
  const products = []
  let cursor = null

  while (true) {
    const afterClause = cursor ? `, after: "${cursor}"` : ''
    const data = await gql(`{
      collection(id: "${collectionId}") {
        products(first: 50${afterClause}) {
          edges {
            cursor
            node { id title totalInventory }
          }
          pageInfo { hasNextPage }
        }
      }
    }`)

    for (const edge of data.collection.products.edges) {
      products.push(edge.node)
      cursor = edge.cursor
    }
    if (!data.collection.products.pageInfo.hasNextPage) break
  }

  const inStock = products.filter(p => p.totalInventory > 0)
  const oos = products.filter(p => p.totalInventory <= 0)

  if (oos.length === 0 || inStock.length === 0) return

  // Ensure manual sort order
  await gql(`mutation {
    collectionUpdate(input: { id: "${collectionId}", sortOrder: MANUAL }) {
      userErrors { field message }
    }
  }`)

  // Build moves
  const sorted = [...inStock, ...oos]
  const moves = sorted.map((p, i) => ({ id: p.id, newPosition: String(i) }))

  const BATCH = 250
  for (let i = 0; i < moves.length; i += BATCH) {
    const batch = moves.slice(i, i + BATCH)
    const result = await gql(`
      mutation collectionReorderProducts($id: ID!, $moves: [MoveInput!]!) {
        collectionReorderProducts(id: $id, moves: $moves) {
          job { id }
          userErrors { field message }
        }
      }
    `, { id: collectionId, moves: batch })

    const errors = result.collectionReorderProducts?.userErrors
    if (errors?.length) {
      console.error(`[inventory-sorter] "${collectionTitle}" errors:`, errors)
    }
  }

  console.log(`[inventory-sorter] ✓ "${collectionTitle}" — ${oos.length} OOS anchored to bottom`)
}

/**
 * Full sweep — reorder ALL collections. Use for cron or manual trigger.
 */
export async function reorderAllCollections() {
  const collections = []
  let cursor = null

  while (true) {
    const afterClause = cursor ? `, after: "${cursor}"` : ''
    const data = await gql(`{
      collections(first: 50${afterClause}) {
        edges {
          cursor
          node { id title sortOrder }
        }
        pageInfo { hasNextPage }
      }
    }`)

    for (const edge of data.collections.edges) {
      collections.push(edge.node)
      cursor = edge.cursor
    }
    if (!data.collections.pageInfo.hasNextPage) break
  }

  console.log(`[inventory-sorter] Full sweep: ${collections.length} collections`)
  let reordered = 0

  for (const col of collections) {
    try {
      await reorderCollection(col.id, col.title)
      reordered++
    } catch (err) {
      console.error(`[inventory-sorter] Failed "${col.title}":`, err.message)
    }
  }

  console.log(`[inventory-sorter] Full sweep complete: ${reordered} collections processed`)
  return { total: collections.length, reordered }
}
