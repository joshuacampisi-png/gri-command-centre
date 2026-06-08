/**
 * Raise PMAX Bundles daily budget from $60 → $70 (+16.67%, under 20% learning threshold)
 * Snapshot before, mutate, verify, save rollback log.
 *
 * Rollback: node scripts/bundles-budget-raise-70.js --rollback
 */
import 'dotenv/config'
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs'
import { getGadsCustomer, getGadsCustomerId } from '../server/lib/gads-client.js'
const customer = getGadsCustomer()
const custId = getGadsCustomerId()
const SNAPSHOT_DIR = 'data/snapshots/bundles-budget-raise-70'
mkdirSync(SNAPSHOT_DIR, { recursive: true })
const LOG = `${SNAPSHOT_DIR}/log.json`

const BUDGET_ID = '14807748208'
const NEW_BUDGET_MICROS = 70_000_000  // $70

const ROLLBACK = process.argv.includes('--rollback')

console.log(`\n=== ${ROLLBACK?'ROLLBACK':'RAISE'} — PMAX Bundles daily budget ===\n`)

if (ROLLBACK) {
  if (!existsSync(LOG)) { console.error('No log to rollback'); process.exit(1) }
  const log = JSON.parse(readFileSync(LOG,'utf8'))
  const oldMicros = log.previousAmountMicros
  if (!oldMicros) { console.error('No previous amount in log'); process.exit(1) }
  await customer.campaignBudgets.update([{
    resource_name: `customers/${custId}/campaignBudgets/${BUDGET_ID}`,
    amount_micros: oldMicros,
  }])
  console.log(`✓ Rolled back to $${oldMicros/1e6}/day`)
  process.exit(0)
}

// Snapshot
const before = await customer.query(`SELECT campaign_budget.amount_micros, campaign_budget.name FROM campaign_budget WHERE campaign_budget.id=${BUDGET_ID}`)
const previousMicros = Number(before[0]?.campaign_budget?.amount_micros||0)
console.log(`BEFORE: $${previousMicros/1e6}/day`)
console.log(`NEW:    $${NEW_BUDGET_MICROS/1e6}/day`)
const pct = ((NEW_BUDGET_MICROS-previousMicros)/previousMicros*100).toFixed(2)
console.log(`Raise:  +$${(NEW_BUDGET_MICROS-previousMicros)/1e6}/day (+${pct}%)  ${Math.abs(pct)<=20?'✓ within ±20% learning-safe band':'⚠ EXCEEDS ±20%'}`)

// Mutate
try {
  const res = await customer.campaignBudgets.update([{
    resource_name: `customers/${custId}/campaignBudgets/${BUDGET_ID}`,
    amount_micros: NEW_BUDGET_MICROS,
  }])
  console.log(`✓ Updated: ${res?.results?.[0]?.resource_name}`)
} catch (e) {
  console.error(`✗ FAILED: ${e?.errors?.[0]?.message||e?.message}`)
  process.exit(1)
}

// Verify
const after = await customer.query(`SELECT campaign_budget.amount_micros FROM campaign_budget WHERE campaign_budget.id=${BUDGET_ID}`)
console.log(`VERIFY: $${Number(after[0]?.campaign_budget?.amount_micros||0)/1e6}/day`)

// Save log
writeFileSync(LOG, JSON.stringify({
  shippedAt: new Date().toISOString(),
  budgetId: BUDGET_ID,
  previousAmountMicros: previousMicros,
  newAmountMicros: NEW_BUDGET_MICROS,
  rollbackCommand: 'node scripts/bundles-budget-raise-70.js --rollback',
}, null, 2))
console.log(`Log: ${LOG}`)
console.log(`Rollback: node scripts/bundles-budget-raise-70.js --rollback`)
process.exit(0)
