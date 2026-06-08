/**
 * Are the "bleeder" SKUs actually assist-converting?
 * Check: all conversions (incl assist) vs last-click conversions per SKU
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const c = getGadsCustomer()
const fmt = d => d.toISOString().slice(0,10)
const end = fmt(new Date(Date.now()-86400000))
const start = fmt(new Date(Date.now()-30*86400000))

const BLEEDERS = ['7515','7899','7487','7944','8145','8129','7919','7759']  // last 4 digits of item ids

console.log(`\n========== BLEEDER ASSIST-CONVERSION CHECK (${start}→${end}) ==========\n`)

// Pull conversions WITH assist (all_conversions includes assisted)
const rows = await c.query(`
  SELECT segments.product_item_id, segments.product_title,
         metrics.impressions, metrics.clicks, metrics.cost_micros,
         metrics.conversions, metrics.conversions_value,
         metrics.all_conversions, metrics.all_conversions_value
  FROM shopping_performance_view
  WHERE segments.date BETWEEN '${start}' AND '${end}'
`)
const agg = new Map()
for (const r of rows) {
  const id = r.segments?.productItemId || r.segments?.product_item_id || ''
  if (!BLEEDERS.some(b => id.includes(b))) continue
  const cur = agg.get(id) || { id, title:r.segments?.productTitle||r.segments?.product_title||'', imp:0, clk:0, sp:0, lc_conv:0, lc_val:0, all_conv:0, all_val:0, vt:0, xd:0 }
  cur.imp     += Number(r.metrics?.impressions||0)
  cur.clk     += Number(r.metrics?.clicks||0)
  cur.sp      += Number(r.metrics?.cost_micros||0)/1e6
  cur.lc_conv += Number(r.metrics?.conversions||0)
  cur.lc_val  += Number(r.metrics?.conversions_value||0)
  cur.all_conv+= Number(r.metrics?.all_conversions||0)
  cur.all_val += Number(r.metrics?.all_conversions_value||0)
  cur.vt      += Number(r.metrics?.view_through_conversions||0)
  cur.xd      += Number(r.metrics?.cross_device_conversions||0)
  agg.set(id, cur)
}

console.log('SKU                    | Imp   | Clk | Spend | LastClick    | AllConv (incl assist) | View-Thru | True ROAS')
console.log('-----------------------+-------+-----+-------+--------------+----------------------+-----------+----------')
for (const x of [...agg.values()].sort((a,b)=>b.imp-a.imp)) {
  const lc_roas = x.sp ? (x.lc_val/x.sp).toFixed(2) : '-'
  const all_roas = x.sp ? (x.all_val/x.sp).toFixed(2) : '-'
  const title = (x.title||'').slice(0,30)
  console.log(`${x.id.padEnd(22)} | ${String(x.imp).padStart(5)} | ${String(x.clk).padStart(3)} | $${x.sp.toFixed(0).padStart(4)} | ${x.lc_conv.toFixed(1)}c $${x.lc_val.toFixed(0)} (${lc_roas}x) | ${x.all_conv.toFixed(1)}c $${x.all_val.toFixed(0)} (${all_roas}x) | ${x.vt.toFixed(0)} | ${all_roas}x`)
  console.log(`  → ${title}`)
}

console.log(`\n========== ACCOUNT-WIDE ASSIST RATIO ==========`)
// What % of all our revenue comes from assist vs last-click?
const totalRows = await c.query(`
  SELECT metrics.conversions, metrics.conversions_value,
         metrics.all_conversions, metrics.all_conversions_value
  FROM shopping_performance_view
  WHERE segments.date BETWEEN '${start}' AND '${end}'
`)
let lc_val=0, all_val=0, lc_conv=0, all_conv=0
for (const r of totalRows) {
  lc_val += Number(r.metrics?.conversions_value||0)
  all_val += Number(r.metrics?.all_conversions_value||0)
  lc_conv += Number(r.metrics?.conversions||0)
  all_conv += Number(r.metrics?.all_conversions||0)
}
console.log(`Last-click  : ${lc_conv.toFixed(0)} conv, $${lc_val.toFixed(0)} value`)
console.log(`All-conv    : ${all_conv.toFixed(0)} conv, $${all_val.toFixed(0)} value`)
console.log(`Assist lift : ${((all_val-lc_val)/lc_val*100).toFixed(0)}% extra value from assist/view-through/cross-device`)

process.exit(0)
