/**
 * SHIP: Detach "Smoke & Extinguisher Negatives" shared list from "GRI | Search | Cannons"
 *       + bump Cannons daily budget $30 → $40
 *
 * Snapshot before, mutate, verify, save rollback log.
 *
 * Rollback: node scripts/ship-detach-smoke-negs-from-cannons.js --rollback
 */
import 'dotenv/config'
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs'
import { getGadsCustomer, getGadsCustomerId } from '../server/lib/gads-client.js'
const customer = getGadsCustomer()
const custId = getGadsCustomerId()

const SNAPSHOT_DIR = 'data/snapshots/detach-smoke-negs-cannons'
mkdirSync(SNAPSHOT_DIR, { recursive: true })
const LOG = `${SNAPSHOT_DIR}/log.json`

const CAMPAIGN_NAME = 'GRI | Search | Cannons'
const LIST_NAME = 'Smoke & Extinguisher Negatives'
const NEW_BUDGET_MICROS = 40_000_000  // $40/day

const ROLLBACK = process.argv.includes('--rollback')

console.log(`\n=== ${ROLLBACK ? 'ROLLBACK' : 'SHIP'} — Detach ${LIST_NAME} from ${CAMPAIGN_NAME} ===\n`)

// ── ROLLBACK PATH ──
if (ROLLBACK) {
  if (!existsSync(LOG)) { console.error('No log to rollback'); process.exit(1) }
  const log = JSON.parse(readFileSync(LOG, 'utf8'))

  // Re-attach shared set
  const reattach = await customer.campaignSharedSets.create([{
    campaign: `customers/${custId}/campaigns/${log.campaignId}`,
    shared_set: `customers/${custId}/sharedSets/${log.sharedSetId}`,
  }])
  console.log(`✓ Re-attached: ${reattach?.results?.[0]?.resource_name}`)

  // Restore budget
  await customer.campaignBudgets.update([{
    resource_name: `customers/${custId}/campaignBudgets/${log.budgetId}`,
    amount_micros: log.previousBudgetMicros,
  }])
  console.log(`✓ Budget restored to $${log.previousBudgetMicros/1e6}/day`)
  process.exit(0)
}

// ── 1. Resolve IDs ──
console.log('--- Resolving campaign + shared set + budget IDs ---')
const campRows = await customer.query(`
  SELECT campaign.id, campaign.name, campaign.campaign_budget,
         campaign_budget.id, campaign_budget.amount_micros
  FROM campaign
  WHERE campaign.name = '${CAMPAIGN_NAME}' AND campaign.status = 'ENABLED'
`)
if (!campRows[0]) { console.error(`Campaign not found: ${CAMPAIGN_NAME}`); process.exit(1) }
const campaignId = campRows[0].campaign.id
const budgetId = campRows[0].campaign_budget.id
const previousBudgetMicros = Number(campRows[0].campaign_budget.amount_micros)
console.log(`  Campaign ID: ${campaignId}`)
console.log(`  Budget ID:   ${budgetId}  (current $${previousBudgetMicros/1e6}/day)`)

const setRows = await customer.query(`
  SELECT shared_set.id, shared_set.name FROM shared_set
  WHERE shared_set.name = '${LIST_NAME}'
`)
if (!setRows[0]) { console.error(`Shared set not found: ${LIST_NAME}`); process.exit(1) }
const sharedSetId = setRows[0].shared_set.id
console.log(`  Shared Set:  ${sharedSetId} (${LIST_NAME})`)

// ── 2. Resolve campaign_shared_set link resource name ──
const linkRows = await customer.query(`
  SELECT campaign_shared_set.resource_name, campaign_shared_set.status,
         campaign.id, shared_set.id, shared_set.name
  FROM campaign_shared_set
  WHERE campaign.id = ${campaignId} AND shared_set.id = ${sharedSetId}
`)
if (!linkRows[0]) {
  console.error(`Link not found — list may already be detached`)
  process.exit(1)
}
const linkResource = linkRows[0].campaign_shared_set.resource_name
console.log(`  Link to remove: ${linkResource}`)

// ── 3. Snapshot ──
const snapshot = {
  capturedAt: new Date().toISOString(),
  campaignId, budgetId, sharedSetId,
  previousBudgetMicros,
  newBudgetMicros: NEW_BUDGET_MICROS,
  linkResource,
  campaignName: CAMPAIGN_NAME,
  sharedSetName: LIST_NAME,
}
writeFileSync(LOG, JSON.stringify(snapshot, null, 2))
console.log(`\n✓ Snapshot saved: ${LOG}\n`)

// ── 4. Detach shared set ──
console.log('--- Detaching shared set ---')
try {
  await customer.campaignSharedSets.remove([linkResource])
  console.log(`✓ Detached ${LIST_NAME} from ${CAMPAIGN_NAME}`)
} catch (e) {
  console.error(`✗ FAILED detach: ${e?.errors?.[0]?.message || e?.message}`)
  process.exit(1)
}

// ── 5. Bump budget ──
console.log(`\n--- Bumping budget $${previousBudgetMicros/1e6} → $${NEW_BUDGET_MICROS/1e6}/day ---`)
try {
  await customer.campaignBudgets.update([{
    resource_name: `customers/${custId}/campaignBudgets/${budgetId}`,
    amount_micros: NEW_BUDGET_MICROS,
  }])
  console.log(`✓ Budget updated`)
} catch (e) {
  console.error(`✗ FAILED budget: ${e?.errors?.[0]?.message || e?.message}`)
  console.error(`  (shared set already detached — manual rollback may be needed)`)
  process.exit(1)
}

// ── 6. Verify ──
console.log('\n--- Verifying ---')
const verifyLink = await customer.query(`
  SELECT campaign_shared_set.resource_name FROM campaign_shared_set
  WHERE campaign.id = ${campaignId} AND shared_set.id = ${sharedSetId}
`)
console.log(`  Link present: ${verifyLink.length > 0 ? '⚠ STILL ATTACHED' : '✓ removed'}`)

const verifyBudget = await customer.query(`
  SELECT campaign_budget.amount_micros FROM campaign_budget
  WHERE campaign_budget.id = ${budgetId}
`)
const newBudget = Number(verifyBudget[0]?.campaign_budget?.amount_micros || 0)
console.log(`  Budget now:   $${newBudget/1e6}/day ${newBudget === NEW_BUDGET_MICROS ? '✓' : '⚠ mismatch'}`)

console.log(`\n=== SHIPPED ${new Date().toISOString()} ===`)
console.log(`Rollback: node scripts/ship-detach-smoke-negs-from-cannons.js --rollback`)
console.log(`\nMonitor:`)
console.log(`  Day 3:  Cannons search-term report (confirm extinguisher/smoke queries appearing)`)
console.log(`  Day 7:  ROAS check + PMAX cannibalisation`)
console.log(`  Day 14: Decision — hold/grow if ROAS >2.5x, rollback if <2.0x`)
process.exit(0)
