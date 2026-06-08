/**
 * Overnight + quick audit:
 * A. Last 24hr Google Ads performance
 * B. Per-campaign product overlap check (are products in the right PMAX campaigns?)
 * C. Quick structural audit: campaign settings, negative coverage, asset group health
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'

const customer = getGadsCustomer()

// ============== A. OVERNIGHT (May 25) ==============
console.log('\n═══════════════════════════════════════════════════════════════════')
console.log('  A. OVERNIGHT — May 25, 2026 (Monday)')
console.log('═══════════════════════════════════════════════════════════════════\n')

const overnight = await customer.query(`
  SELECT campaign.name, campaign.advertising_channel_type,
         metrics.cost_micros, metrics.clicks, metrics.impressions,
         metrics.conversions, metrics.conversions_value,
         metrics.all_conversions, metrics.all_conversions_value,
         metrics.ctr, metrics.average_cpc
  FROM campaign
  WHERE segments.date = '2026-05-25'
    AND campaign.status != 'REMOVED'
`)
let tot = {spend:0,clicks:0,imp:0,conv:0,value:0,allConv:0,allValue:0}
console.log('Campaign                              | Spend | Imp   | Clk | CTR   | CPC   | Conv | Rev   | ROAS')
console.log('-'.repeat(115))
for (const r of overnight.sort((a,b)=>Number(b.metrics?.cost_micros||0)-Number(a.metrics?.cost_micros||0))) {
  const spend = Number(r.metrics?.cost_micros||0)/1e6
  const clicks = Number(r.metrics?.clicks||0)
  const imp = Number(r.metrics?.impressions||0)
  const conv = Number(r.metrics?.conversions||0)
  const value = Number(r.metrics?.conversions_value||0)
  const ctr = imp>0 ? (clicks/imp*100).toFixed(2)+'%' : '—'
  const cpc = clicks>0 ? '$'+(spend/clicks).toFixed(2) : '—'
  const roas = spend>0 ? (value/spend).toFixed(2)+'x' : '—'
  tot.spend+=spend; tot.clicks+=clicks; tot.imp+=imp; tot.conv+=conv; tot.value+=value
  if (spend>0 || imp>0) {
    console.log(`${(r.campaign?.name||'?').slice(0,37).padEnd(37)} | $${spend.toFixed(0).padStart(4)} | ${String(imp).padStart(5)} | ${String(clicks).padStart(3)} | ${ctr.padStart(5)} | ${cpc.padStart(5)} | ${conv.toFixed(1).padStart(4)} | $${value.toFixed(0).padStart(4)} | ${roas}`)
  }
}
const totCtr = tot.imp>0 ? (tot.clicks/tot.imp*100).toFixed(2)+'%' : '—'
const totRoas = tot.spend>0 ? (tot.value/tot.spend).toFixed(2)+'x' : '—'
const totCpa = tot.conv>0 ? '$'+(tot.spend/tot.conv).toFixed(0) : '—'
const totAov = tot.conv>0 ? '$'+(tot.value/tot.conv).toFixed(0) : '—'
console.log('-'.repeat(115))
console.log(`TOTAL                                 | $${tot.spend.toFixed(0).padStart(4)} | ${String(tot.imp).padStart(5)} | ${String(tot.clicks).padStart(3)} | ${totCtr.padStart(5)} | — | ${tot.conv.toFixed(1).padStart(4)} | $${tot.value.toFixed(0).padStart(4)} | ${totRoas}`)
console.log(`\nOvernight CPA: ${totCpa} | AOV: ${totAov} | aMER: ${tot.spend>0?(tot.allValue/tot.spend).toFixed(2)+'x':'—'}`)

// Compare to prior 7-day Monday average
const priorMondays = await customer.query(`
  SELECT segments.date, metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions, metrics.conversions_value
  FROM campaign
  WHERE segments.date BETWEEN '2026-05-04' AND '2026-05-18'
    AND campaign.status != 'REMOVED'
`)
// Aggregate by date
const dailyAgg = new Map()
for (const r of priorMondays) {
  const d = r.segments?.date
  if (!dailyAgg.has(d)) dailyAgg.set(d, {spend:0,clicks:0,imp:0,conv:0,value:0})
  const x = dailyAgg.get(d)
  x.spend+=Number(r.metrics?.cost_micros||0)/1e6
  x.clicks+=Number(r.metrics?.clicks||0)
  x.imp+=Number(r.metrics?.impressions||0)
  x.conv+=Number(r.metrics?.conversions||0)
  x.value+=Number(r.metrics?.conversions_value||0)
}
const mondays = [...dailyAgg.entries()].filter(([d]) => {
  const day = new Date(d).getUTCDay()
  return day === 1 // Monday
})
if (mondays.length > 0) {
  const avg = mondays.reduce((a,[_,b])=>({spend:a.spend+b.spend,conv:a.conv+b.conv,value:a.value+b.value,clicks:a.clicks+b.clicks}), {spend:0,conv:0,value:0,clicks:0})
  const n = mondays.length
  console.log(`\nVs ${n}-week Monday avg: spend $${(avg.spend/n).toFixed(0)} | conv ${(avg.conv/n).toFixed(1)} | rev $${(avg.value/n).toFixed(0)} | ROAS ${avg.spend>0?(avg.value/avg.spend).toFixed(2)+'x':'—'}`)
}

// ============== B. PRODUCT-CAMPAIGN OVERLAP CHECK ==============
console.log('\n\n═══════════════════════════════════════════════════════════════════')
console.log('  B. PRODUCTS-IN-RIGHT-CAMPAIGNS CHECK (the marketer\'s claim)')
console.log('═══════════════════════════════════════════════════════════════════\n')

// For each PMAX campaign, pull product titles that got impressions in last 30d
const pmax = await customer.query(`
  SELECT campaign.name, segments.product_item_id, segments.product_title,
         metrics.impressions, metrics.clicks, metrics.cost_micros,
         metrics.conversions, metrics.conversions_value
  FROM shopping_performance_view
  WHERE segments.date DURING LAST_30_DAYS
`)

const byCampProd = new Map()
for (const r of pmax) {
  const camp = r.campaign?.name || '?'
  const title = r.segments?.product_title || ''
  if (!title) continue
  if (!byCampProd.has(camp)) byCampProd.set(camp, new Map())
  const m = byCampProd.get(camp)
  if (!m.has(title)) m.set(title, { imp:0, clk:0, spend:0, conv:0, value:0 })
  const x = m.get(title)
  x.imp += Number(r.metrics?.impressions||0)
  x.clk += Number(r.metrics?.clicks||0)
  x.spend += Number(r.metrics?.cost_micros||0)/1e6
  x.conv += Number(r.metrics?.conversions||0)
  x.value += Number(r.metrics?.conversions_value||0)
}

function classify(title) {
  const t = title.toLowerCase()
  if (/bundle|pack|combo|kit|2x|2 pack|3 pack|4 pack|family/i.test(t)) return 'BUNDLE'
  if (/cannon|powder|extinguisher|blaster|tnt|burn.?away/i.test(t)) return 'CANNON/POWDER'
  if (/smoke bomb|smoke emitter/i.test(t)) return 'SMOKE'
  if (/balloon/i.test(t)) return 'BALLOON'
  if (/cake|topper|scratchie|badge|wristband|backdrop/i.test(t)) return 'ACCESSORY'
  if (/golf|soccer|football|basketball|afl|nrl|baseball|sports/i.test(t)) return 'SPORTS'
  if (/pinata|poker|prediction|poke ball/i.test(t)) return 'NOVELTY'
  return 'OTHER'
}

const EXPECTED = {
  'GRI PMAX | All Products': new Set(['BUNDLE','CANNON/POWDER','SMOKE','BALLOON','ACCESSORY','SPORTS','NOVELTY','OTHER']),
  'GRI PMAX | Bundles': new Set(['BUNDLE']),
  'GRI PMAX | Cannon & Powder Reveals': new Set(['CANNON/POWDER']),
}

for (const [camp, prods] of byCampProd.entries()) {
  if (!camp.includes('PMAX')) continue
  const sorted = [...prods.entries()].sort((a,b)=>b[1].spend-a[1].spend)
  const totalProds = sorted.length
  // Classify
  const classified = sorted.map(([t,m])=>({ title:t, cat:classify(t), ...m }))
  const buckets = {}
  for (const p of classified) buckets[p.cat] = (buckets[p.cat]||0)+1
  console.log(`\n[${camp}] — ${totalProds} unique products with impressions in 30d`)
  console.log(`  Category split: ${Object.entries(buckets).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k}:${v}`).join(' | ')}`)

  const expected = EXPECTED[camp]
  if (expected && expected.size < 8) {
    // This campaign should be narrow — find products NOT matching expected categories
    const offenders = classified.filter(p => !expected.has(p.cat) && p.spend > 1)
    if (offenders.length === 0) {
      console.log(`  ✅ All products match expected categories.`)
    } else {
      console.log(`  🔴 OFFENDERS (products in wrong campaign):`)
      offenders.sort((a,b)=>b.spend-a.spend).slice(0,15).forEach(p => {
        console.log(`     $${p.spend.toFixed(0).padStart(3)} | ${p.imp.toString().padStart(4)} imp | ${p.cat.padEnd(13)} | ${p.title.slice(0,68)}`)
      })
      const wastedSpend = offenders.reduce((s,p)=>s+p.spend,0)
      console.log(`     → Wasted/misallocated 30d spend: $${wastedSpend.toFixed(0)} (${offenders.length} products)`)
    }
  }
}

// ============== C. QUICK STRUCTURAL AUDIT ==============
console.log('\n\n═══════════════════════════════════════════════════════════════════')
console.log('  C. QUICK STRUCTURAL AUDIT')
console.log('═══════════════════════════════════════════════════════════════════\n')

// Campaign-level settings + asset group counts
const camps = await customer.query(`
  SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type,
         campaign.bidding_strategy_type, campaign.target_roas.target_roas,
         campaign_budget.amount_micros
  FROM campaign
  WHERE campaign.status = 'ENABLED'
`)
console.log('Campaign                              | Channel        | Bidding | tROAS | Budget | Status')
console.log('-'.repeat(115))
for (const c of camps) {
  const budget = Number(c.campaign_budget?.amount_micros||0)/1e6
  const tROAS = c.campaign?.target_roas?.target_roas ?? '—'
  const channel = c.campaign.advertising_channel_type || '?'
  const bidding = c.campaign.bidding_strategy_type || '?'
  console.log(`${(c.campaign.name||'').slice(0,37).padEnd(37)} | ${String(channel).padEnd(14)} | ${String(bidding).padEnd(7)} | ${tROAS===null||tROAS==='—'?'—':tROAS.toFixed?.(2)} | $${budget.toFixed(0).padStart(3)}/d | ${c.campaign.status}`)
}

// Conversion actions — make sure tracking is healthy
console.log(`\n--- Conversion actions check ---`)
const ca = await customer.query(`
  SELECT conversion_action.name, conversion_action.status, conversion_action.category,
         conversion_action.primary_for_goal, conversion_action.include_in_conversions_metric
  FROM conversion_action
  WHERE conversion_action.status = 'ENABLED'
`)
for (const a of ca) {
  console.log(`  [${a.conversion_action.status}] ${a.conversion_action.name} | category: ${a.conversion_action.category} | primary: ${a.conversion_action.primary_for_goal} | counts: ${a.conversion_action.include_in_conversions_metric}`)
}

process.exit(0)
