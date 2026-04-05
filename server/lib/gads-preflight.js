/**
 * gads-preflight.js
 *
 * 5-question pre-flight validator for Google Ads Agent recommendations.
 *
 * RULE: No card ships to the pending queue without all 5 questions answered.
 * If any question fails or has insufficient data, the finding goes to
 * 'needs-review' status instead of 'pending'. Josh's 5 questions (2026-04-05):
 *
 *   Q1. Is this campaign/keyword TOF where CPA systematically undercounts?
 *   Q2. Is the change based on BOTH live AND historical data? Will it affect anything else?
 *   Q3. Why did the marketing team set it up this way? Does the data contradict that intent?
 *   Q4. Will it make a positive impact, and how specifically?
 *   Q5. Is the goal PROFIT, not just revenue?
 *
 * Each question returns { answered, analysis, verdict: 'pass'|'fail'|'needs-data' }.
 * The preflight object is stored on the card's campaignContext.preflight for
 * full audit trail visibility.
 */

import {
  getCampaignContextLive,
  getCoverageCrossCheck,
  getReplacementCandidates,
} from './gads-live.js'
import { getConfig } from './gads-agent-store.js'

// ── Q1: TOF relevance ─────────────────────────────────────────────────────

function assessTofRelevance(finding, campaignCtx) {
  const bg = campaignCtx?.brandGeneric
  const isTof = campaignCtx?.isTofAcquisition || false
  const brandedPct = bg?.brandedPct || 0
  const genericPct = bg?.genericPct || 0
  const channelType = campaignCtx?.campaign?.channelType
  const issueKey = finding.issueKey || ''

  // Actions that reduce/pause a TOF campaign need extra scrutiny
  const isReductiveAction = [
    'campaign_zero_conversions', 'budget_reallocation', 'keyword_zero_conversions',
  ].includes(issueKey)

  if (!bg) {
    return {
      answered: false,
      analysis: 'Cannot assess TOF relevance — branded/generic classification data missing. Need live search term data.',
      verdict: 'needs-data',
    }
  }

  if (isTof && isReductiveAction) {
    return {
      answered: true,
      analysis: `Campaign is ${genericPct}% generic search (${brandedPct}% branded) — classified as TOF acquisition. ` +
        `This finding proposes a reductive action (${issueKey}) on a TOF campaign where last-click CPA/ROAS ` +
        `systematically undercounts true contribution. LTGP:nCAC cohort data is not yet available to validate ` +
        `long-term value. Reductive actions on TOF campaigns require manual Josh review with full context.`,
      verdict: 'fail',
      reason: 'tof-reductive-action',
      brandedPct,
      genericPct,
    }
  }

  if (isTof) {
    return {
      answered: true,
      analysis: `Campaign is ${genericPct}% generic search — TOF acquisition. Last-click metrics undercount. ` +
        `Proposed action (${issueKey}) is non-reductive, so TOF status does not block it, but the card ` +
        `should note that true impact may be higher than last-click attribution shows.`,
      verdict: 'pass',
      note: 'tof-non-reductive',
      brandedPct,
      genericPct,
    }
  }

  return {
    answered: true,
    analysis: `Campaign is ${brandedPct}% branded / ${genericPct}% generic. ` +
      `Not classified as TOF acquisition (branded share too high or mixed intent). ` +
      `Last-click metrics are a reasonable proxy for this campaign type.`,
    verdict: 'pass',
    brandedPct,
    genericPct,
  }
}

// ── Q2: Live + historical data, cross-impact ─────────────────────────────

