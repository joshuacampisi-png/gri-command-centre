import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const c = getGadsCustomer()

// Find TNT campaign
const camps = await c.query(`SELECT campaign.id, campaign.name, campaign.status FROM campaign WHERE campaign.name LIKE '%TNT%'`)
console.log(`\n=== TNT CAMPAIGNS ===`)
for (const r of camps) {
  const status = r.campaign?.status===2?'ENABLED':r.campaign?.status===3?'PAUSED':r.campaign?.status===4?'REMOVED':r.campaign?.status
  console.log(`  ${r.campaign?.id} [${status}] ${r.campaign?.name}`)
}

// Pull lifetime data for any TNT campaign
console.log(`\n=== TNT CAMPAIGN LIFETIME PERFORMANCE ===`)
for (const cmp of camps) {
  const id = cmp.campaign?.id
  const end = new Date().toISOString().slice(0,10)
  const start = new Date(Date.now()-365*86400000).toISOString().slice(0,10)
  const rows = await c.query(`SELECT segments.month, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM campaign WHERE campaign.id=${id} AND segments.date BETWEEN '${start}' AND '${end}' ORDER BY segments.month`)
  let tImp=0,tClk=0,tSp=0,tConv=0,tVal=0
  let months = []
  for (const r of rows) {
    const imp = Number(r.metrics?.impressions||0)
    if (imp===0) continue
    const clk = Number(r.metrics?.clicks||0)
    const sp = Number(r.metrics?.cost_micros||0)/1e6
    const conv = Number(r.metrics?.conversions||0)
    const val = Number(r.metrics?.conversions_value||0)
    tImp+=imp; tClk+=clk; tSp+=sp; tConv+=conv; tVal+=val
    months.push({m:r.segments?.month,imp,clk,sp,conv,val})
  }
  console.log(`\n--- ${cmp.campaign?.name} (${id}) ---`)
  if (!months.length) { console.log(`  NEVER SERVED (no data in last 365d)`); continue }
  console.log('Month       | Imp   | Clk | Spend | Conv | Value | ROAS')
  for (const m of months) {
    const roas = m.sp?(m.val/m.sp).toFixed(2):'-'
    console.log(`${m.m?.slice(0,10)} | ${String(m.imp).padStart(5)} | ${String(m.clk).padStart(3)} | $${m.sp.toFixed(0).padStart(4)} | ${m.conv.toFixed(0).padStart(4)} | $${m.val.toFixed(0).padStart(4)} | ${roas}x`)
  }
  console.log(`-- TOTAL: ${tImp.toLocaleString()}imp ${tClk}clk $${tSp.toFixed(0)} ${tConv.toFixed(0)}c $${tVal.toFixed(0)} val | ${tSp?(tVal/tSp).toFixed(2):'-'}x ROAS`)
}

// SKU-level: TNT product over time
console.log(`\n=== TNT SELF HIRE SKU — last 180d (all campaigns combined) ===`)
const skuStart = new Date(Date.now()-180*86400000).toISOString().slice(0,10)
const skuEnd = new Date().toISOString().slice(0,10)
const sku = await c.query(`SELECT campaign.id, segments.month, segments.product_item_id, segments.product_title, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM shopping_performance_view WHERE segments.date BETWEEN '${skuStart}' AND '${skuEnd}'`)
const byMonth = new Map()
let tntTotalSp=0, tntTotalVal=0, tntTotalConv=0, tntTotalImp=0
for (const r of sku) {
  const title = r.segments?.productTitle || r.segments?.product_title || ''
  if (!/TNT/i.test(title)) continue
  const m = r.segments?.month
  const cur = byMonth.get(m) || { imp:0, sp:0, conv:0, val:0 }
  cur.imp += Number(r.metrics?.impressions||0)
  cur.sp += Number(r.metrics?.cost_micros||0)/1e6
  cur.conv += Number(r.metrics?.conversions||0)
  cur.val += Number(r.metrics?.conversions_value||0)
  byMonth.set(m, cur)
  tntTotalImp += Number(r.metrics?.impressions||0)
  tntTotalSp += Number(r.metrics?.cost_micros||0)/1e6
  tntTotalConv += Number(r.metrics?.conversions||0)
  tntTotalVal += Number(r.metrics?.conversions_value||0)
}
console.log('Month       | Imp    | Spend | Conv | Revenue | ROAS')
for (const [m,x] of [...byMonth.entries()].sort()) {
  const roas = x.sp?(x.val/x.sp).toFixed(2):'-'
  console.log(`${m?.slice(0,10)} | ${String(x.imp).padStart(6)} | $${x.sp.toFixed(0).padStart(4)} | ${x.conv.toFixed(0).padStart(4)} | $${x.val.toFixed(0).padStart(5)} | ${roas}x`)
}
console.log(`-- 180d TOTAL: ${tntTotalImp.toLocaleString()}imp $${tntTotalSp.toFixed(0)} ${tntTotalConv.toFixed(0)}c $${tntTotalVal.toFixed(0)} val | ${tntTotalSp?(tntTotalVal/tntTotalSp).toFixed(2):'-'}x ROAS`)

// Shopify revenue TNT
const SHOPIFY_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
async function gql(q){const r=await fetch('https://bdd19a-3.myshopify.com/admin/api/2026-01/graphql.json',{method:'POST',headers:{'X-Shopify-Access-Token':SHOPIFY_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query:q})});return r.json()}
const SINCE = new Date(Date.now()-180*86400000).toISOString().slice(0,10)
let cursor = null, tntUnits = 0, tntRev = 0
for (let i=0;i<10;i++) {
  const r = await gql(`{ orders(first:100, query:"created_at:>=${SINCE} financial_status:paid sku:TNT*"${cursor?`,after:"${cursor}"`:''}) { edges{cursor node{ name lineItems(first:30){edges{node{title quantity originalUnitPriceSet{shopMoney{amount}}}}}}} pageInfo{hasNextPage} } }`)
  const edges = r.data?.orders?.edges||[]
  for (const e of edges) {
    for (const li of e.node.lineItems?.edges||[]) {
      if (/TNT/i.test(li.node.title)) {
        tntUnits += li.node.quantity
        tntRev += li.node.quantity * parseFloat(li.node.originalUnitPriceSet?.shopMoney?.amount||'0')
      }
    }
  }
  if (!r.data?.orders?.pageInfo?.hasNextPage) break
  cursor = edges[edges.length-1].cursor
}
console.log(`\n=== TNT SHOPIFY REVENUE (last 180d, paid orders) ===`)
console.log(`Units sold: ${tntUnits} | Revenue: $${tntRev.toFixed(0)}`)
process.exit(0)
