import 'dotenv/config'
const URL='https://bdd19a-3.myshopify.com/admin/api/2026-01/graphql.json'
const TOKEN=process.env.SHOPIFY_ADMIN_ACCESS_TOKEN
const q = `{
  __schema { queryType { fields { name type { name kind ofType { name kind } } } } }
}`
const r = await fetch(URL,{method:'POST',headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query:q})})
console.log(JSON.stringify(await r.json(), null, 2))