function assessDataFreshness(finding, campaignCtx, dataFetchedAt) {
  const hasLiveData = !!dataFetchedAt
  const fetchAge = hasLiveData ? Date.now() - new Date(dataFetchedAt).getTime() : Infinity
  const maxAgeMs = 10 * 60 * 1000 // 10 minutes

  if (!hasLiveData) {
    return {
      answered: false,
      analysis: 'No dataFetchedAt timestamp — data source unknown. Cannot verify freshness.',
      verdict: 'needs-data',
    }
  }

  if (fetchAge > maxAgeMs) {
    return {
      answered: false,
      analysis: `Data fetched ${Math.round(fetchAge / 60000)} minutes ago (max ${maxAgeMs / 60000} min). Stale data — refetch required.`,
      verdict: 'needs-data',
      fetchedAt: dataFetchedAt,
      ageMs: fetchAge,
    }
  }

  // Check what the finding touches and whether cross-impact is possible
  const proposed = finding.proposedChange || {}
  const touchesBudget = ['REDUCE_CAMPAIGN_BUDGET', 'UPDATE_BUDGET'].includes(proposed.action)
  const touchesKeyword = ['PAUSE_KEYWORD', 'PAUSE_KEYWORD_BATCH', 'ADD_KEYWORD_BATCH', 'CANNONS_HYGIENE'].includes(proposed.action)
  const touchesCampaign = ['PAUSE_CAMPAIGN'].includes(proposed.action)

  const crossImpactRisks = []
  if (touchesBudget) crossImpactRisks.push('shared budgets with other campaigns')
  if (touchesCampaign) crossImpactRisks.push('all keywords and ads in this campaign affected')
  // Keywords in shared negative lists could propagate
  if (proposed.action === 'ADD_NEGATIVE_KEYWORD') crossImpactRisks.push('shared negative lists may propagate to other campaigns')

  return {
    answered: true,
    analysis: `Live data fetched ${Math.round(fetchAge / 1000)}s ago (within ${maxAgeMs / 60000}-min window). ` +
      `Change type: ${proposed.action || 'unknown'}. ` +
      (crossImpactRisks.length > 0
        ? `Cross-impact risks: ${crossImpactRisks.join('; ')}.`
        : 'No cross-impact detected — change is isolated to the target entity.'),
    verdict: 'pass',
    fetchedAt: dataFetchedAt,
    ageMs: fetchAge,
    crossImpactRisks,
  }
}

// ── Q3: Marketing intent reverse-engineering ─────────────────────────────

function assessMarketingIntent(finding, campaignCtx) {
  const campaign = campaignCtx?.campaign
  const issueKey = finding.issueKey || ''
  const channelType = campaign?.channelType
  const biddingStrategy = campaign?.biddingStrategy

  if (!campaign) {
    return {
      answered: false,
      analysis: 'Campaign metadata not available — cannot reverse-engineer marketing intent.',
      verdict: 'needs-data',
    }
  }

  // Infer the original marketing intent from campaign structure
  const intentSignals = []

  // Channel type tells us a lot
  if (channelType === 2 || channelType === 'SEARCH') {
    intentSignals.push('Search campaign — captures active intent from users typing queries')
  } else if (channelType === 10 || channelType === 'PERFORMANCE_MAX') {
    intentSignals.push('PMax campaign — Google auto-distributes across surfaces for maximum conversion value')
  } else if (channelType === 4 || channelType === 'SHOPPING') {
    intentSignals.push('Shopping campaign — product-feed-driven, captures purchase-intent product searches')
  }

  // Bidding strategy tells us the optimisation target
  // 11 = MAXIMIZE_CONVERSION_VALUE, 9 = MAXIMIZE_CONVERSIONS, 6 = TARGET_CPA, 3 = TARGET_ROAS
  const bidStrategyLabels = {
    3: 'Target ROAS — optimising for return efficiency',
    6: 'Target CPA — optimising for cost per acquisition',
    9: 'Maximize Conversions — optimising for volume regardless of value',
    11: 'Maximize Conversion Value — optimising for total revenue, not volume',
  }
  const bidLabel = bidStrategyLabels[biddingStrategy] || `Bidding strategy ${biddingStrategy}`
  intentSignals.push(bidLabel)

  // Budget level signals scale intent
  const dailyBudget = campaign?.dailyBudgetAud || 0
  if (dailyBudget <= 20) intentSignals.push('Low budget ($' + dailyBudget + '/day) — testing or niche targeting')
  else if (dailyBudget <= 50) intentSignals.push('Moderate budget ($' + dailyBudget + '/day) — targeted acquisition')
  else if (dailyBudget > 100) intentSignals.push('High budget ($' + dailyBudget + '/day) — scaled acquisition or brand defense')

  // Issue-specific intent context
  let intentContradiction = null
  if (issueKey === 'keyword_zero_impressions') {
    intentContradiction = 'Zero-impression keywords were originally added for broad coverage. ' +
      'If the campaign has migrated to fewer, better-performing broad-match variants, ' +
      'these dead keywords are structural noise from an earlier strategy — safe to clean.'
  } else if (issueKey === 'budget_reallocation') {
    intentContradiction = 'Budget was allocated to this campaign for a reason. ' +
      'Before reducing, verify whether this campaign serves a TOF, brand-defense, or ' +
      'geographic-coverage purpose that revenue alone does not capture.'
  } else if (issueKey === 'negative_candidate') {
    intentContradiction = 'Search term is being matched by the current keyword set. ' +
      'Before blocking it, verify it is genuinely irrelevant — not just low-converting ' +
      'in a small sample. Consider whether this term drives assisted conversions.'
  }

  return {
    answered: true,
    analysis: `Original intent signals: ${intentSignals.join('. ')}. ` +
      (intentContradiction || 'No specific intent contradiction detected for this action type.'),
    verdict: 'pass',
    intentSignals,
    intentContradiction,
  }
}

