import 'dotenv/config'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const URL = 'https://bdd19a-3.myshopify.com/admin/api/2026-01/graphql.json'
async function gql(q){const r=await fetch(URL,{method:'POST',headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query:q})});return r.json()}

// Search by title containing "Hire" or "Rental"
let cursor=null
const all=[]
for (let i=0;i<5;i++){
  const r = await gql(`{ products(first:100 ${cursor?`,after:"${cursor}"`:''}, query:"status:active") { edges { cursor node { handle title totalInventory tracksInventory variants(first:1){edges{node{availableForSale inventoryPolicy}}}} } pageInfo{hasNextPage} } }`)
  for (const e of r.data?.products?.edges||[]) all.push(e.node)
  if (!r.data?.products?.pageInfo?.hasNextPage) break
  cursor = r.data.products.edges[r.data.products.edges.length-1].cursor
}
console.log(`Total active products: ${all.length}`)
const hire = all.filter(p => /hire|rental/i.test(p.title))
console.log(`\n=== HIRE/RENTAL PRODUCTS (${hire.length}) ===\n`)
for (const p of hire) {
  const v = p.variants?.edges?.[0]?.node
  const flag = !p.tracksInventory ? '✅ NO TRACK (correct for rental)' : (v?.availableForSale ? '🟡 tracking inv, avail' : '🚨 tracking inv, OOS')
  console.log(`${flag.padEnd(35)} | ${p.title.slice(0,50).padEnd(50)} | inv:${String(p.totalInventory||'-').padStart(4)}`)
}
process.exit(0)
