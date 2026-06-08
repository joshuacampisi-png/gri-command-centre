import 'dotenv/config'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const URL = 'https://bdd19a-3.myshopify.com/admin/api/2026-01/graphql.json'
async function gql(q){const r=await fetch(URL,{method:'POST',headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query:q})});return r.json()}

// Verify TNT + helium fixes + scan other potential rental products
const HANDLES = [
  'tnt-gender-reveal-australia',  // TNT
  'gender-reveal-helium-balloon-box-hire',  // Helium hire
  'diy-hire-gender-reveal-balloon-garland-australia',  // Likely rental
  'classic-single-or-double-arch-garland-hire',  // Likely rental
]
for (const h of HANDLES) {
  // Try multiple handle variations
  const r = await gql(`{ products(first:5, query:"handle:${h}") { edges { node { handle title status totalInventory tracksInventory variants(first:5){edges{node{title availableForSale inventoryQuantity inventoryPolicy}}}} } } }`)
  const found = r.data?.products?.edges?.[0]?.node
  if (!found) {
    console.log(`\n❌ ${h}: not found`)
    continue
  }
  console.log(`\n=== ${found.title} ===`)
  console.log(`  Handle: ${found.handle} | Status: ${found.status} | Tracks Inventory: ${found.tracksInventory ? 'YES' : 'NO'} | Total: ${found.totalInventory}`)
  for (const v of found.variants?.edges||[]) {
    const n = v.node
    console.log(`    [${n.availableForSale?'✅ avail':'❌ unavail'}] ${(n.title||'').padEnd(20)} | Inv:${n.inventoryQuantity} | Policy:${n.inventoryPolicy}`)
  }
}
process.exit(0)
