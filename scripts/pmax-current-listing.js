import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const c = getGadsCustomer()
const AG_ID = 6500812492  // All Products asset group

console.log(`\n=== "All Products" Listing Group Structure ===\n`)
try {
  const rows = await c.query(`SELECT asset_group_listing_group_filter.id, asset_group_listing_group_filter.parent_listing_group_filter, asset_group_listing_group_filter.type, asset_group_listing_group_filter.path FROM asset_group_listing_group_filter WHERE asset_group.id=${AG_ID}`)
  if (!rows.length) console.log('  No listing group filters found — campaign serves ENTIRE feed by default')
  for (const r of rows) {
    const f = r.asset_group_listing_group_filter
    console.log(`  Filter ${f?.id}: type=${f?.type} parent=${f?.parent_listing_group_filter||'ROOT'} path=${JSON.stringify(f?.path).slice(0,150)}`)
  }
} catch(e) { console.log(`  ERR: ${e?.errors?.[0]?.message?.slice(0,120)}`) }

// Top performers (ROAS based)
console.log(`\n=== TOP 15 PERFORMERS by ROAS (90 days, min 10 imp) ===`)
const end = new Date().toISOString().slice(0,10)
const start = new Date(Date.now()-90*86400000).toISOString().slice(0,10)
const sk = await c.query(`SELECT campaign.id, segments.product_item_id, segments.product_title, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM shopping_performance_view WHERE campaign.id=21113841118 AND segments.date BETWEEN '${start}' AND '${end}'`)
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
const all = [...m.values()].filter(x => x.imp >= 100 && x.sp >= 5)
const top = all.sort((a,b)=>(b.val/Math.max(b.sp,1))-(a.val/Math.max(a.sp,1))).slice(0,15)
console.log('Spend  | Imp     | Conv | Revenue | ROAS    | Product')
for (const x of top) {
  const roas = x.sp?(x.val/x.sp).toFixed(2):'-'
  console.log(`  $${x.sp.toFixed(0).padStart(4)} | ${x.imp.toString().padStart(6)} | ${x.conv.toFixed(0).padStart(4)} | $${x.val.toFixed(0).padStart(5)} | ${roas.padStart(5)}x  | ${(x.title||'').slice(0,55)}`)
}

console.log(`\n=== BOTTOM 15 PERFORMERS by ROAS (>$30 spent, low ROAS) ===`)
const bottom = all.filter(x => x.sp >= 30).sort((a,b)=>(a.val/Math.max(a.sp,1))-(b.val/Math.max(b.sp,1))).slice(0,15)
for (const x of bottom) {
  const roas = x.sp?(x.val/x.sp).toFixed(2):'-'
  console.log(`  $${x.sp.toFixed(0).padStart(4)} | ${x.imp.toString().padStart(6)} | ${x.conv.toFixed(0).padStart(4)} | $${x.val.toFixed(0).padStart(5)} | ${roas.padStart(5)}x  | ${(x.title||'').slice(0,55)}`)
}

process.exit(0)
