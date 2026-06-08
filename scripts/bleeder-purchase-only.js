/**
 * TRIPLE-CHECK: Are the assist numbers inflated by non-purchase conv actions?
 * Strip to PURCHASE-only conversions per SKU.
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const c = getGadsCustomer()
const fmt = d => d.toISOString().slice(0,10)
const end = fmt(new Date(Date.now()-86400000))
const start = fmt(new Date(Date.now()-30*86400000))

// 1. List all conversion actions to see what's being counted
console.log(`\n========== CONVERSION ACTIONS CONFIGURED ==========`)
const actions = await c.query(`
  SELECT conversion_action.id, conversion_action.name, conversion_action.category,
         conversion_action.status, conversion_action.primary_for_goal,
         conversion_action.include_in_conversions_metric
  FROM conversion_action
`)
for (const a of actions) {
  const ca = a.conversionAction || a.conversion_action
  if (!ca) continue
  console.log(`  [${ca.status}] inConv:${ca.includeInConversionsMetric || ca.include_in_conversions_metric} | cat:${ca.category} | ${ca.name}`)
}

// 2. Per-SKU breakdown by conversion ACTION (segment by conversion_action)
console.log(`\n========== PER-SKU CONVERSIONS BY ACTION ==========`)
const CUT_SKUS = ['7899285848153','7944311603289','7919077359705','7487467880537','8145211031641']  // poke ball, DIY smoke box, toy story, 148pc balloon, DIY garland
const NAMES = {
  '7899285848153':'Poké Ball',
  '7944311603289':'DIY Smoke Box',
  '7919077359705':'Toy Story',
  '7487467880537':'148pc Balloon Kit',
  '8145211031641':'DIY Balloon Garland'
}

const rows = await c.query(`
  SELECT segments.product_item_id, segments.conversion_action_name,
         metrics.all_conversions, metrics.all_conversions_value,
         metrics.conversions, metrics.conversions_value
  FROM shopping_performance_view
  WHERE segments.date BETWEEN '${start}' AND '${end}'
`)
const byProductAction = new Map()
for (const r of rows) {
  const pid = r.segments?.productItemId || r.segments?.product_item_id || ''
  const matchedSku = CUT_SKUS.find(s => pid.includes(s))
  if (!matchedSku) continue
  const action = r.segments?.conversionActionName || r.segments?.conversion_action_name || 'unknown'
  const k = `${matchedSku}||${action}`
  const cur = byProductAction.get(k) || { sku:matchedSku, action, all_conv:0, all_val:0, lc_conv:0, lc_val:0 }
  cur.all_conv += Number(r.metrics?.all_conversions||0)
  cur.all_val  += Number(r.metrics?.all_conversions_value||0)
  cur.lc_conv  += Number(r.metrics?.conversions||0)
  cur.lc_val   += Number(r.metrics?.conversions_value||0)
  byProductAction.set(k, cur)
}

for (const sku of CUT_SKUS) {
  console.log(`\n--- ${NAMES[sku]} (${sku}) ---`)
  const rowsForSku = [...byProductAction.values()].filter(x=>x.sku===sku).sort((a,b)=>b.all_val-a.all_val)
  if (!rowsForSku.length) { console.log('  no data'); continue }
  let totalPurchase = 0, totalNonPurchase = 0
  for (const x of rowsForSku) {
    const isPurchase = /purchase|shopify.*purchase/i.test(x.action)
    if (isPurchase) totalPurchase += x.all_val
    else totalNonPurchase += x.all_val
    console.log(`  ${x.action.padEnd(45)} all:${x.all_conv.toFixed(0).padStart(4)}c $${x.all_val.toFixed(0).padStart(5)} | lc:${x.lc_conv.toFixed(0)}c $${x.lc_val.toFixed(0)} ${isPurchase?'★ PURCHASE':''}`)
  }
  console.log(`  TOTAL: purchase-only $${totalPurchase.toFixed(0)}  vs  non-purchase $${totalNonPurchase.toFixed(0)}`)
}

// 3. Account-wide same split
console.log(`\n========== ACCOUNT-WIDE: PURCHASE vs OTHER ==========`)
const acct = new Map()
for (const r of rows) {
  const action = r.segments?.conversionActionName || r.segments?.conversion_action_name || 'unknown'
  const cur = acct.get(action) || { all_conv:0, all_val:0, lc_conv:0, lc_val:0 }
  cur.all_conv += Number(r.metrics?.all_conversions||0)
  cur.all_val  += Number(r.metrics?.all_conversions_value||0)
  cur.lc_conv  += Number(r.metrics?.conversions||0)
  cur.lc_val   += Number(r.metrics?.conversions_value||0)
  acct.set(action, cur)
}
for (const [name,x] of [...acct.entries()].sort((a,b)=>b[1].all_val-a[1].all_val)) {
  console.log(`  ${name.padEnd(45)} all:${x.all_conv.toFixed(0).padStart(6)}c $${x.all_val.toFixed(0).padStart(6)} | lc:${x.lc_conv.toFixed(0).padStart(4)}c $${x.lc_val.toFixed(0)}`)
}

process.exit(0)
