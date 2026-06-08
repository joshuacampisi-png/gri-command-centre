/**
 * STANDARD SHOPPING CAMPAIGN PREP — read-only research
 * Pulls everything needed to build the campaign Monday:
 *  - Merchant Center ID linked to this Ads account
 *  - Top-performing SKUs that match the 4 head queries
 *  - Existing custom_label_0..4 usage (to pick a free slot)
 *  - PMAX campaign IDs (to add the "gender reveal ideas" negative on)
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const c = getGadsCustomer()
const fmt = d => d.toISOString().slice(0,10)
const end = fmt(new Date(Date.now()-86400000))
const start = fmt(new Date(Date.now()-30*86400000))

// 1. Merchant Center link
console.log(`\n=== MERCHANT CENTER LINKS ===`)
try {
  const links = await c.query(`SELECT merchant_center_link.id, merchant_center_link.merchant_center_id, merchant_center_link.status, merchant_center_link.merchant_center_account_name FROM merchant_center_link`)
  for (const r of links) console.log(JSON.stringify(r,null,2))
} catch (e) {
  // Try alternative
  try {
    const list = await c.query(`SELECT customer.id FROM customer`)
    console.log('customer:', list[0])
  } catch {}
  console.log(`merchant_center_link err: ${e?.errors?.[0]?.message}`)
}

// 2. PMAX campaign IDs for adding negatives
console.log(`\n=== ENABLED PMAX CAMPAIGNS (negative targets) ===`)
const pmax = await c.query(`SELECT campaign.id, campaign.name FROM campaign WHERE campaign.status='ENABLED' AND campaign.advertising_channel_type='PERFORMANCE_MAX'`)
for (const r of pmax) console.log(`  ${r.campaign?.id} — ${r.campaign?.name}`)

// 3. Top SKUs that match the 4 head queries (smoke bombs, cannons, extinguisher, ideas)
console.log(`\n=== CANDIDATE SKUs FOR HEAD-QUERY DOMINATION (top by ROAS, 30d) ===`)
const skus = await c.query(`
  SELECT segments.product_item_id, segments.product_title,
         metrics.impressions, metrics.clicks, metrics.cost_micros,
         metrics.conversions, metrics.conversions_value
  FROM shopping_performance_view
  WHERE segments.date BETWEEN '${start}' AND '${end}'
`)
const m = new Map()
for (const r of skus) {
  const id = r.segments?.productItemId || r.segments?.product_item_id || ''
  const t = r.segments?.productTitle || r.segments?.product_title || ''
  const cur = m.get(id) || { id, title:t, imp:0, clk:0, sp:0, conv:0, val:0 }
  cur.imp+=Number(r.metrics?.impressions||0)
  cur.clk+=Number(r.metrics?.clicks||0)
  cur.sp+=Number(r.metrics?.cost_micros||0)/1e6
  cur.conv+=Number(r.metrics?.conversions||0)
  cur.val+=Number(r.metrics?.conversions_value||0)
  if (!cur.title && t) cur.title=t
  m.set(id,cur)
}
// Filter to head-query relevant (smoke/cannon/extinguisher/burnout/bundle/ideas-style)
const HEAD_PATTERNS = /smoke bomb|smoke|cannon|extinguish|powder blaster|blaster|burnout|bundle/i
const candidates = [...m.values()].filter(x => HEAD_PATTERNS.test(x.title))
  .map(x => ({ ...x, roas: x.sp ? x.val/x.sp : 0 }))
  .filter(x => x.imp >= 1000)  // proven volume
  .sort((a,b) => b.roas - a.roas)

console.log('Item ID                                    | Imp    | Spend | ROAS  | Title')
console.log('-------------------------------------------+--------+-------+-------+--------')
for (const x of candidates.slice(0, 20)) {
  console.log(`${x.id.padEnd(42)} | ${String(x.imp).padStart(6)} | $${x.sp.toFixed(0).padStart(4)} | ${x.roas.toFixed(2).padStart(5)}x | ${(x.title||'').slice(0,55)}`)
}

console.log(`\n=== TOP 10 CANDIDATES (recommended for Standard Shopping campaign) ===`)
for (const x of candidates.slice(0,10)) {
  console.log(`  ✓ ${x.id} | ${x.roas.toFixed(2)}x | ${(x.title||'').slice(0,60)}`)
}
process.exit(0)
