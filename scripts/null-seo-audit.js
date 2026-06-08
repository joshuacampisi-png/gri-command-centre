import 'dotenv/config'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const URL = 'https://bdd19a-3.myshopify.com/admin/api/2026-01/graphql.json'
async function gql(q){const r=await fetch(URL,{method:'POST',headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query:q})});return r.json()}

let cursor=null, all=[]
for (let i=0;i<10;i++) {
  const r = await gql(`{ products(first:100 ${cursor?`,after:"${cursor}"`:''}, query:"status:active") { edges { cursor node { handle title totalInventory tracksInventory seo{title description} variants(first:1){edges{node{price}}} } } pageInfo{hasNextPage} } }`)
  for (const e of r.data?.products?.edges||[]) all.push(e.node)
  if (!r.data?.products?.pageInfo?.hasNextPage) break
  cursor = r.data.products.edges[r.data.products.edges.length-1].cursor
}

const nullTitle = all.filter(p => !p.seo?.title)
const nullDesc = all.filter(p => !p.seo?.description)
const both = all.filter(p => !p.seo?.title && !p.seo?.description)
const tooLong = all.filter(p => (p.seo?.title?.length||0) > 70)

console.log(`\n=== SEO AUDIT — ${all.length} ACTIVE PRODUCTS ===\n`)
console.log(`NULL Page Title:        ${nullTitle.length} (${Math.round(nullTitle.length/all.length*100)}%)`)
console.log(`NULL Meta Description:  ${nullDesc.length} (${Math.round(nullDesc.length/all.length*100)}%)`)
console.log(`Both NULL:              ${both.length} (${Math.round(both.length/all.length*100)}%)`)
console.log(`Page Title >70 chars (will be truncated by Google): ${tooLong.length}`)

console.log(`\n=== ALL PRODUCTS WITH NULL PAGE TITLE (sorted by price desc) ===\n`)
const sorted = nullTitle.sort((a,b)=>parseFloat(b.variants?.edges?.[0]?.node?.price||'0')-parseFloat(a.variants?.edges?.[0]?.node?.price||'0'))
console.log('Price   | Has Desc? | Title                                              | Handle')
console.log('--------+-----------+----------------------------------------------------+--------')
for (const p of sorted) {
  const price = parseFloat(p.variants?.edges?.[0]?.node?.price||'0').toFixed(0)
  const hasDesc = p.seo?.description ? '✓' : '✗'
  console.log(`$${price.padStart(5)} | ${hasDesc.padEnd(9)} | ${p.title.slice(0,50).padEnd(50)} | ${p.handle}`)
}

console.log(`\n=== PRODUCTS WITH PAGE TITLE >70 CHARS (truncated by Google) ===\n`)
for (const p of tooLong) {
  console.log(`  [${p.seo.title.length}c] ${p.title}`)
  console.log(`    current: "${p.seo.title}"`)
}
process.exit(0)
