/**
 * SHIP: Quick Win 1 (negative cleanup) + Quick Win 2 (validated positive keywords)
 *
 * Quick Win 1:
 *  - Remove inline neg "smoke extinguisher for gender reveal" EXACT from Cannons
 *  - Delete inert "Cannon Negatives" shared list (36 negatives, attached to nothing)
 *  - SKIP electric water gun removal (product OOS per Josh)
 *
 * Quick Win 2:
 *  - Add 4 EXACT-match positives to Cannons "Powder Cannons" ad group
 *  - All validated against last 18mo search-term data with proven conversions
 *
 * Rollback: node scripts/ship-quick-wins-1-and-2.js --rollback
 */
import 'dotenv/config'
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs'
import { getGadsCustomer, getGadsCustomerId } from '../server/lib/gads-client.js'
const customer = getGadsCustomer()
const custId = getGadsCustomerId()

const SNAPSHOT_DIR = 'data/snapshots/quick-wins-1-2'
mkdirSync(SNAPSHOT_DIR, { recursive: true })
const LOG = `${SNAPSHOT_DIR}/log.json`

const ROLLBACK = process.argv.includes('--rollback')

// ── Known IDs (from recon) ──
const CANNONS_CAMP_ID = '21094179575'
const POWDER_CANNONS_AG_ID = '165478691408'
const SMOKE_EXT_NEG_CRIT_ID = '1884762080761'
const CANNON_NEGATIVES_LIST_ID = '11926463529'  // confirmed live below

const APPROVED_KEYWORDS = [
  { text: 'gender reveal extinguisher',      proof: '26 conv $3,696 rev 27k imp' },
  { text: 'gender reveal fire extinguisher', proof: '121 conv $15,439 rev 138k imp' },
  { text: 'gender reveal smoke bombs',       proof: '208 conv $17,511 rev 204k imp' },
  { text: 'gender reveal powder blaster',    proof: '8 conv $992 rev 12k imp' },
]
// match_type: 2 = EXACT (per google-ads-api node lib)
const EXACT = 2

console.log(`\n=== ${ROLLBACK?'ROLLBACK':'SHIP'} — Quick Wins 1 + 2 ===\n`)

// ─────── ROLLBACK PATH ───────
if (ROLLBACK) {
  if (!existsSync(LOG)) { console.error('No log to rollback'); process.exit(1) }
  const log = JSON.parse(readFileSync(LOG,'utf8'))

  // Re-add the inline neg
  await customer.campaignCriteria.create([{
    campaign: `customers/${custId}/campaigns/${CANNONS_CAMP_ID}`,
    negative: true,
    keyword: { text: log.removedInlineNeg, match_type: EXACT },
  }])
  console.log(`✓ Restored inline neg "${log.removedInlineNeg}"`)

  // Remove the added positives
  for (const rn of log.addedPositiveResources||[]) {
    try {
      await customer.adGroupCriteria.remove([rn])
      console.log(`✓ Removed added positive ${rn}`)
    } catch(e) { console.log(`  ⚠ remove failed for ${rn}: ${e.errors?.[0]?.message}`) }
  }

  // Restore shared list (requires recreate — log saved the negs)
  if (log.deletedSharedList) {
    console.log(`⚠ Shared list "Cannon Negatives" was deleted. Recreate manually if needed:`)
    console.log(`  ${log.deletedSharedList.negatives.length} negatives saved to log file`)
  }
  process.exit(0)
}

const audit = { shippedAt: new Date().toISOString() }

// ───────────────────────────────────────────
// QUICK WIN 1A — Remove inline neg
// ───────────────────────────────────────────
console.log('--- QW1a: Remove "smoke extinguisher for gender reveal" EXACT inline neg from Cannons ---')
try {
  await customer.campaignCriteria.remove([
    `customers/${custId}/campaignCriteria/${CANNONS_CAMP_ID}~${SMOKE_EXT_NEG_CRIT_ID}`
  ])
  audit.removedInlineNeg = 'smoke extinguisher for gender reveal'
  audit.removedInlineNegCritId = SMOKE_EXT_NEG_CRIT_ID
  console.log(`✓ Removed`)
} catch (e) {
  console.error(`✗ FAILED: ${e?.errors?.[0]?.message || e?.message}`)
}

