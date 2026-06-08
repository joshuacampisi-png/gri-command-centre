/**
 * Pause "gender reveal poppers" BROAD in Search Cannons campaign.
 * This single keyword burned $580 / 60% of campaign budget at 0.51x ROAS over 30 days.
 *
 * Rollback: --rollback to re-enable
 */
import 'dotenv/config'
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs'
import { getGadsCustomer, getGadsCustomerId } from '../server/lib/gads-client.js'
const customer = getGadsCustomer()
const custId = getGadsCustomerId()
const SNAPSHOT_DIR = 'data/snapshots/pause-poppers-broad'
mkdirSync(SNAPSHOT_DIR, { recursive: true })
const LOG_PATH = `${SNAPSHOT_DIR}/log.json`

const CAMP_ID = 21094179575  // GRI | Search | Cannons
const TARGET_TEXT = 'gender reveal poppers'
const TARGET_MATCH = 4  // BROAD

const ROLLBACK = process.argv.includes('--rollback')

console.log(`\n=== ${ROLLBACK?'ROLLBACK':'PAUSE'} — "gender reveal poppers" BROAD ===\n`)

// Find the keyword
const kw = await customer.query(`SELECT ad_group.id, ad_group_criterion.criterion_id, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.status FROM ad_group_criterion WHERE campaign.id=${CAMP_ID} AND ad_group_criterion.type='KEYWORD' AND ad_group_criterion.keyword.text='${TARGET_TEXT}'`)

const target = kw.find(r => r.ad_group_criterion?.keyword?.match_type === TARGET_MATCH)
if (!target) {
  console.error(`Could not find keyword "${TARGET_TEXT}" BROAD match`)
  console.log('Available:')
  for (const r of kw) console.log(`  ${r.ad_group_criterion?.keyword?.text} [match=${r.ad_group_criterion?.keyword?.match_type}] [status=${r.ad_group_criterion?.status}] crit_id=${r.ad_group_criterion?.criterion_id}`)
  process.exit(1)
}

const agId = target.ad_group?.id
const critId = target.ad_group_criterion?.criterion_id
const currentStatus = target.ad_group_criterion?.status
console.log(`Found: ad_group ${agId} / criterion ${critId} / current status ${currentStatus}`)

const newStatus = ROLLBACK ? 'ENABLED' : 'PAUSED'
const rn = `customers/${custId}/adGroupCriteria/${agId}~${critId}`

try {
  const res = await customer.adGroupCriteria.update([{ resource_name: rn, status: newStatus }])
  console.log(`✓ Status updated: ${rn}`)
  console.log(`  Action: ${ROLLBACK?'RE-ENABLED':'PAUSED'}`)
} catch (e) {
  console.error(`✗ FAILED: ${e?.errors?.[0]?.message || e?.message}`)
  process.exit(1)
}

if (!ROLLBACK) {
  writeFileSync(LOG_PATH, JSON.stringify({
    shippedAt: new Date().toISOString(),
    campaignId: CAMP_ID,
    adGroupId: agId,
    criterionId: critId,
    keyword: TARGET_TEXT,
    matchType: TARGET_MATCH,
    previousStatus: currentStatus,
    newStatus: 'PAUSED',
    rollbackCommand: 'node scripts/pause-poppers-broad.js --rollback',
    historical30d: { spend: 580, conv: 5, revenue: 294, roas: '0.51x', shareOfBudget: '60%' },
  }, null, 2))
  console.log(`\nLog: ${LOG_PATH}`)
}
console.log(`\nRollback: node scripts/pause-poppers-broad.js --rollback`)
console.log(`\nWatch: re-check Search Cannons ROAS Friday morning. Expected: 0.91x → 2-3x`)
process.exit(0)