// ── Q4: Positive impact proof ────────────────────────────────────────────

function assessPositiveImpact(finding) {
  const forecast = finding.forecast || {}
  const impact = finding.projectedDollarImpact || 0
  const direction = finding.projectedImpactDirection || 'unknown'
  const issueKey = finding.issueKey || ''
  const proposed = finding.proposedChange || {}

  // Structural cleanup (zero-imp kws, disapproved ads) has inherent positive
  // value even without dollar impact
  const isHygiene = ['keyword_zero_impressions', 'disapproved_ad', 'low_quality_score'].includes(issueKey)

  if (isHygiene) {
    return {
      answered: true,
      analysis: `Hygiene action (${issueKey}). Impact is account cleanliness and ML signal quality, ` +
        `not direct dollar uplift. Projected dollar impact is conservative or zero — this is correct ` +
        `for hygiene-class changes. Do not inflate.`,
      verdict: 'pass',
      impactClass: 'hygiene',
      projectedImpact: impact,
    }
  }

  if (impact === 0 && !isHygiene) {
    return {
      answered: false,
      analysis: 'Zero projected dollar impact on a non-hygiene finding. ' +
        'Either the forecast model could not compute impact, or the impact is genuinely zero. ' +
        'If zero, this card should not claim positive impact.',
      verdict: 'needs-data',
      impactClass: 'unknown',
    }
  }

  // Check for vague "reallocation opportunity" framing without specific mechanism
  if (issueKey === 'budget_reallocation' && !forecast.monthly?.netProfitChangeAud) {
    return {
      answered: false,
      analysis: 'Budget reallocation finding lacks a net-profit forecast (only has revenue or no forecast at all). ' +
        'Reallocation cards MUST show the CM$ delta, not just revenue. The old engine shipped a "$1,271 potential revenue" ' +
        'card that was misleading. Compute net profit impact before shipping.',
      verdict: 'fail',
      reason: 'reallocation-no-cm-forecast',
    }
  }

  return {
    answered: true,
    analysis: `Projected impact: $${impact.toFixed(2)}/month (${direction}). ` +
      (forecast.monthly?.netProfitChangeAud != null
        ? `Net profit Δ: $${forecast.monthly.netProfitChangeAud.toFixed(2)}/month after margin.`
        : 'Dollar impact expressed as raw estimate — CM$ breakdown not yet computed.'),
    verdict: 'pass',
    impactClass: impact > 100 ? 'high' : impact > 20 ? 'medium' : 'low',
    projectedImpact: impact,
  }
}

// ── Q5: Profit not revenue ──────────────────────────────────────────────

