import 'dotenv/config'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const GQL = 'https://bdd19a-3.myshopify.com/admin/api/2026-01/graphql.json'
const ids = [
  ['Newcastle', 468151861337],
  ['Wollongong', 468151959641],
  ['Canberra', 468151894105],
  ['ACT', 468165656665],
  ['Melbourne', 282307985497],
  ['Sunshine Coast', 468151926873],
]
console.log('\n=== GRAPHQL VERIFICATION ===\n')
for (const [label, id] of ids) {
  const r = await fetch(GQL, {
    method:'POST', headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json'},
    body: JSON.stringify({ query: `query { collection(id:"gid://shopify/Collection/${id}") { handle title seo { title description } descriptionHtml } }` })
  }).then(r=>r.json())
  const c = r.data?.collection
  console.log(`${label.padEnd(16)} | ${c?.handle.padEnd(38)} | seo.title: ${(c?.seo?.title||'').slice(0,50).padEnd(50)} | seo.desc: ${!!c?.seo?.description ? '✓' : '✗'}`)
}
process.exit(0)
