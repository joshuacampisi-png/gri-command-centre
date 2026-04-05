/**
 * cannons-dead-keywords-live.js
 *
 * Pull the complete LIVE dead-keyword list for the Cannons campaign directly
 * from the Google Ads API. No stored blobs. Groups by ad group and dedupes
 * identical keyword+match-type pairs. Output is the authoritative input for
 * the consolidated hygiene card.
 *
 * Run: node scripts/cannons-dead-keywords-live.js
 */

import 'dotenv/config'
import { getGadsCustomer, microsToDollars } from '../server/lib/gads-client.js'

const CAMPAIGN_ID = '21094179575'

const MATCH_TYPE_LABELS = { 2: 'EXACT', 3: 'PHRASE', 4: 'BROAD' }

async function main() {
  const customer = getGadsCustomer()
  const fetchedAt = new Date().toISOString()

  console.log(`\n[fetchedAt=${fetchedAt}]  Pulling keyword_view for campaign ${CAMPAIGN_ID}...`)

  const rows = await customer.query(`
    SELECT
      ad_group_criterion.criterion_id,
      ad_group_criterion.keyword.text,
      ad_group_criterion.keyword.match_type,
      ad_group_criterion.status,
      ad_group.id,
      ad_group.name,
      ad_group.status,
      metrics.cost_micros,
      metrics.clicks,
      metrics.impressions,
      metrics.conversions,
      metrics.conversions_value
    FROM keyword_view
    WHERE campaign.id = ${CAMPAIGN_ID}
      AND segments.date DURING LAST_30_DAYS
      AND ad_group_criterion.status = 'ENABLED'
    ORDER BY metrics.cost_micros DESC
  `)

  const live = rows.filter(r => Number(r.metrics.impressions || 0) > 0)
  const dead = rows.filter(r => Number(r.metrics.impressions || 0) === 0)

  console.log(`\nTotal ENABLED keywords: ${rows.length}`)
  console.log(`  Live (>0 impressions last 30d): ${live.length}`)
  console.log(`  Dead (0 impressions last 30d):  ${dead.length}`)

  // Group dead keywords by ad group
  const byAdGroup = {}
  for (const k of dead) {
    const agId = k.ad_group.id
    if (!byAdGroup[agId]) {
      byAdGroup[agId] = {
        adGroupId: String(agId),
        adGroupName: k.ad_group.name,
        adGroupStatus: k.ad_group.status,
        keywords: [],
      }
    }
    byAdGroup[agId].keywords.push({
      criterionId: String(k.ad_group_criterion.criterion_id),
      text: k.ad_group_criterion.keyword.text,
      matchType: MATCH_TYPE_LABELS[k.ad_group_criterion.keyword.match_type] || 'UNKNOWN',
    })
  }

  console.log('\n━━━━ DEAD KEYWORDS BY AD GROUP ━━━━')
  const groups = Object.values(byAdGroup).sort((a, b) => b.keywords.length - a.keywords.length)
  for (const g of groups) {
    const statusLabel = g.adGroupStatus === 2 ? 'ENABLED' : g.adGroupStatus === 3 ? 'PAUSED' : `status=${g.adGroupStatus}`
    console.log(`\n  ── ${g.adGroupName} (${statusLabel}) — ${g.keywords.length} dead`)
    for (const kw of g.keywords) {
      console.log(`      [${kw.matchType}] "${kw.text}"  crit=${kw.criterionId}`)
    }
  }

  console.log('\n━━━━ LIVE KEYWORDS (kept for context) ━━━━')
  for (const k of live) {
    const m = k.metrics
    const cost = microsToDollars(m.cost_micros || 0)
    const cv = Number(m.conversions_value || 0)
    console.log(
      `  [${MATCH_TYPE_LABELS[k.ad_group_criterion.keyword.match_type]}]`,
      `"${k.ad_group_criterion.keyword.text}"`,
      `imps=${m.impressions}`,
      `clk=${m.clicks}`,
      `spend=$${cost.toFixed(2)}`,
      `conv=${Number(m.conversions || 0).toFixed(1)}`,
      `val=$${cv.toFixed(2)}`,
      `roas=${cost > 0 ? (cv / cost).toFixed(2) + 'x' : '—'}`,
    )
  }

  // Emit a compact JSON payload for the card generator
  const payload = {
    fetchedAt,
    campaignId: CAMPAIGN_ID,
    campaignName: 'GRI | Search | Cannons',
    totalKeywords: rows.length,
    liveCount: live.length,
    deadCount: dead.length,
    adGroups: groups.map(g => ({
      id: g.adGroupId,
      name: g.adGroupName,
      status: g.adGroupStatus,
      deadKeywords: g.keywords,
    })),
    liveKeywords: live.map(k => ({
      criterionId: String(k.ad_group_criterion.criterion_id),
      text: k.ad_group_criterion.keyword.text,
      matchType: MATCH_TYPE_LABELS[k.ad_group_criterion.keyword.match_type],
      impressions: Number(k.metrics.impressions || 0),
      clicks: Number(k.metrics.clicks || 0),
      spend: microsToDollars(k.metrics.cost_micros || 0),
      conversions: Number(k.metrics.conversions || 0),
      conversionsValue: Number(k.metrics.conversions_value || 0),
    })),
  }

  console.log('\n━━━━ PAYLOAD (for card generator) ━━━━')
  console.log(JSON.stringify(payload, null, 2).slice(0, 2000))
  console.log('...')
  console.log(`\npayload.deadCount=${payload.deadCount}  payload.adGroups=${payload.adGroups.length}`)

  // Write to a tmp file for the next step
  const fs = await import('fs')
  fs.writeFileSync('/tmp/cannons-hygiene-payload.json', JSON.stringify(payload, null, 2))
  console.log('\n→ written to /tmp/cannons-hygiene-payload.json')
}

main().catch(err => {
  console.error('ERROR:', err?.errors || err?.message || err)
  process.exit(1)
})
