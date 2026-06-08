import 'dotenv/config'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const URL = 'https://bdd19a-3.myshopify.com/admin/api/2026-01/graphql.json'
async function gql(q){const r=await fetch(URL,{method:'POST',headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query:q})});return r.json()}

// Get Melbourne collection details: descriptionHtml, meta, metafields
const q = `{
  collectionByHandle(handle: "gender-reveal-ideas-melbourne") {
    id title handle descriptionHtml
    seo { title description }
    metafields(first: 20) { edges { node { namespace key type value } } }
    productsCount { count }
  }
}`
const r = await gql(q)
const c = r.data?.collectionByHandle
console.log('Title:', c?.title)
console.log('Handle:', c?.handle)
console.log('Products:', c?.productsCount?.count)
console.log('SEO title:', c?.seo?.title?.slice(0,100))
console.log('SEO desc:', c?.seo?.description?.slice(0,200))
console.log('\nDescriptionHtml length:', c?.descriptionHtml?.length || 0, 'chars')
console.log('\nDescription preview:')
console.log((c?.descriptionHtml||'').slice(0,800).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim())
console.log('\nMetafields:')
for (const e of c?.metafields?.edges||[]) {
  const n = e.node
  console.log(`  ${n.namespace}.${n.key} [${n.type}] = ${String(n.value).slice(0,100)}...`)
}
