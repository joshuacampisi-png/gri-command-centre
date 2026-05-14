/**
 * PHASE 3 ROLLBACK — reverts the 3 PMAX tROAS changes from May 14 2026
 *
 * Reverts to pre-Phase-3 state:
 * 1. PMAX All Products (21113841118): clear tROAS (back to no floor)
 * 2. PMAX Bundles (22841772135): clear tROAS (back to no floor)
 * 3. PMAX Cannon & Powder Reveals (21511998936): tROAS 170% → 200% (1.70 → 2.00)
 *
 * Run: node scripts/phase3-rollback.js
 */
import 'dotenv/config'
import { writeFileSync } from 'fs'
import { getGadsCustomer, getGadsCustomerId } from '../server/lib/gads-client.js'

const customer = getGadsCustomer()
const customerId = getGadsCustomerId()

// Note: clearing tROAS via API requires setting target_roas to 0 OR omitting it.
// Per Google Ads API: setting target_roas = 0 reverts to pure Max-Conv-Value (no floor).
const ROLLBACKS = [
  { campaignId: '21113841118', name: 'GRI PMAX | All Products',           newTRoas: 0,    intent: 'clear (back to no floor)' },
  { campaignId: '22841772135', name: 'GRI PMAX | Bundles',                 newTRoas: 0,    intent: 'clear (back to no floor)' },
  { campaignId: '21511998936', name: 'GRI PMAX | Cannon & Powder Reveals', newTRoas: 2.00, intent: 'restore 200%' },
]

console.log(`\n========== PHASE 3 ROLLBACK — ${new Date().toISOString().slice(0, 19)} ==========\n`)

const rollbackLog = { startedAt: new Date().toISOString(), changes: [] }

for (const r of ROLLBACKS) {
  console.log(`\n--- ${r.name} (${r.campaignId}) ---`)
  console.log(`  Intent: ${r.intent}`)
  const log = { campaignId: r.campaignId, name: r.name, intent: r.intent }
  try {
    const result = await customer.campaigns.update([
      {
        resource_name: `customers/${customerId}/campaigns/${r.campaignId}`,
        maximize_conversion_value: { target_roas: r.newTRoas },
      },
    ])
    log.mutation_result = result?.results?.[0]?.resource_name
    log.status = 'OK'
    console.log(`  ROLLED BACK: ${log.mutation_result}`)
  } catch (e) {
    log.error = e?.errors?.[0]?.message || e?.message
    log.status = 'FAILED'
    console.log(`  ❌ ROLLBACK FAILED: ${log.error}`)
  }
  rollbackLog.changes.push(log)
  await new Promise((r2) => setTimeout(r2, 1500))
}

rollbackLog.completedAt = new Date().toISOString()
writeFileSync('data/snapshots/phase3-prep/phase3-rollback-log.json', JSON.stringify(rollbackLog, null, 2))
console.log(`\n✓ Rollback complete. Log saved.`)
process.exit(0)
