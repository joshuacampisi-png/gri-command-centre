/**
 * cannons-replacement-keywords.js
 *
 * Find replacement keyword candidates for the 24 dead keywords we're about
 * to pause. Methodology:
 *
 *   1. Pull all search terms the Cannons campaign has served in the last 90d
 *      (>0 impressions)
 *   2. For each search term, collect: total imps, total clicks, total conv,
 *      total conv-value, matched keyword, matched match-type
 *   3. Keep candidates that:
 *       - ≥20 impressions in 90d (real volume, not noise)
 *       - CTR ≥3% OR ≥1 conversion (signal of intent)
 *       - Currently being caught by a BROAD variant (can be tightened to
 *         PHRASE/EXACT for better bid control and ML signal), OR
 *       - Not in the campaign's enabled keyword list at all
 *   4. Dedupe and rank by conversions then by impressions
 *   5. Exclude any term that exactly matches an already-enabled keyword text
 *
 * Output: ranked replacement list with full metrics for the hygiene card.
 *
 * Run: node scripts/cannons-replacement-keywords.js
 */

import 'dotenv/config'
import { getGadsCustomer, microsToDollars } from '../server/lib/gads-client.js'
import { writeFileSync } from 'fs'

const CAMPAIGN_ID = '21094179575'

async function main() {
  const customer = getGadsCustomer()
  const fetchedAt = new Date().toISOString()
  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(endDate.getDate() - 90)
  const fromStr = startDate.toISOString().slice(0, 10)
  const toStr = endDate.toISOString().slice(0, 10)

  console.log(`\n[fetchedAt=${fetchedAt}] window=${fromStr}→${toStr}`)

  // Step 1: all enabled keywords currently in the campaign
  const kwRows = await customer.query(`
    SELECT
      ad_group_criterion.keyword.text,
      ad_group_criterion.keyword.match_type,
      ad_group_criterion.status
    FROM keyword_view
    WHERE campaign.id = ${CAMPAIGN_ID}
      AND ad_group_criterion.status = 'ENABLED'
  `)
  const existingKeywords = new Set()
  for (const k of kwRows) {
    existingKeywords.add(k.ad_group_criterion.keyword.text.toLowerCase().trim())
  }
  console.log(`  enabled keywords in campaign: ${existingKeywords.size}`)

  // Step 2: search terms with matched keyword info
  const stRows = await customer.query(`
    SELECT
      search_term_view.search_term,
      segments.keyword.info.text,
      segments.keyword.info.match_type,
      metrics.cost_micros,
      metrics.clicks,
      metrics.impressions,
      metrics.conversions,
      metrics.conversions_value
    FROM search_term_view
    WHERE campaign.id = ${CAMPAIGN_ID}
      AND segments.date BETWEEN '${fromStr}' AND '${toStr}'
      AND metrics.impressions > 0
  `)
  console.log(`  search terms rows (90d, >0 imps): ${stRows.length}`)

  // Aggregate per unique search term (rows are split by segments.keyword)
  const agg = new Map()
  for (const r of stRows) {
    const term = r.search_term_view.search_term.toLowerCase().trim()
    if (!agg.has(term)) {
      agg.set(term, {
        term,
        impressions: 0, clicks: 0, cost: 0, conversions: 0, conversionsValue: 0,
        matchedBy: new Set(), matchTypes: new Set(),
      })
    }
    const a = agg.get(term)
    a.impressions += Number(r.metrics.impressions || 0)
    a.clicks += Number(r.metrics.clicks || 0)
    a.cost += microsToDollars(r.metrics.cost_micros || 0)
    a.conversions += Number(r.metrics.conversions || 0)
    a.conversionsValue += Number(r.metrics.conversions_value || 0)
    if (r.segments?.keyword?.info?.text) {
      a.matchedBy.add(r.segments.keyword.info.text)
      a.matchTypes.add(r.segments.keyword.info.match_type)
    }
  }
  console.log(`  unique search terms: ${agg.size}`)

  // Step 3: filter candidates
  const candidates = []
  for (const a of agg.values()) {
    const ctr = a.impressions > 0 ? a.clicks / a.impressions : 0
    const hasSignal = a.impressions >= 20 && (ctr >= 0.03 || a.conversions >= 1)
    if (!hasSignal) continue
    // exclude if already an enabled keyword text (case-insensitive)
    if (existingKeywords.has(a.term)) continue
    // 2 = EXACT, 3 = PHRASE, 4 = BROAD (google-ads-api numeric enum)
    const currentlyBroadOnly = [...a.matchTypes].every(t => t === 4 || t === 'BROAD')
    candidates.push({
      term: a.term,
      impressions: a.impressions,
      clicks: a.clicks,
      cost: +a.cost.toFixed(2),
      ctr: +(ctr * 100).toFixed(2),
      conversions: +a.conversions.toFixed(2),
      conversionsValue: +a.conversionsValue.toFixed(2),
      cpa: a.conversions > 0 ? +(a.cost / a.conversions).toFixed(2) : null,
      roas: a.cost > 0 ? +(a.conversionsValue / a.cost).toFixed(2) : null,
      matchedBy: [...a.matchedBy],
      currentlyBroadOnly,
    })
  }

  // Step 4: rank by conversions then impressions
  candidates.sort((x, y) => (y.conversions - x.conversions) || (y.impressions - x.impressions))

  console.log(`\n━━━━ REPLACEMENT CANDIDATES (${candidates.length}) ━━━━`)
  for (const c of candidates) {
    console.log(
      `  "${c.term}"`,
      `imps=${c.impressions}`,
      `clk=${c.clicks}`,
      `ctr=${c.ctr}%`,
      `conv=${c.conversions}`,
      `val=$${c.conversionsValue}`,
      `cpa=${c.cpa != null ? '$' + c.cpa : '—'}`,
      `roas=${c.roas != null ? c.roas + 'x' : '—'}`,
    )
    console.log(`     currently matched by: [${c.matchedBy.join(', ')}]`)
  }

  // Ranking into tiers for the card
  const highConv = candidates.filter(c => c.conversions >= 1)
  const highVolume = candidates.filter(c => c.conversions < 1 && c.impressions >= 100)
  const earlySignal = candidates.filter(c => c.conversions < 1 && c.impressions >= 20 && c.impressions < 100)
  console.log(`\n  tier A (≥1 conv):        ${highConv.length}`)
  console.log(`  tier B (≥100 imps, 0 conv): ${highVolume.length}`)
  console.log(`  tier C (20-99 imps, 0 conv): ${earlySignal.length}`)

  const payload = {
    fetchedAt, campaignId: CAMPAIGN_ID,
    windowDays: 90, windowStart: fromStr, windowEnd: toStr,
    candidateCount: candidates.length,
    tierA_highConv: highConv,
    tierB_highVolume: highVolume,
    tierC_earlySignal: earlySignal,
    allCandidates: candidates,
  }
  writeFileSync('/tmp/cannons-replacements.json', JSON.stringify(payload, null, 2))
  console.log('\n→ /tmp/cannons-replacements.json')
}

main().catch(err => {
  console.error('ERROR:', err?.errors || err?.message || err)
  process.exit(1)
})