function assessProfitFraming(finding) {
  const cfg = getConfig()
  const marginPct = cfg.grossMarginPct || 0.47
  const forecast = finding.forecast || {}
  const impact = finding.projectedDollarImpact || 0
  const direction = finding.projectedImpactDirection || ''

  // Check if the finding's copy or impact is revenue-framed
  const whyText = (finding.whyItShouldChange || '').toLowerCase()
  const titleText = (finding.issueTitle || '').toLowerCase()
  const revenueWords = ['revenue', 'monthly revenue', 'potential revenue', 'revenue uplift']
  const profitWords = ['profit', 'contribution margin', 'cm$', 'margin', 'net profit']

  const mentionsRevenue = revenueWords.some(w => whyText.includes(w) || titleText.includes(w))
  const mentionsProfit = profitWords.some(w => whyText.includes(w) || titleText.includes(w))

  if (mentionsRevenue && !mentionsProfit) {
    return {
      answered: true,
      analysis: `Card copy references revenue without mentioning profit/margin/CM$. ` +
        `Per Josh's rule: "GOAL IS TO MAKE PROFIT not only revenue". ` +
        `Card must be reframed to express impact in contribution margin terms using ${Math.round(marginPct * 100)}% margin.`,
      verdict: 'fail',
      reason: 'revenue-only-framing',
      marginPct,
    }
  }

  // Check if the projected impact already accounts for margin
  const hasCmForecast = forecast.monthly?.netProfitChangeAud != null
  if (hasCmForecast) {
    return {
      answered: true,
      analysis: `Forecast includes net profit computation (margin ${Math.round(marginPct * 100)}%). ` +
        `Projected CM$ Δ: $${forecast.monthly.netProfitChangeAud.toFixed(2)}/month. Profit-framed correctly.`,
      verdict: 'pass',
      marginPct,
    }
  }

  // If no CM forecast but impact is small (hygiene), pass with note
  if (impact <= 50) {
    return {
      answered: true,
      analysis: `Small-impact finding ($${impact.toFixed(2)}/month). No detailed CM$ breakdown computed. ` +
        `Acceptable for hygiene-class cards. For any card >$50/month projected impact, a CM$ breakdown is required.`,
      verdict: 'pass',
      note: 'small-impact-pass',
      marginPct,
    }
  }

  return {
    answered: false,
    analysis: `Projected impact $${impact.toFixed(2)}/month exceeds $50 threshold but has no CM$ breakdown. ` +
      `Must compute net profit using ${Math.round(marginPct * 100)}% margin before shipping.`,
    verdict: 'needs-data',
    marginPct,
  }
}

// ── Main pre-flight runner ──────────────────────────────────────────────

/**
 * Run the full 5-question pre-flight on a finding.
 *
 * @param {Object} finding - the raw finding from gads-agent-engine.js
 * @param {Object} campaignCtx - output of getCampaignContextLive()
 * @param {string} dataFetchedAt - ISO timestamp of when the live data was pulled
 * @returns {{ questions: {...}, allPassed: boolean, passCount: number, failCount: number, needsDataCount: number, verdict: 'ship'|'needs-review'|'block' }}
 */
export function runPreflight(finding, campaignCtx, dataFetchedAt) {
  const q1 = assessTofRelevance(finding, campaignCtx)
  const q2 = assessDataFreshness(finding, campaignCtx, dataFetchedAt)
  const q3 = assessMarketingIntent(finding, campaignCtx)
  const q4 = assessPositiveImpact(finding)
  const q5 = assessProfitFraming(finding)

  const questions = {
    q1_tof_relevance: q1,
    q2_live_and_historical: q2,
    q3_marketing_intent: q3,
    q4_positive_impact: q4,
    q5_profit_not_revenue: q5,
  }

  const all = [q1, q2, q3, q4, q5]
  const passCount = all.filter(q => q.verdict === 'pass').length
  const failCount = all.filter(q => q.verdict === 'fail').length
  const needsDataCount = all.filter(q => q.verdict === 'needs-data').length
  const allPassed = passCount === 5

  // Verdict determines what status the card gets
  let verdict = 'ship' // → status: pending
  if (failCount > 0) verdict = 'block' // → status: needs-review (hard fail)
  else if (needsDataCount > 0) verdict = 'needs-review' // → status: needs-review (data gap)

  return {
    version: '1.0',
    questions,
    allPassed,
    passCount,
    failCount,
    needsDataCount,
    verdict,
    ranAt: new Date().toISOString(),
  }
}

/**
 * Run pre-flight with automatic live data fetching.
 * Convenience wrapper that pulls campaign context from gads-live.js
 * and passes it through to runPreflight.
 *
 * @param {Object} finding - raw finding from the engine
 * @returns {Promise<Object>} preflight result
 */
export async function runPreflightWithLiveData(finding) {
  const campaignId = finding.campaignId || finding.entityId || finding.currentValue?.campaignId
  if (!campaignId) {
    return runPreflight(finding, null, null)
  }

  const ctx = await getCampaignContextLive(campaignId, 30)
  return runPreflight(finding, ctx, ctx.fetchedAt)
}
