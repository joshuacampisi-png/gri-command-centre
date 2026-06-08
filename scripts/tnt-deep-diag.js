import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const c = getGadsCustomer()

console.log(`\n=== TNT DEEP DIAGNOSTIC ===\n`)

// 1. Pull TNT weekly performance for 180 days to find the real inflection point
const start = new Date(Date.now()-180*86400000).toISOString().slice(0,10)
const end = new Date().toISOString().slice(0,10)
console.log(`--- 1. TNT weekly performance ${start} → ${end} ---`)
const rows = await c.query(`SELECT segments.week, segments.product_title, segments.product_item_id, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value, metrics.average_cpc FROM shopping_performance_view WHERE segments.date BETWEEN '${start}' AND '${end}'`)
const w = new Map()
for (const r of rows) {
  const title = r.segments?.productTitle || r.segments?.product_title || ''
  if (!/TNT/i.test(title)) continue
  const wk = r.segments?.week
  const cur = w.get(wk) || { imp:0, clk:0, sp:0, conv:0, val:0 }
  cur.imp += Number(r.metrics?.impressions||0)
  cur.clk += Number(r.metrics?.clicks||0)
  cur.sp += Number(r.metrics?.cost_micros||0)/1e6
  cur.conv += Number(r.metrics?.conversions||0)
  cur.val += Number(r.metrics?.conversions_value||0)
  w.set(wk, cur)
}
console.log('Week-of   | Imp   | Clk | Spend | CTR  | CPC  | Conv | Rev   | CVR  | ROAS')
for (const [wk,x] of [...w.entries()].sort()) {
  const ctr = x.imp?(x.clk/x.imp*100).toFixed(1):'-'
  const cpc = x.clk?(x.sp/x.clk).toFixed(2):'-'
  const cvr = x.clk?(x.conv/x.clk*100).toFixed(1):'-'
  const roas = x.sp?(x.val/x.sp).toFixed(2):'-'
  console.log(`${wk?.slice(0,10)} | ${String(x.imp).padStart(5)} | ${String(x.clk).padStart(3)} | $${x.sp.toFixed(0).padStart(4)} | ${ctr.padStart(4)}% | $${cpc} | ${x.conv.toFixed(0).padStart(4)} | $${x.val.toFixed(0).padStart(4)} | ${cvr}% | ${roas}x`)
}

// 2. Distinct TNT product IDs serving and their inventory policy
console.log(`\n--- 2. ALL TNT product IDs serving in last 30d ---`)
const recent = await c.query(`SELECT segments.product_item_id, segments.product_title, metrics.impressions, metrics.conversions, metrics.conversions_value, metrics.cost_micros FROM shopping_performance_view WHERE segments.date BETWEEN '${new Date(Date.now()-30*86400000).toISOString().slice(0,10)}' AND '${end}'`)
const tntSkus = new Map()
for (const r of recent) {
  const title = r.segments?.productTitle || r.segments?.product_title || ''
  if (!/TNT/i.test(title)) continue
  const id = r.segments?.productItemId || r.segments?.product_item_id || '?'
  const cur = tntSkus.get(id) || { title, imp:0, sp:0, conv:0, val:0 }
  cur.imp += Number(r.metrics?.impressions||0)
  cur.sp += Number(r.metrics?.cost_micros||0)/1e6
  cur.conv += Number(r.metrics?.conversions||0)
  cur.val += Number(r.metrics?.conversions_value||0)
  if (!cur.title) cur.title = title
  tntSkus.set(id, cur)
}
for (const [id,x] of tntSkus) {
  const roas = x.sp?(x.val/x.sp).toFixed(2):'-'
  console.log(`  ${id} | ${x.imp.toString().padStart(5)}imp $${x.sp.toFixed(0)} ${x.conv.toFixed(0)}c $${x.val.toFixed(0)} ${roas}x | ${x.title.slice(0,55)}`)
}

// 3. Check the actual TNT product PDP / variants in Shopify
console.log(`\n--- 3. TNT Shopify product config ---`)
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
async function gql(q){const r=await fetch('https://bdd19a-3.myshopify.com/admin/api/2026-01/graphql.json',{method:'POST',headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query:q})});return r.json()}
const p = await gql(`{ productByHandle(handle:"tnt-gender-reveal-australia") { id title status tags tracksInventory totalInventory variants(first:5){edges{node{title price inventoryQuantity inventoryPolicy availableForSale}}} seo{title description} createdAt updatedAt } }`)
console.log(JSON.stringify(p.data?.productByHandle, null, 2))
process.exit(0)
