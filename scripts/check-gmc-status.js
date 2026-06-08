/**
 * Check Google Merchant Center status via Google Ads API
 *  1. Linked Merchant Center accounts
 *  2. Product count active 7 days ago vs now (did product count drop?)
 *  3. Top-spending products that suddenly stopped serving
 *  4. Products with high impressions previously, zero now (disapproval signal)
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
const customer = getGadsCustomer()

// 1. Linked Merchant Center
console.log('\n=== 1. MERCHANT CENTER LINKS ===\n')
try {
  const links = await customer.query(`
    SELECT merchant_center_link.id, merchant_center_link.merchant_center_account_id,
           merchant_center_link.merchant_center_account_name, merchant_center_link.status
    FROM merchant_center_link
  `)
  for (const l of links) {
    console.log(`  MC ID: ${l.merchant_center_link?.merchant_center_account_id}`)
    console.log(`    Name: ${l.merchant_center_link?.merchant_center_account_name}`)
    console.log(`    Status: ${l.merchant_center_link?.status}`)
  }
  if (!links.length) console.log('  No linked Merchant Center accounts.')
} catch(e) {
  console.log('  err:', e.errors?.[0]?.message || e.message)
}

// 2. Active product count by date — last 14 days
console.log('\n=== 2. ACTIVE PRODUCT COUNT (unique product IDs serving per day) ===\n')
try {
  const rows = await customer.query(`
    SELECT segments.date, segments.product_item_id
    FROM shopping_performance_view
    WHERE segments.date DURING LAST_14_DAYS
      AND metrics.impressions > 0
  `)
  // Bucket by date
  const byDay = new Map()
  for (const r of rows) {
    const date = r.segments?.date
    const id = r.segments?.product_item_id
    if (!date || !id) continue
    if (!byDay.has(date)) byDay.set(date, new Set())
    byDay.get(date).add(id)
  }
  const sorted = [...byDay.entries()].sort()
  const dayName = ds => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(ds).getUTCDay()]
  console.log('Date       | Day | Unique products serving with ≥1 impression')
  console.log('-'.repeat(70))
  for (const [date, set] of sorted) {
    console.log(`${date} | ${dayName(date)} | ${set.size}`)
  }
  // Compute % change last 3 days vs prior 3 days
  if (sorted.length >= 6) {
    const recent = sorted.slice(-3).reduce((a,[_,s])=>a+s.size,0) / 3
    const prior  = sorted.slice(-6,-3).reduce((a,[_,s])=>a+s.size,0) / 3
    const delta  = prior > 0 ? ((recent - prior)/prior*100).toFixed(1) : '—'
    console.log(`\n  Avg unique products last 3 days: ${recent.toFixed(0)}`)
    console.log(`  Avg unique products prior 3 days: ${prior.toFixed(0)}`)
    console.log(`  Δ: ${delta}%`)
  }
} catch(e) {
  console.log('  err:', e.errors?.[0]?.message || e.message)
}

// 3. Products that had high impressions before and stopped serving (disapproval signal)
console.log('\n=== 3. PRODUCTS THAT STOPPED SERVING (had impressions 7-14d ago, zero last 3d) ===\n')
try {
  const rowsPrior = await customer.query(`
    SELECT segments.product_item_id, segments.product_title, metrics.impressions
    FROM shopping_performance_view
    WHERE segments.date BETWEEN '2026-05-15' AND '2026-05-21'
      AND metrics.impressions > 100
  `)
  const priorMap = new Map()
  for (const r of rowsPrior) {
    const id = r.segments?.product_item_id || ''
    const title = r.segments?.product_title || ''
    if (!id) continue
    if (!priorMap.has(id)) priorMap.set(id, { title, imp: 0 })
    priorMap.get(id).imp += Number(r.metrics?.impressions||0)
  }
  // Now check who has zero impressions last 3 days
  const rowsRecent = await customer.query(`
    SELECT segments.product_item_id, metrics.impressions
    FROM shopping_performance_view
    WHERE segments.date BETWEEN '2026-05-25' AND '2026-05-27'
  `)
  const recentMap = new Map()
  for (const r of rowsRecent) {
    const id = r.segments?.product_item_id || ''
    if (!id) continue
    recentMap.set(id, (recentMap.get(id)||0) + Number(r.metrics?.impressions||0))
  }
  // Compare
  const dropped = []
  for (const [id, prior] of priorMap.entries()) {
    const recent = recentMap.get(id) || 0
    if (prior.imp > 200 && recent === 0) {
      dropped.push({ id, title: prior.title, priorImp: prior.imp })
    } else if (prior.imp > 500 && recent < prior.imp * 0.1) {
      dropped.push({ id, title: prior.title, priorImp: prior.imp, recentImp: recent, note: 'severe-drop' })
    }
  }
  dropped.sort((a,b)=>b.priorImp - a.priorImp)
  if (!dropped.length) console.log('  No products dropped from serving. Feed appears healthy.')
  else {
    console.log(`  ${dropped.length} products had impressions 7-14d ago but are now ${dropped.some(d=>d.note==='severe-drop')?'severely reduced or':''} zero:`)
    for (const d of dropped.slice(0,30)) {
      console.log(`    ${d.priorImp} imp prior → ${d.recentImp||0} imp now | ${d.title.slice(0,70)}`)
    }
  }
} catch(e) {
  console.log('  err:', e.errors?.[0]?.message || e.message)
}

// 4. Top-spending products by day for the last 7 days
console.log('\n=== 4. TOP 10 SHOPPING PRODUCTS LAST 7 DAYS (by spend) ===\n')
try {
  const rows = await customer.query(`
    SELECT segments.product_item_id, segments.product_title,
           metrics.impressions, metrics.clicks, metrics.cost_micros,
           metrics.conversions, metrics.conversions_value
    FROM shopping_performance_view
    WHERE segments.date DURING LAST_7_DAYS
  `)
  const agg = new Map()
  for (const r of rows) {
    const t = r.segments?.product_title || '?'
    if (!agg.has(t)) agg.set(t,{imp:0,clk:0,spend:0,conv:0,value:0})
    const x = agg.get(t)
    x.imp += Number(r.metrics?.impressions||0)
    x.clk += Number(r.metrics?.clicks||0)
    x.spend += Number(r.metrics?.cost_micros||0)/1e6
    x.conv += Number(r.metrics?.conversions||0)
    x.value += Number(r.metrics?.conversions_value||0)
  }
  const ranked = [...agg.entries()].sort((a,b)=>b[1].spend-a[1].spend).slice(0,15)
  console.log('Spend | Imp   | Clk | Conv | Rev    | ROAS  | Title')
  for (const [t,x] of ranked) {
    const roas = x.spend>0 ? (x.value/x.spend).toFixed(2)+'x' : '—'
    console.log(`$${x.spend.toFixed(0).padStart(4)} | ${String(x.imp).padStart(5)} | ${String(x.clk).padStart(3)} | ${x.conv.toFixed(1).padStart(4)} | $${x.value.toFixed(0).padStart(5)} | ${roas.padStart(5)} | ${t.slice(0,75)}`)
  }
} catch(e) {
  console.log('  err:', e.errors?.[0]?.message || e.message)
}

// 5. Recent change events specifically affecting product or feed
console.log('\n=== 5. RECENT GMC/PRODUCT-RELATED CHANGE EVENTS (last 14 days) ===\n')
try {
  const ch = await customer.query(`
    SELECT change_event.change_date_time, change_event.user_email,
           change_event.change_resource_type, change_event.resource_change_operation
    FROM change_event
    WHERE change_event.change_date_time DURING LAST_14_DAYS
    ORDER BY change_event.change_date_time DESC
    LIMIT 200
  `)
  const byType = new Map()
  for (const c of ch) {
    const t = String(c.change_event?.change_resource_type || c.change_event?.changeResourceType || '?')
    byType.set(t, (byType.get(t)||0)+1)
  }
  console.log('  Change events by resource type:')
  for (const [t,n] of [...byType.entries()].sort((a,b)=>b[1]-a[1])) {
    console.log(`    ${t.padEnd(40)} ${n}`)
  }
  console.log(`  Total events: ${ch.length}`)
} catch(e) { console.log('  err:', e.errors?.[0]?.message || e.message) }

process.exit(0)
