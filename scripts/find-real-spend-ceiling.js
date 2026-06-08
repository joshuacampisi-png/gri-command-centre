/**
 * Find the REAL spend ceiling
 *  1. ALL campaigns (active + paused) with budgets
 *  2. Shared budgets
 *  3. Portfolio bid strategies
 *  4. Peak spend days in 2025 — did any single day hit $600 or $1000?
 *  5. Confirmed bid strategy per campaign (verify the enum)
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'

const c = getGadsCustomer()
const strCh = v => typeof v === 'string' ? v : (v?.name || String(v||''))

console.log('\n=== FINDING REAL GOOGLE SPEND CEILING ===\n')

// 1. ALL campaigns regardless of status
console.log('━━━ 1. ALL CAMPAIGN BUDGETS (ENABLED + PAUSED) ━━━\n')
const all = await c.query(`
  SELECT campaign.id, campaign.name, campaign.status,
         campaign.advertising_channel_type, campaign.bidding_strategy_type,
         campaign.bidding_strategy, campaign_budget.id,
         campaign_budget.amount_micros, campaign_budget.explicitly_shared,
         campaign_budget.delivery_method, campaign_budget.period
  FROM campaign
  WHERE campaign.status IN ('ENABLED','PAUSED')
`)
const enabled = all.filter(r => r.campaign?.status === 'ENABLED')
const paused = all.filter(r => r.campaign?.status === 'PAUSED')

console.log(`Enabled campaigns: ${enabled.length}`)
console.log(`Paused campaigns:  ${paused.length}\n`)

console.log('ENABLED:')
console.log('Name'.padEnd(40) + ' | Status   | Budget    | Shared | Bid Strat')
console.log('-'.repeat(95))
let totEnabled = 0
for (const r of enabled) {
  const budget = Number(r.campaign_budget?.amount_micros||0)/1e6
  const shared = r.campaign_budget?.explicitly_shared ? 'YES' : 'no'
  const bs = strCh(r.campaign?.bidding_strategy_type)
  totEnabled += budget
  console.log(`${(r.campaign?.name||'?').slice(0,38).padEnd(40)} | ${r.campaign?.status.padEnd(8)} | $${budget.toFixed(0).padStart(5)}/d | ${shared.padEnd(6)} | ${bs}`)
}
console.log('-'.repeat(95))
console.log(`TOTAL ENABLED BUDGET: $${totEnabled.toFixed(0)}/day\n`)

console.log('\nPAUSED:')
console.log('Name'.padEnd(40) + ' | Status   | Budget    | Shared | Bid Strat')
console.log('-'.repeat(95))
let totPaused = 0
for (const r of paused) {
  const budget = Number(r.campaign_budget?.amount_micros||0)/1e6
  const shared = r.campaign_budget?.explicitly_shared ? 'YES' : 'no'
  const bs = strCh(r.campaign?.bidding_strategy_type)
  totPaused += budget
  console.log(`${(r.campaign?.name||'?').slice(0,38).padEnd(40)} | ${r.campaign?.status.padEnd(8)} | $${budget.toFixed(0).padStart(5)}/d | ${shared.padEnd(6)} | ${bs}`)
}
console.log('-'.repeat(95))
console.log(`TOTAL PAUSED BUDGET (not actively spending): $${totPaused.toFixed(0)}/day`)

// 2. Shared budgets
console.log(`\n\n━━━ 2. SHARED BUDGETS ━━━\n`)
const sharedBudgets = await c.query(`
  SELECT campaign_budget.id, campaign_budget.name, campaign_budget.amount_micros,
         campaign_budget.explicitly_shared, campaign_budget.delivery_method,
         campaign_budget.reference_count, campaign_budget.status
  FROM campaign_budget
  WHERE campaign_budget.explicitly_shared = TRUE
`)
if (!sharedBudgets.length) {
  console.log('  No shared budgets in account.')
} else {
  for (const r of sharedBudgets) {
    const budget = Number(r.campaign_budget?.amount_micros||0)/1e6
    console.log(`  ${r.campaign_budget?.name?.padEnd(40)} $${budget.toFixed(0)}/d  refs:${r.campaign_budget?.reference_count}  status:${r.campaign_budget?.status}`)
  }
}

// 3. Peak spend days in 2025 — did we ever hit $1000?
console.log(`\n\n━━━ 3. PEAK SPEND DAYS IN 2025 ━━━\n`)
const peaks = await c.query(`
  SELECT segments.date, metrics.cost_micros
  FROM campaign
  WHERE segments.date BETWEEN '2025-01-01' AND '2025-12-31'
    AND campaign.status != 'REMOVED'
`)
const byDay = new Map()
for (const r of peaks) {
  const d = r.segments?.date
  if (!d) continue
  byDay.set(d, (byDay.get(d)||0) + Number(r.metrics?.cost_micros||0)/1e6)
}
const sorted = [...byDay.entries()].sort((a,b) => b[1] - a[1])
console.log('Top 20 highest-spend days in 2025:')
for (const [d, spend] of sorted.slice(0,20)) {
  const flag = spend >= 1000 ? '🟢 hit $1000+' : spend >= 600 ? '🟡 hit $600+' : ''
  console.log(`  ${d}  $${spend.toFixed(0).padStart(4)}/day  ${flag}`)
}
const over600 = sorted.filter(([_,s]) => s >= 600).length
const over1000 = sorted.filter(([_,s]) => s >= 1000).length
console.log(`\nDays >= $600 spend in 2025: ${over600} (out of ${sorted.length})`)
console.log(`Days >= $1000 spend in 2025: ${over1000} (out of ${sorted.length})`)

// 4. Confirm bid strategy enums
console.log(`\n\n━━━ 4. ACTIVE CAMPAIGN BID STRATEGIES (raw enum) ━━━\n`)
for (const r of enabled) {
  console.log(`  ${r.campaign?.name?.padEnd(40)} | enum:${r.campaign?.bidding_strategy_type} | str:${strCh(r.campaign?.bidding_strategy_type)}`)
}

process.exit(0)
