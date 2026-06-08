import 'dotenv/config'
const SHOPIFY_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
async function gql(query) {
  const r = await fetch('https://bdd19a-3.myshopify.com/admin/api/2026-01/graphql.json', {
    method: 'POST', headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }),
  })
  return r.json()
}

// Target products: 4x Smoke Bombs Bundle + Double Mega Powder
const handles = [
  'gender-reveal-smoke-bombs',           // 4x Bundle Pack Smoke Bombs (showing 3★/10 on GMC)
  'gender-reveal-double-mega-powder-blaster-extinguisher',   // Double MEGA Powder Blaster (showing 3.5★/7)
  'double-mega-powder-extinguisher-and-gender-reveal-cannon-bundle',  // Double MEGA Bundle (showing 3.5★/5)
  'gender-reveal-double-mega-powder-extinguisher-and-gender-reveal-cannon-bundle',
]

// Try several handle variants
const searchTitles = ['Smoke Bombs', 'Double MEGA', 'Double Mega', 'Bundle Pack Smoke']
for (const term of searchTitles) {
  const r = await gql(`{
    products(first: 8, query: "title:*${term}*") {
      edges { node {
        id title handle status
        jmrating: metafield(namespace: "reviews", key: "rating") { value }
        jmcount: metafield(namespace: "reviews", key: "rating_count") { value }
        all_metafields: metafields(first: 20, namespace: "reviews") { edges { node { key value } } }
        all_jm: metafields(first: 20, namespace: "judgeme") { edges { node { key value } } }
      } }
    }
  }`)
  console.log(`\n=== TITLE CONTAINS "${term}" ===`)
  for (const e of r.data?.products?.edges || []) {
    const n = e.node
    console.log(`\n  ${n.title}`)
    console.log(`    Handle: ${n.handle}`)
    console.log(`    Status: ${n.status}`)
    console.log(`    Live URL: https://genderrevealideas.com.au/products/${n.handle}`)
    let rating = null, count = null
    try { const o = n.jmrating?.value ? JSON.parse(n.jmrating.value) : null; rating = o?.value ?? o } catch { rating = n.jmrating?.value }
    count = n.jmcount?.value
    console.log(`    reviews.rating metafield: ${JSON.stringify(rating)}`)
    console.log(`    reviews.rating_count metafield: ${count}`)
    const reviewsList = n.all_metafields?.edges?.map(x => `${x.node.key}=${x.node.value?.slice(0, 50)}`).join('; ')
    if (reviewsList) console.log(`    All "reviews" metafields: ${reviewsList}`)
    const jmList = n.all_jm?.edges?.map(x => `${x.node.key}=${x.node.value?.slice(0, 50)}`).join('; ')
    if (jmList) console.log(`    All "judgeme" metafields: ${jmList}`)
  }
}