// ───────────────────────────────────────────
// QUICK WIN 1B — Snapshot + delete inert Cannon Negatives shared list
// ───────────────────────────────────────────
console.log('\n--- QW1b: Snapshot + delete inert "Cannon Negatives" shared list ---')
// First verify the ID by name + snapshot the negs
const listLookup = await customer.query(`SELECT shared_set.id, shared_set.name, shared_set.member_count FROM shared_set WHERE shared_set.name = 'Cannon Negatives'`)
if (!listLookup.length) {
  console.log('  (list already deleted or not found — skipping)')
} else {
  const realListId = listLookup[0].shared_set.id
  const negs = await customer.query(`SELECT shared_criterion.criterion_id, shared_criterion.keyword.text, shared_criterion.keyword.match_type FROM shared_criterion WHERE shared_set.id = ${realListId}`)
  audit.deletedSharedList = {
    name: 'Cannon Negatives',
    id: String(realListId),
    memberCount: listLookup[0].shared_set.member_count,
    negatives: negs.map(r => ({
      critId: r.shared_criterion?.criterion_id,
      text: r.shared_criterion?.keyword?.text,
      match_type: r.shared_criterion?.keyword?.match_type,
    })),
  }
  console.log(`  Snapshotted ${negs.length} negatives`)

  // Verify zero ENABLED campaign attachments before deleting
  const enabledAttach = await customer.query(`SELECT campaign.name, campaign.status FROM campaign_shared_set WHERE shared_set.id = ${realListId} AND campaign.status = 'ENABLED'`)
  if (enabledAttach.length > 0) {
    console.log(`  ⚠ ABORT: list still attached to ${enabledAttach.length} enabled campaigns. Skipping delete.`)
  } else {
    try {
      await customer.sharedSets.remove([`customers/${custId}/sharedSets/${realListId}`])
      console.log(`✓ Deleted shared list "Cannon Negatives" (${negs.length} negatives archived in snapshot)`)
    } catch(e) {
      console.log(`  ⚠ delete failed: ${e?.errors?.[0]?.message || e?.message}`)
    }
  }
}

// ───────────────────────────────────────────
// QUICK WIN 2 — Add 4 EXACT-match positives to Cannons / Powder Cannons ad group
// ───────────────────────────────────────────
console.log('\n--- QW2: Add 4 validated EXACT positives to Cannons / Powder Cannons ad group ---')
const adGroupRn = `customers/${custId}/adGroups/${POWDER_CANNONS_AG_ID}`
audit.addedPositives = []
audit.addedPositiveResources = []

for (const kw of APPROVED_KEYWORDS) {
  try {
    const r = await customer.adGroupCriteria.create([{
      ad_group: adGroupRn,
      status: 'ENABLED',
      keyword: { text: kw.text, match_type: EXACT },
    }])
    const rn = r?.results?.[0]?.resource_name
    audit.addedPositives.push(kw)
    audit.addedPositiveResources.push(rn)
    console.log(`✓ Added [${kw.text}] EXACT  (proof: ${kw.proof})`)
  } catch(e) {
    const msg = e?.errors?.[0]?.message || e?.message || 'unknown'
    if (msg.includes('already exists') || msg.includes('DUPLICATE')) {
      console.log(`  ⊘ [${kw.text}] already exists in ad group`)
    } else {
      console.error(`✗ FAILED [${kw.text}]: ${msg}`)
    }
  }
}

// ───────────────────────────────────────────
// Save snapshot + verify
// ───────────────────────────────────────────
writeFileSync(LOG, JSON.stringify(audit, null, 2))
console.log(`\n✓ Snapshot saved: ${LOG}`)
console.log(`Rollback: node scripts/ship-quick-wins-1-and-2.js --rollback\n`)

// Verify positives landed
const verify = await customer.query(`
  SELECT ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type,
         ad_group_criterion.status
  FROM ad_group_criterion
  WHERE ad_group.id = ${POWDER_CANNONS_AG_ID}
    AND ad_group_criterion.type = 'KEYWORD'
    AND ad_group_criterion.negative = FALSE
    AND ad_group_criterion.keyword.match_type = 'EXACT'
    AND ad_group_criterion.keyword.text IN ('gender reveal extinguisher','gender reveal fire extinguisher','gender reveal smoke bombs','gender reveal powder blaster')
`)
console.log('--- VERIFY: EXACT positives now in Powder Cannons ad group ---')
for (const r of verify) {
  console.log(`  ✓ [${r.ad_group_criterion?.keyword?.text}] status: ${r.ad_group_criterion?.status}`)
}

console.log(`\n=== SHIPPED ${new Date().toISOString()} ===`)
process.exit(0)
