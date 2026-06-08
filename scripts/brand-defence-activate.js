/**
 * BRAND DEFENCE ACTIVATION — May 16 2026
 * Un-pause GRI | Search | Brand Defence campaign (id 23425232813)
 * Enable 3 paused brand-term keywords inside it.
 *
 * Snapshot before, mutate, verify, log.
 */
import 'dotenv/config'
import { writeFileSync, mkdirSync } from 'fs'
import { getGadsCustomer, getGadsCustomerId } from '../server/lib/gads-client.js'

const customer = getGadsCustomer()
const custId = getGadsCustomerId()
const CAMP_ID = '23425232813'

console.log(`\n========== BRAND DEFENCE ACTIVATION — ${new Date().toISOString()} ==========\n`)

// 1. SNAPSHOT before
console.log('--- Snapshot BEFORE ---')
const campBefore = await customer.query(`
  SELECT campaign.id, campaign.name, campaign.status, campaign.bidding_strategy_type, campaign_budget.amount_micros
  FROM campaign WHERE campaign.id = ${CAMP_ID}
`)
const kwBefore = await customer.query(`
  SELECT ad_group.id, ad_group_criterion.criterion_id, ad_group_criterion.keyword.text,
         ad_group_criterion.keyword.match_type, ad_group_criterion.status
  FROM ad_group_criterion
  WHERE campaign.id = ${CAMP_ID} AND ad_group_criterion.type = 'KEYWORD'
`)
const snapshot = { takenAt: new Date().toISOString(), campaign: campBefore[0], keywords: kwBefore }
mkdirSync('data/snapshots/brand-defence', { recursive: true })
writeFileSync('data/snapshots/brand-defence/before-activate.json', JSON.stringify(snapshot, null, 2))
console.log(`  Campaign status: ${campBefore[0]?.campaign?.status} (3=PAUSED)`)
console.log(`  Keywords: ${kwBefore.length} total`)
for (const r of kwBefore) {
  console.log(`    [${r.ad_group_criterion?.status}] "${r.ad_group_criterion?.keyword?.text}" (match ${r.ad_group_criterion?.keyword?.match_type})`)
}

// 2. UN-PAUSE CAMPAIGN
console.log('\n--- Action 1: Un-pause campaign ---')
const log = { snapshotPath: 'data/snapshots/brand-defence/before-activate.json', actions: [] }
try {
  const res = await customer.campaigns.update([{
    resource_name: `customers/${custId}/campaigns/${CAMP_ID}`,
    status: 'ENABLED',
  }])
  log.actions.push({ action: 'campaign_enable', campaignId: CAMP_ID, result: res?.results?.[0]?.resource_name, ok: true })
  console.log(`  ✓ Campaign ENABLED: ${res?.results?.[0]?.resource_name}`)
} catch (e) {
  const msg = e?.errors?.[0]?.message || e?.message
  log.actions.push({ action: 'campaign_enable', campaignId: CAMP_ID, error: msg, ok: false })
  console.log(`  ✗ FAILED: ${msg}`)
}

// 3. ENABLE the 3 paused keywords
console.log('\n--- Action 2: Enable 3 paused brand keywords ---')
const toEnable = kwBefore.filter(r => r.ad_group_criterion?.status === 3) // 3=PAUSED
for (const kw of toEnable) {
  const agId = kw.ad_group?.id
  const critId = kw.ad_group_criterion?.criterion_id
  const text = kw.ad_group_criterion?.keyword?.text
  const rn = `customers/${custId}/adGroupCriteria/${agId}~${critId}`
  try {
    const res = await customer.adGroupCriteria.update([{ resource_name: rn, status: 'ENABLED' }])
    log.actions.push({ action: 'keyword_enable', keyword: text, resource: rn, ok: true })
    console.log(`  ✓ ENABLED "${text}"`)
  } catch (e) {
    const msg = e?.errors?.[0]?.message || e?.message
    log.actions.push({ action: 'keyword_enable', keyword: text, resource: rn, error: msg, ok: false })
    console.log(`  ✗ FAILED "${text}": ${msg}`)
  }
  await new Promise(r => setTimeout(r, 800))
}

// 4. VERIFY AFTER
console.log('\n--- Verify AFTER ---')
const campAfter = await customer.query(`SELECT campaign.status FROM campaign WHERE campaign.id = ${CAMP_ID}`)
const kwAfter = await customer.query(`
  SELECT ad_group_criterion.keyword.text, ad_group_criterion.status
  FROM ad_group_criterion WHERE campaign.id = ${CAMP_ID} AND ad_group_criterion.type = 'KEYWORD'
`)
console.log(`  Campaign status: ${campAfter[0]?.campaign?.status} (2=ENABLED)`)
for (const r of kwAfter) {
  console.log(`    [${r.ad_group_criterion?.status}] "${r.ad_group_criterion?.keyword?.text}"`)
}

log.completedAt = new Date().toISOString()
log.afterSnapshot = { campaign: campAfter[0], keywords: kwAfter }
writeFileSync('data/snapshots/brand-defence/activation-log.json', JSON.stringify(log, null, 2))
console.log(`\n✓ ACTIVATION COMPLETE. Log: data/snapshots/brand-defence/activation-log.json`)
console.log(`\nROLLBACK: re-pause campaign 23425232813 + restore keyword statuses from before-activate.json`)
process.exit(0)
