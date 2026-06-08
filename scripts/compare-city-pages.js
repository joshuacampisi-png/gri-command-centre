import 'dotenv/config'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const URL = 'https://bdd19a-3.myshopify.com/admin/api/2026-01/graphql.json'
async function gql(q){const r=await fetch(URL,{method:'POST',headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query:q})});return r.json()}
const HANDLES = ['gender-reveal-ideas-adelaide','gender-reveal-ideas-darwin','gender-reveal-ideas-gold-coast','gender-reveal-ideas-melbourne','gender-reveal-ideas-canberra','gender-reveal-ideas-act','gender-reveal-ideas-sunshine-coast','gender-reveal-ideas-newcastle','gender-reveal-ideas-hobart','gender-reveal-ideas-wollongong','gender-reveal-ideas-launceston']
console.log('Handle                                | descHtml | richText chars | Products')
console.log('--------------------------------------+----------+----------------+---------')
for (const h of HANDLES) {
  const r = await gql(`{ collectionByHandle(handle:"${h}") { descriptionHtml productsCount{count} metafield(namespace:"custom",key:"looking_to_buy_location_text"){value} } }`)
  const c = r.data?.collectionByHandle
  if (!c) { console.log(`${h.padEnd(38)} | NOT FOUND`); continue }
  const desc = c.descriptionHtml?.length||0
  const rich = c.metafield?.value?.length||0
  console.log(`${h.padEnd(38)} | ${String(desc).padStart(8)} | ${String(rich).padStart(14)} | ${String(c.productsCount?.count).padStart(8)}`)
}
process.exit(0)
