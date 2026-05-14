/**
 * PHASE 3 EXECUTION — tROAS changes on 3 PMAX campaigns
 *
 * Changes (executed one at a time with verification):
 * 1. PMAX All Products (21113841118): add tROAS 220% (2.20)
 * 2. PMAX Bundles (22841772135): add tROAS 190% (1.90)
 * 3. PMAX Cannon & Powder Reveals (21511998936): change tROAS 200% → 170% (2.00 → 1.70)
 *
 * Bid strategy stays as MAX_CONVERSION_VALUE — only target_roas field changes.
 *
 * Run: node scripts/phase3-execute.js
 */
import 'dotenv/config'
import { writeFileSync } from 'fs'
import { getGadsCustomer, getGadsCustomerId } from '../server/lib/gads-client.js'

const customer = getGadsCustomer()
const customerId = getGadsCustomerId()

const CHANGES = [
  { campaignId: '21113841118', name: 'GRI PMAX | All Products',           newTRoas: 2.20, currentTRoas: null },
  { campaignId: '22841772135', name: 'GRI PMAX | Bundles',                 newTRoas: 1.90, currentTRoas: null },
  { campaignId: '21511998936', name: 'GRI PMAX | Cannon & Powder Reveals', newTRoas: 1.70, currentTRoas: 2.00 },
]

async function getCampaignState(campaignId) {
  const r = await customer.query(`
    SELECT campaign.id, campaign.name, campaign.bidding_strategy_type,
           campaign.maximize_conversion_value.target_roas,
           campaign.target_roas.target_roas
    FROM campaign WHERE campaign.id = ${campaignId}
  `)
  if (!r.length) return null
  const c = r[0].campaign
  return {
    id: c?.id?.toString(),
    name: c?.name,
    bidStrategyType: c?.bidding_strategy_type,
    currentTRoas: c?.maximize_conversion_value?.target_roas || c?.target_roas?.target_roas || null,
  }
}

console.log(`\n========== PHASE 3 EXECUTION — ${new Date().toISOString().slice(0, 19)} ==========\n`)
console.log(`Customer ID: ${customerId}\n`)

const executionLog = {
  startedAt: new Date().toISOString(),
  customerId,
  changes: [],
}

for (const change of CHANGES) {
  console.log(`\n--- ${change.name} (${change.campaignId}) ---`)
  const log = { campaignId: change.campaignId, name: change.name, expected: change.newTRoas }

  // 1. Read current state
  try {
    const before = await getCampaignState(change.campaignId)
    log.before = before
    console.log(`  BEFORE: bidStrategy=${before?.bidStrategyType} tROAS=${before?.currentTRoas || 'NONE'}`)
  } catch (e) {
    log.error_before = e?.errors?.[0]?.message || e?.message
    console.log(`  ❌ READ FAILED: ${log.error_before}`)
    executionLog.changes.push(log)
    continue
  }

  // 2. Mutate
  try {
    const result = await customer.campaigns.update([
      {
        resource_name: `customers/${customerId}/campaigns/${change.campaignId}`,
        maximize_conversion_value: {
          target_roas: change.newTRoas,
        },
      },
    ])
    log.mutation_result = result?.results?.[0]?.resource_name || 'no resource_name returned'
    console.log(`  MUTATE OK: ${log.mutation_result}`)
  } catch (e) {
    log.error_mutate = e?.errors?.[0]?.message || e?.message || JSON.stringify(e).slice(0, 500)
    log.status = 'FAILED'
    console.log(`  ❌ MUTATE FAILED: ${log.error_mutate}`)
    executionLog.changes.push(log)
    continue
  }

  // 3. Verify
  await new Promise((r) => setTimeout(r, 2000))
  try {
    const after = await getCampaignState(change.campaignId)
    log.after = after
    const matches = Math.abs(Number(after?.currentTRoas || 0) - change.newTRoas) < 0.0001
    log.status = matches ? 'OK' : 'MISMATCH'
    console.log(`  AFTER:  tROAS=${after?.currentTRoas} ${matches ? '✓ MATCHES EXPECTED' : '⚠️ DOES NOT MATCH'}`)
  } catch (e) {
    log.error_verify = e?.errors?.[0]?.message || e?.message
    log.status = 'VERIFY_FAILED'
    console.log(`  ⚠️ VERIFY FAILED: ${log.error_verify}`)
  }

  executionLog.changes.push(log)

  // Pause between changes
  await new Promise((r) => setTimeout(r, 1500))
}

executionLog.completedAt = new Date().toISOString()
executionLog.summary = {
  total: CHANGES.length,
  successful: executionLog.changes.filter((c) => c.status === 'OK').length,
  failed: executionLog.changes.filter((c) => c.status === 'FAILED' || c.status === 'MISMATCH').length,
}

writeFileSync('data/snapshots/phase3-prep/phase3-execution-log-2026-05-14.json', JSON.stringify(executionLog, null, 2))

console.log(`\n========== SUMMARY ==========`)
console.log(`Successful: ${executionLog.summary.successful} / ${executionLog.summary.total}`)
console.log(`Failed:     ${executionLog.summary.failed}`)
console.log(`\nLog saved: data/snapshots/phase3-prep/phase3-execution-log-2026-05-14.json`)
process.exit(0)
