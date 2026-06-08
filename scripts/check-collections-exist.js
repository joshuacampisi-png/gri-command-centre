import 'dotenv/config'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const URL = 'https://bdd19a-3.myshopify.com/admin/api/2026-01/graphql.json'
async function gql(q,v){const r=await fetch(URL,{method:'POST',headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query:q,variables:v})});return r.json()}

const HANDLES = [
  'gender-reveal-ideas-canberra',
  'gender-reveal-ideas-townsville',
  'gender-reveal-ideas-act',
  'gender-reveal-ideas-queensland',
]

for (const h of HANDLES) {
  const r = await gql(`{ collectionByHandle(handle:"${h}") { id title handle descriptionHtml seo{title description} productsCount{count} metafield(namespace:"custom", key:"looking_to_buy_location_text") { id type } } }`)
  const c = r.data?.collectionByHandle
  if (!c) { console.log(`❌ ${h}: NOT FOUND`); continue }
  const descLen = c.descriptionHtml?.length || 0
  const hasMeta = !!c.metafield
  console.log(`✓ ${h}: products=${c.productsCount?.count} descHtml=${descLen}c seo=${!!c.seo?.title?'Y':'N'} richMeta=${hasMeta?'Y':'N'}`)
  console.log(`    title: ${c.title}`)
  console.log(`    SEO  : ${c.seo?.title?.slice(0,100)}`)
}
process.exit(0)
