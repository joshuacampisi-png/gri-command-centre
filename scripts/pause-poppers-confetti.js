/**
 * Pause "gender reveal poppers" in Confetti Cannons ad group ONLY
 * (any match type, any status that's currently ENABLED)
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'

const customer = getGadsCustomer()
const CAMP_NAME = 'GRI | Search | Cannons'
const TARGET_AG = 'Confetti Cannons'
const TARGET_KW = 'gender reveal poppers'

// Find all matching criteria
const rows = await customer.query(`
  SELECT
    ad_group.id, ad_group.name,
    ad_group_criterion.criterion_id,
    ad_group_criterion.keyword.text,
    ad_group_criterion.keyword.match_type,
    ad_group_criterion.status,
    campaign.name
  FROM ad_group_criterion
  WHERE campaign.name = '${CAMP_NAME}'
    AND ad_group.name = '${TARGET_AG}'
    AND ad_group_criterion.type = 'KEYWORD'
    AND ad_group_criterion.keyword.text = '${TARGET_KW}'
`)

console.log(`\nFound ${rows.length} matching criteria in "${TARGET_AG}" ad group:\n`)
for (const r of rows) {
  console.log(`  AG ${r.ad_group.id} | crit ${r.ad_group_criterion.criterion_id} | "${r.ad_group_criterion.keyword.text}" | match ${r.ad_group_criterion.keyword.match_type} | status ${r.ad_group_criterion.status}`)
}

const toPause = rows.filter(r => r.ad_group_criterion.status === 'ENABLED' || r.ad_group_criterion.status === 2)
console.log(`\nWill pause ${toPause.length} (currently ENABLED only)`)

if (toPause.length === 0) {
  console.log('\nNothing to pause — already PAUSED or REMOVED in this ad group.')
  process.exit(0)
}

const ops = toPause.map(r => ({
  update: {
    resource_name: `customers/${customer.credentials.customer_id}/adGroupCriteria/${r.ad_group.id}~${r.ad_group_criterion.criterion_id}`,
    status: 'PAUSED'
  },
  update_mask: { paths: ['status'] }
}))

const result = await customer.adGroupCriteria.update(ops.map(o => o.update))
console.log(`\n✓ Paused:`, JSON.stringify(result, null, 2).slice(0, 400))

// Verify
const after = await customer.query(`
  SELECT ad_group_criterion.criterion_id, ad_group_criterion.keyword.text,
         ad_group_criterion.keyword.match_type, ad_group_criterion.status
  FROM ad_group_criterion
  WHERE campaign.name = '${CAMP_NAME}'
    AND ad_group.name = '${TARGET_AG}'
    AND ad_group_criterion.type = 'KEYWORD'
    AND ad_group_criterion.keyword.text = '${TARGET_KW}'
`)
console.log(`\nVerification (post-update):`)
for (const r of after) {
  console.log(`  crit ${r.ad_group_criterion.criterion_id} | "${r.ad_group_criterion.keyword.text}" | match ${r.ad_group_criterion.keyword.match_type} | status ${r.ad_group_criterion.status}`)
}
process.exit(0)
