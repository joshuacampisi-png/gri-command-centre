import 'dotenv/config'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const URL = 'https://bdd19a-3.myshopify.com/admin/api/2026-01/graphql.json'
async function gql(q){const r=await fetch(URL,{method:'POST',headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query:q})});return r.json()}

// Find all "hire" products
const r = await gql(`{ products(first:50, query:"title:hire OR title:rental") { edges { node { handle title status totalInventory tracksInventory variants(first:1){edges{node{availableForSale inventoryPolicy}}}} } } }`)
console.log(`\n=== ALL HIRE/RENTAL PRODUCTS ===\n`)
for (const e of r.data?.products?.edges||[]) {
  const p = e.node
  const v = p.variants?.edges?.[0]?.node
  const flag = !p.tracksInventory ? '✅ NO TRACK' : (v?.availableForSale ? '🟡 trk+avail' : '❌ trk+OOS')
  console.log(`${flag} | ${p.title.slice(0,55).padEnd(55)} | inv:${String(p.totalInventory||'-').padStart(4)} | ${p.handle}`)
}
process.exit(0)
