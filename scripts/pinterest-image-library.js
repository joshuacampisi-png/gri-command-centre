/**
 * Pull all active product images + variants from Shopify for Pinterest pin generation.
 * Outputs a structured library Josh can use to bulk-upload pins.
 */
import 'dotenv/config'
import { writeFileSync, mkdirSync } from 'fs'

const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
async function gql(q) {
  const r = await fetch('https://bdd19a-3.myshopify.com/admin/api/2026-01/graphql.json', {
    method: 'POST', headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q })
  })
  return r.json()
}

mkdirSync('data/snapshots/pinterest', { recursive: true })

let cursor = null
const products = []
while (true) {
  const r = await gql(`{
    products(first: 50${cursor ? `, after: "${cursor}"` : ''}, query: "status:active") {
      edges {
        cursor
        node {
          id title handle productType vendor tags
          featuredMedia { preview { image { url } } }
          media(first: 10) { edges { node { ... on MediaImage { image { url altText } } } } }
          variants(first: 1) { edges { node { id title price } } }
        }
      }
      pageInfo { hasNextPage }
    }
  }`)
  const edges = r.data?.products?.edges || []
  for (const e of edges) {
    const n = e.node
    const heroImg = n.featuredMedia?.preview?.image?.url
    const allImgs = (n.media?.edges || []).map(x => x.node?.image?.url).filter(Boolean)
    const price = Number(n.variants?.edges?.[0]?.node?.price || 0)
    products.push({
      id: n.id.split('/').pop(),
      title: n.title,
      handle: n.handle,
      productType: n.productType,
      tags: n.tags,
      price,
      productUrl: `https://genderrevealideas.com.au/products/${n.handle}`,
      heroImage: heroImg,
      allImages: allImgs,
    })
  }
  if (!r.data?.products?.pageInfo?.hasNextPage) break
  cursor = edges[edges.length - 1].cursor
}

console.log(`\n${products.length} active products pulled`)
console.log(`Total unique images: ${products.reduce((s,p) => s + p.allImages.length, 0)}`)

// Categorize for Pinterest boards
const categories = {}
for (const p of products) {
  const t = (p.tags || []).map(x => x.toLowerCase())
  const title = p.title.toLowerCase()
  let cat = 'Other'
  if (title.includes('smoke') || t.includes('smoke')) cat = 'Smoke Bombs'
  else if (title.includes('extinguisher') || title.includes('blaster')) cat = 'Powder Blasters & Extinguishers'
  else if (title.includes('cannon')) cat = 'Powder Cannons'
  else if (title.includes('balloon')) cat = 'Balloon Reveals'
  else if (title.includes('football') || title.includes('rugby') || title.includes('soccer') || title.includes('golf') || title.includes('cricket') || title.includes('afl') || title.includes('basketball') || t.includes('sports')) cat = 'Sports Reveals'
  else if (title.includes('tnt')) cat = 'TNT Boxes'
  else if (title.includes('burnout') || title.includes('powder')) cat = 'Burnout Powder'
  else if (title.includes('dry ice')) cat = 'Dry Ice Reveals'
  else if (title.includes('bundle')) cat = 'Bundles & Party Packs'
  categories[cat] = (categories[cat] || []).concat([p])
}

console.log(`\nCategory breakdown for Pinterest boards:`)
for (const [c, arr] of Object.entries(categories).sort((a,b)=>b[1].length-a[1].length)) {
  console.log(`  ${c.padEnd(35)} ${arr.length} products, ~${arr.reduce((s,p)=>s+p.allImages.length,0)} pinnable images`)
}

writeFileSync('data/snapshots/pinterest/products-with-images.json', JSON.stringify(products, null, 2))
writeFileSync('data/snapshots/pinterest/categories.json', JSON.stringify(categories, null, 2))
console.log(`\n✓ Image library saved to data/snapshots/pinterest/`)
process.exit(0)
