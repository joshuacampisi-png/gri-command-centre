import 'dotenv/config'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const URL = 'https://bdd19a-3.myshopify.com/admin/api/2026-01/graphql.json'
async function gql(q,v){const r=await fetch(URL,{method:'POST',headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query:q,variables:v})});return r.json()}

// Pull Shopify orders last 90 days, aggregate by SKU
const SINCE = new Date(Date.now()-90*86400000).toISOString().slice(0,10)
let cursor = null
const m = new Map()
let page = 0
while (page < 10) {
  const r = await gql(`{
    orders(first:100, query:"created_at:>=${SINCE} financial_status:paid"${cursor?`, after:"${cursor}"`:''}) {
      edges { cursor node {
        id name createdAt
        lineItems(first:50) { edges { node { title quantity originalUnitPriceSet{shopMoney{amount}} product{handle} } } }
      } }
      pageInfo { hasNextPage }
    }
  }`)
  const edges = r.data?.orders?.edges||[]
  for (const e of edges) {
    for (const li of e.node?.lineItems?.edges||[]) {
      const t = li.node.title
      const qty = li.node.quantity
      const price = parseFloat(li.node.originalUnitPriceSet?.shopMoney?.amount||'0')
      const handle = li.node.product?.handle||'?'
      const cur = m.get(handle) || { handle, title: t, units:0, revenue:0 }
      cur.units += qty
      cur.revenue += qty * price
      if (!cur.title || t.length>cur.title.length) cur.title = t
      m.set(handle, cur)
    }
  }
  if (!r.data?.orders?.pageInfo?.hasNextPage) break
  cursor = edges[edges.length-1].cursor
  page++
}
console.log(`\n=== SHOPIFY BEST SELLERS — last 90 days (paid orders) ===\n`)
console.log('Handle                                       | Units | Revenue   | Title')
console.log('---------------------------------------------+-------+-----------+--------')
for (const x of [...m.values()].sort((a,b)=>b.revenue-a.revenue).slice(0,25)) {
  console.log(`${x.handle.padEnd(45)} | ${String(x.units).padStart(5)} | $${x.revenue.toFixed(0).padStart(8)} | ${x.title.slice(0,40)}`)
}
console.log(`\nTotal SKUs sold (90d): ${m.size}`)
console.log(`Total revenue (90d): $${[...m.values()].reduce((s,x)=>s+x.revenue,0).toFixed(0)}`)
process.exit(0)
