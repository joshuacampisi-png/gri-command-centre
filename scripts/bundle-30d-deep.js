/**
 * 30-day SKU-level bundle perf with view-through (all_conversions) included
 * — only call something a "true bleeder" if 30d: spend > $50 AND last-click conv = 0 AND all-conv-value <2x spend
 * — only call something a "true winner" if 30d: conv >= 5 AND ROAS >= 3x
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'

const customer = getGadsCustomer()
const rows = await customer.query(`
  SELECT segments.product_item_id, segments.product_title,
         metrics.impressions, metrics.clicks, metrics.cost_micros,
         metrics.conversions, metrics.conversions_value,
         metrics.all_conversions, metrics.all_conversions_value
  FROM shopping_performance_view
  WHERE segments.date DURING LAST_30_DAYS
`)

const byProd = new Map()
for (const r of rows) {
  const title = r.segments?.product_title || ''
  if (!title) continue
  if (!byProd.has(title)) byProd.set(title, { title, imp:0, clk:0, spend:0, conv:0, value:0, allConv:0, allValue:0, vtc:0 })
  const x = byProd.get(title)
  x.imp += Number(r.metrics?.impressions||0)
  x.clk += Number(r.metrics?.clicks||0)
  x.spend += Number(r.metrics?.cost_micros||0)/1e6
  x.conv += Number(r.metrics?.conversions||0)
  x.value += Number(r.metrics?.conversions_value||0)
  x.allConv += Number(r.metrics?.all_conversions||0)
  x.allValue += Number(r.metrics?.all_conversions_value||0)
}

// Filter to bundles
const isBundle = t => /bundle|pack|combo|kit|2x|2 pack|3 pack|4 pack/i.test(t)
const bundles = [...byProd.values()].filter(p => isBundle(p.title)).sort((a,b)=>b.spend-a.spend)

console.log('\n=== 30-DAY BUNDLE SKU DEEP DIVE (last-click + view-through) ===\n')
console.log(`${bundles.length} bundle SKUs with Shopping activity in last 30d\n`)
console.log('Spend | Imp   | Clk | LC-Conv | LC-Rev | All-Conv | All-Rev | LC-ROAS | All-ROAS | Title')
console.log('-'.repeat(140))
for (const p of bundles.slice(0,40)) {
  const lcRoas = p.spend>0 ? (p.value/p.spend).toFixed(2)+'x' : '—'
  const allRoas = p.spend>0 ? (p.allValue/p.spend).toFixed(2)+'x' : '—'
  console.log(`$${p.spend.toFixed(0).padStart(4)} | ${String(p.imp).padStart(5)} | ${String(p.clk).padStart(3)} | ${p.conv.toFixed(1).padStart(7)} | $${p.value.toFixed(0).padStart(5)} | ${p.allConv.toFixed(1).padStart(8)} | $${p.allValue.toFixed(0).padStart(6)} | ${lcRoas.padStart(7)} | ${allRoas.padStart(8)} | ${p.title.slice(0,60)}`)
}

// True bleeders: 30d spend > $50 AND last-click conv = 0 AND all-conv value < 2x spend
const trueBleeders = bundles.filter(p => p.spend > 50 && p.conv < 0.5 && p.allValue < p.spend * 2)
console.log(`\n=== TRUE BLEEDERS (30d spend >$50, LC conv ~0, all-conv-value < 2x spend) ===\n`)
if (trueBleeders.length === 0) console.log('  None — every high-spend bundle has either direct conv OR meaningful view-through value.')
for (const p of trueBleeders.sort((a,b)=>b.spend-a.spend)) {
  console.log(`  $${p.spend.toFixed(0).padStart(4)} spend | ${p.imp} imp | ${p.conv.toFixed(1)} LC conv | $${p.allValue.toFixed(0)} all-conv value | ${p.title.slice(0,70)}`)
}

// True winners
const trueWinners = bundles.filter(p => p.conv >= 5 && p.spend>0 && (p.value/p.spend) >= 3).sort((a,b)=>b.value-a.value)
console.log(`\n=== TRUE WINNERS (30d conv ≥5, LC ROAS ≥3x) ===\n`)
for (const p of trueWinners.slice(0,10)) {
  const r = (p.value/p.spend).toFixed(2)+'x'
  console.log(`  ${r.padStart(6)} ROAS | $${p.spend.toFixed(0).padStart(4)} → $${p.value.toFixed(0).padStart(5)} | ${p.conv.toFixed(1)} conv | ${p.title.slice(0,70)}`)
}

// Summary totals
const totSpend = bundles.reduce((s,p)=>s+p.spend,0)
const totVal = bundles.reduce((s,p)=>s+p.value,0)
const totAllVal = bundles.reduce((s,p)=>s+p.allValue,0)
console.log(`\n30d totals across all bundle SKUs: $${totSpend.toFixed(0)} spend | $${totVal.toFixed(0)} LC rev (${(totVal/totSpend).toFixed(2)}x) | $${totAllVal.toFixed(0)} all-conv rev (${(totAllVal/totSpend).toFixed(2)}x)`)
process.exit(0)
