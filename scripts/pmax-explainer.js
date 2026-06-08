/**
 * Explain PMAX All Products visually
 * 1. Which products are inside (by spend last 30d)
 * 2. Asset group creative inventory (headlines/descriptions/images/videos)
 * 3. Where the ads appear (placement performance)
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const c = getGadsCustomer()
const PMAX_ID = 21113841118
const end = new Date().toISOString().slice(0,10)
const start = new Date(Date.now()-30*86400000).toISOString().slice(0,10)

console.log(`\n=== PMAX | All Products (${PMAX_ID}) ===\n`)

// 1. Top products spending in this campaign last 30d
console.log('--- TOP 15 PRODUCTS by Shopping spend (30d) ---')
const sk = await c.query(`SELECT campaign.id, segments.product_item_id, segments.product_title, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM shopping_performance_view WHERE campaign.id=${PMAX_ID} AND segments.date BETWEEN '${start}' AND '${end}'`)
const m = new Map()
for (const r of sk) {
  const id = r.segments?.productItemId || r.segments?.product_item_id || ''
  const t = r.segments?.productTitle || r.segments?.product_title || ''
  const cur = m.get(id) || { id, title:t, imp:0, clk:0, sp:0, conv:0, val:0 }
  cur.imp+=Number(r.metrics?.impressions||0); cur.clk+=Number(r.metrics?.clicks||0)
  cur.sp+=Number(r.metrics?.cost_micros||0)/1e6; cur.conv+=Number(r.metrics?.conversions||0); cur.val+=Number(r.metrics?.conversions_value||0)
  if (!cur.title && t) cur.title = t
  m.set(id,cur)
}
const top = [...m.values()].sort((a,b)=>b.sp-a.sp).slice(0,15)
for (const x of top) {
  const cvr = x.clk?(x.conv/x.clk*100).toFixed(1):'-'
  const roas = x.sp?(x.val/x.sp).toFixed(2):'-'
  console.log(`  $${x.sp.toFixed(0).padStart(4)} ${x.imp.toString().padStart(5)}imp ${x.clk.toString().padStart(3)}clk ${cvr}%CVR ${roas}x | ${(x.title||'').slice(0,55)}`)
}
console.log(`\nTotal unique SKUs served from PMAX | All Products (30d): ${m.size}`)
console.log(`Total spend: $${[...m.values()].reduce((s,x)=>s+x.sp,0).toFixed(0)}`)
console.log(`Total revenue: $${[...m.values()].reduce((s,x)=>s+x.val,0).toFixed(0)}`)

// 2. Asset Groups inside the campaign
console.log(`\n--- ASSET GROUPS in this campaign ---`)
const ags = await c.query(`SELECT asset_group.id, asset_group.name, asset_group.status FROM asset_group WHERE campaign.id=${PMAX_ID}`)
for (const r of ags) {
  const ag = r.asset_group||r.assetGroup
  console.log(`  AG ${ag?.id} [status=${ag?.status===2?'ENABLED':'PAUSED'}] ${ag?.name}`)
}

// 3. Creative assets count per type — for the enabled "All Products" asset group (6500812492)
console.log(`\n--- CREATIVE INVENTORY — "All Products" AG (6500812492) ---`)
try {
  const assets = await c.query(`SELECT asset_group_asset.asset, asset_group_asset.field_type, asset_group_asset.status FROM asset_group_asset WHERE asset_group.id=6500812492`)
  const byType = {}
  for (const r of assets) {
    const t = r.asset_group_asset?.field_type
    byType[t] = (byType[t]||0)+1
  }
  for (const [type,count] of Object.entries(byType)) console.log(`  ${type}: ${count}`)
} catch(e) { console.log(`  ERR: ${e?.errors?.[0]?.message?.slice(0,60)}`) }

// 4. Placement / Network breakdown
console.log(`\n--- WHERE THE ADS APPEARED (30d, where data available) ---`)
try {
  // Use metrics segment by advertising_channel_sub_type
  const placement = await c.query(`SELECT segments.ad_network_type, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM campaign WHERE campaign.id=${PMAX_ID} AND segments.date BETWEEN '${start}' AND '${end}'`)
  const byNet = {}
  for (const r of placement) {
    const n = r.segments?.adNetworkType || r.segments?.ad_network_type || 'unknown'
    const cur = byNet[n] || {imp:0,clk:0,sp:0,conv:0}
    cur.imp+=Number(r.metrics?.impressions||0); cur.clk+=Number(r.metrics?.clicks||0)
    cur.sp+=Number(r.metrics?.cost_micros||0)/1e6; cur.conv+=Number(r.metrics?.conversions||0)
    byNet[n] = cur
  }
  const NAMES = {2:'Google Search',3:'Search Partners',4:'Display Network',5:'YouTube Search',6:'YouTube Watch',7:'Mixed/Cross-Network',8:'Google TV'}
  for (const [n,x] of Object.entries(byNet).sort((a,b)=>b[1].sp-a[1].sp)) {
    const label = NAMES[n] || n
    console.log(`  ${label.padEnd(22)} | ${x.imp.toString().padStart(6)}imp ${x.clk.toString().padStart(4)}clk $${x.sp.toFixed(0).padStart(4)} | ${x.conv.toFixed(0)}c`)
  }
} catch(e) { console.log(`  ERR: ${e?.errors?.[0]?.message?.slice(0,60)}`) }

process.exit(0)
