import 'dotenv/config'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const URL = 'https://bdd19a-3.myshopify.com/admin/api/2026-01/graphql.json'
async function gql(q){const r=await fetch(URL,{method:'POST',headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query:q})});return r.json()}

const HANDLES = ['gender-reveal-cannons-bundle-australia','4-pack-gender-reveal-confetti-powder-xl-cannon-bundle','gender-reveal-powder-cannon-bundle','tnt-gender-reveal-australia']
for (const h of HANDLES) {
  const r = await gql(`{ productByHandle(handle:"${h}") { id title status totalInventory tracksInventory variants(first:5){edges{node{title sku availableForSale inventoryQuantity inventoryPolicy}}}} }`)
  const p = r.data?.productByHandle
  if (!p) { console.log(`❌ ${h}: NOT FOUND`); continue }
  console.log(`\n=== ${p.title} ===`)
  console.log(`  Handle: ${h}`)
  console.log(`  Status: ${p.status} | Tracks Inventory: ${p.tracksInventory} | Total Inv: ${p.totalInventory}`)
  for (const v of p.variants?.edges||[]) {
    const n = v.node
    console.log(`    [${n.availableForSale?'✅':'❌'}] ${(n.title||'').padEnd(20)} | SKU:${n.sku||'?'} | Inv:${n.inventoryQuantity} | Policy:${n.inventoryPolicy}`)
  }
}
process.exit(0)
