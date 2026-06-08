/**
 * PHASE 1 EXECUTION — May 15 2026
 *
 * Ships:
 * 1.1: Search-term negative refinement on "gender reveal poppers"
 * 1.2: PMAX product exclusion test (bottom bleeders, one campaign)
 *
 * Snapshot before each change. Rollback notes captured.
 */
import 'dotenv/config'
import { getGadsCustomer } from '../server/lib/gads-client.js'
import { writeFileSync, mkdirSync, readFileSync } from 'fs'

const c = getGadsCustomer()
mkdirSync('data/snapshots/gads-phase1', { recursive: true })

const today = new Date().toISOString().slice(0, 19)
const days = (n) => new Date(Date.now() - n*86400000).toISOString().slice(0, 10)

console.log(`\n========== PHASE 1 EXECUTION — ${today} ==========\n`)

// ============= 1.1: SEARCH TERMS FOR "GENDER REVEAL POPPERS" =============
console.log('--- 1.1: SEARCH TERMS REFINEMENT FOR "gender reveal poppers" ---')

// Find the ad_group containing the "gender reveal poppers" keyword first
const kwRows = await c.query(`
  SELECT campaign.id, campaign.name, ad_group.id, ad_group.name,
         ad_group_criterion.criterion_id, ad_group_criterion.keyword.text,
         ad_group_criterion.keyword.match_type
  FROM keyword_view
  WHERE ad_group_criterion.keyword.text = 'gender reveal poppers'
    AND ad_group_criterion.status = 'ENABLED'
`)
console.log(`Found ${kwRows.length} "gender reveal poppers" keyword instance(s):`)
for (const r of kwRows) {
  console.log(`  ad_group ${r.ad_group?.id} (${r.ad_group?.name}) in campaign ${r.campaign?.name}`)
}
if (!kwRows.length) {
  console.log('  ! No matching keyword found, skipping 1.1')
} else {
  const adGroupIds = [...new Set(kwRows.map(r => r.ad_group?.id))].filter(Boolean)
  const adGroupIdList = adGroupIds.map(id => `'customers/${c.customerId}/adGroups/${id}'`).join(',')

  // Pull all search terms that fired from those ad groups (90d)
  const stRows = await c.query(`
    SELECT search_term_view.search_term, ad_group.id, ad_group.name,
           metrics.impressions, metrics.clicks, metrics.cost_micros,
           metrics.conversions, metrics.conversions_value
    FROM search_term_view
    WHERE segments.date BETWEEN '${days(90)}' AND '${days(1)}'
      AND ad_group.id IN (${adGroupIds.join(',')})
    ORDER BY metrics.cost_micros DESC
  `)
  console.log(`\n  ${stRows.length} unique search terms in 90d from this ad group:`)
  const candidates = []
  for (const r of stRows) {
    const sp = Number(r.metrics?.cost_micros || 0) / 1e6
    const val = Number(r.metrics?.conversions_value || 0)
    const conv = Number(r.metrics?.conversions || 0)
    const imp = Number(r.metrics?.impressions || 0)
    const clk = Number(r.metrics?.clicks || 0)
    const roas = sp > 0 ? val / sp : (conv > 0 ? Infinity : 0)
    candidates.push({ term: r.search_term_view?.search_term, imp, clk, sp, conv, val, roas })
    console.log(`    ${imp.toString().padStart(4)}imp ${clk.toString().padStart(3)}clk $${sp.toFixed(0).padStart(4)} ${conv.toFixed(0).padStart(2)}c $${val.toFixed(0).padStart(4)} ${roas === Infinity ? '   ∞' : roas.toFixed(1).padStart(5)+'x'} — "${r.search_term_view?.search_term}"`)
  }
  writeFileSync('data/snapshots/gads-phase1/poppers-search-terms.json', JSON.stringify(candidates, null, 2))

  // NEGATIVE CANDIDATES: ZERO conversions AND >$15 spent in 90d
  const negatives = candidates.filter(x => x.conv === 0 && x.sp >= 15)
  console.log(`\n  ${negatives.length} candidates for negative add (0 conv, >$15 spent in 90d):`)
  for (const n of negatives) {
    console.log(`    - "${n.term}" — $${n.sp.toFixed(0)} wasted`)
  }

  // Apply negatives at the AD GROUP level (most specific, safest)
  if (negatives.length === 0) {
    console.log('\n  ✓ No negative candidates met threshold. No action taken.')
  } else {
    // Snapshot current ad group negatives
    const currentNeg = await c.query(`
      SELECT ad_group.id, ad_group_criterion.criterion_id, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.negative
      FROM ad_group_criterion
      WHERE ad_group_criterion.negative = TRUE
        AND ad_group_criterion.type = 'KEYWORD'
        AND ad_group.id IN (${adGroupIds.join(',')})
    `)
    writeFileSync('data/snapshots/gads-phase1/poppers-existing-negatives.json', JSON.stringify(currentNeg, null, 2))
    console.log(`\n  Snapshotted ${currentNeg.length} existing ad-group negatives.`)

    // Add the new negatives — phrase match for precision
    const targetAdGroup = adGroupIds[0]
    const cust = c.credentials?.customer_id || process.env.GOOGLE_ADS_CUSTOMER_ID
    const operations = negatives.map(n => ({
      ad_group: `customers/${cust}/adGroups/${targetAdGroup}`,
      keyword: { text: n.term, match_type: 'PHRASE' },
      negative: true,
    }))
    console.log(`\n  Adding ${operations.length} PHRASE negatives to ad_group ${targetAdGroup}...`)
    try {
      const result = await c.adGroupCriteria.create(operations)
      console.log(`  ✓ Added negatives successfully:`)
      for (const r of result.results || []) {
        console.log(`    ${r.resource_name}`)
      }
      writeFileSync('data/snapshots/gads-phase1/poppers-added-negatives.json', JSON.stringify({ adGroupId: targetAdGroup, added: operations.map(o => o.create.keyword.text), result }, null, 2))
    } catch (e) {
      console.log(`  ✗ Failed:`, e.message?.slice(0, 500))
      console.log(`    Full error:`, JSON.stringify(e, null, 2).slice(0, 800))
    }
  }
}

console.log('\n========== PHASE 1.1 COMPLETE ==========\n')
process.exit(0)
