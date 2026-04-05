/**
 * gads-agent-forecast.js
 *
 * Fixed forecasting for every recommendation. No hand-wavy "approximately $X".
 * Every finding gets a forecast object with:
 *   - currentState   : actual 30-day spend/revenue/ROAS from the API
 *   - projectedState : what changes after the change executes
 *   - delta          : spend change, revenue change, net profit change
 *   - monthly        : the same delta projected to a full month
 *   - formula        : the exact math as a human-readable string
 *   - assumptions    : what the forecast is taking on faith
 *   - confidence     : high | medium | low + reason
 *   - netSpendChange : for the week-1 redistribute constraint
 *
 * Josh's rules (2026-04-05):
 *   1. Real data, real fixed forecasting. No vague projections.
 *   2. Apply 47% gross margin to revenue changes for true net profit delta.
 *   3. Week 1 = redistribute existing spend, don't add new spend.
 *   4. Show the math on the card so Josh can verify.
 */
import { microsToDollars } from './gads-client.js'
import { getConfig } from './gads-agent-store.js'
import { getTargetRoasForCampaign, getCampaignById } from './gads-agent-context.js'

// Default window for "monthly" projection. Our 30-day lookback data projects
// directly at 1:1 assuming last 30 days is representative of next 30 days.
const MONTHLY_DAYS = 30

function fmtAud(n, decimals = 0) {
  if (n == null || isNaN(n)) return '$0'
  const abs = Math.abs(Number(n))
  const sign = Number(n) < 0 ? '-' : ''
  return sign + '$' + abs.toLocaleString('en-AU', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100
}

// ── Per-finding-type forecast builders ──────────────────────────────────────

/**
 * Campaign spent meaningfully with zero conversions. Pause = direct save.
 * Confidence HIGH because there's no revenue to lose by definition.
 */
function forecastCampaignZeroConversions(finding, cfg) {
  const c = finding.rawData
  const spend30d = microsToDollars(c.costMicros)
  const revenue30d = 0 // by definition of this finding

  return {
    type: 'pause_save',
    currentState: {
      spendAud: round2(spend30d),
      revenueAud: 0,
      roas: 0,
      period: '30d',
    },
    projectedState: {
      spendAud: 0,
      revenueAud: 0,
      roas: 0,
    },
    delta: {
      spendAud: round2(-spend30d),
      revenueAud: 0,
      netProfitAud: round2(spend30d), // saving all wasted spend = pure profit
    },
    monthly: {
      spendChangeAud: round2(-spend30d),
      revenueChangeAud: 0,
      netProfitChangeAud: round2(spend30d),
    },
    netSpendChangeAud: round2(-spend30d),
    formula: `Pause ${c.name || 'campaign'}: ${fmtAud(spend30d, 2)} spent over 30d with zero conversions → ${fmtAud(spend30d, 2)}/mo recovered, zero revenue at risk.`,
    assumptions: [
      'Based on trailing 30 days of actual spend',
      'Zero conversions measured over the full lookback window',
      'No seasonality adjustment applied',
      `Respects your 90-day Shopify conversion window — campaign age checked separately`,
    ],
    confidence: 'high',
    confidenceReason: 'No conversions recorded over 30 days = nothing to lose by pausing.',
  }
}

/**
 * Keyword spent meaningfully with zero conversions. Same logic as campaign.
 */
function forecastKeywordZeroConversions(finding, cfg) {
  const kw = finding.rawData
  const spend30d = microsToDollars(kw.costMicros)

  return {
    type: 'pause_save',
    currentState: {
      spendAud: round2(spend30d),
      revenueAud: 0,
      roas: 0,
      period: '30d',
    },
    projectedState: { spendAud: 0, revenueAud: 0, roas: 0 },
    delta: {
      spendAud: round2(-spend30d),
      revenueAud: 0,
      netProfitAud: round2(spend30d),
    },
    monthly: {
      spendChangeAud: round2(-spend30d),
      revenueChangeAud: 0,
      netProfitChangeAud: round2(spend30d),
    },
    netSpendChangeAud: round2(-spend30d),
    formula: `Pause "${kw.keywordText}": ${fmtAud(spend30d, 2)} spent over 30d at 0 conversions → ${fmtAud(spend30d, 2)}/mo recovered.`,
    assumptions: [
      'Based on trailing 30 days of actual keyword-level spend',
      'Zero conversions measured over the full lookback window',
      'Does not account for assist conversions (not yet pulled from API)',
    ],
    confidence: 'medium',
    confidenceReason: 'Assist attribution not yet in the model. A keyword with 0 last-click conversions may still contribute to an assist path we cannot see.',
  }
}

/**
 * Zero impression keyword — costs nothing, so save is nominal. Main value is
 * structural cleanup. We call this out explicitly as $0 delta.
 */
function forecastKeywordZeroImpressions(finding) {
  return {
    type: 'structural',
    currentState: { spendAud: 0, revenueAud: 0, roas: 0, period: '14d' },
    projectedState: { spendAud: 0, revenueAud: 0, roas: 0 },
    delta: { spendAud: 0, revenueAud: 0, netProfitAud: 0 },
    monthly: { spendChangeAud: 0, revenueChangeAud: 0, netProfitChangeAud: 0 },
    netSpendChangeAud: 0,
    formula: 'Zero impressions over 14 days = zero spend = zero direct dollar impact. Value is structural — cleaning this up reduces account clutter and improves Smart Bidding signal-to-noise.',
    assumptions: [
      'Keyword is generating no impressions, therefore no spend',
      'Removal has no direct revenue impact',
    ],
    confidence: 'high',
    confidenceReason: 'Zero cost, zero revenue, zero risk.',
  }
}

/**
 * Budget reallocation — the biggest value finding. Shift spend from low-ROAS
 * to high-ROAS. Net spend change = 0. Revenue change = (newRoas - oldRoas) * spend.
 */
function forecastBudgetReallocation(finding, cfg) {
  const rd = finding.rawData
  const low = rd.low || rd
  const lowSpend30d = microsToDollars(low.costMicros)
  const lowRevenue30d = Number(low.conversionsValue) || 0
  const lowRoas = low.roas || (lowSpend30d > 0 ? lowRevenue30d / lowSpend30d : 0)

  // Target: the first high-performing campaign gets the redirect
  const highCampaigns = rd.highRoasCampaigns || []
  const target = highCampaigns[0] || null
  const targetRoas = target?.roas || rd.campaignTargetRoas || cfg.targetRoas || 3.0

  const projectedRevenue = lowSpend30d * targetRoas
  const revenueDelta = projectedRevenue - lowRevenue30d
  const netProfitDelta = revenueDelta * cfg.grossMarginPct // apply margin

  return {
    type: 'reallocation',
    currentState: {
      spendAud: round2(lowSpend30d),
      revenueAud: round2(lowRevenue30d),
      roas: round2(lowRoas),
      period: '30d',
    },
    projectedState: {
      spendAud: round2(lowSpend30d), // same spend, different campaign
      revenueAud: round2(projectedRevenue),
      roas: round2(targetRoas),
    },
    delta: {
      spendAud: 0, // zero-sum reallocation
      revenueAud: round2(revenueDelta),
      netProfitAud: round2(netProfitDelta),
    },
    monthly: {
      spendChangeAud: 0,
      revenueChangeAud: round2(revenueDelta),
      netProfitChangeAud: round2(netProfitDelta),
    },
    netSpendChangeAud: 0,
    formula: `Shift ${fmtAud(lowSpend30d)} from "${low.name}" (${lowRoas.toFixed(2)}× → ${fmtAud(lowRevenue30d)} rev) to "${target?.name || 'high-performing campaign'}" (${targetRoas.toFixed(2)}× → ${fmtAud(projectedRevenue)} rev). Net revenue lift: ${fmtAud(revenueDelta)}/mo. After 47% margin: ${fmtAud(netProfitDelta)}/mo net profit.`,
    assumptions: [
      'Target campaign can absorb redirected spend at its current ROAS',
      'Target ROAS holds as budget increases (may degrade at scale)',
      'No cannibalisation between source and target campaigns',
      '47% gross margin applied to revenue delta for net profit figure',
      'Net spend change: $0 (pure reallocation)',
    ],
    confidence: 'medium',
    confidenceReason: `Target ROAS assumption (${targetRoas.toFixed(2)}×) is based on current performance. Large budget shifts can cause ROAS regression as the target campaign moves into less efficient inventory.`,
  }
}

/**
 * Negative keyword candidate. Blocks wasted clicks.
 * Forecast = wasted 30d spend scaled to monthly.
 */
function forecastNegativeCandidate(finding) {
  const st = finding.rawData
  const wastedSpend30d = microsToDollars(st.costMicros)

  return {
    type: 'negative_save',
    currentState: {
      spendAud: round2(wastedSpend30d),
      revenueAud: 0,
      roas: 0,
      period: '30d',
    },
    projectedState: { spendAud: 0, revenueAud: 0, roas: 0 },
    delta: {
      spendAud: round2(-wastedSpend30d),
      revenueAud: 0,
      netProfitAud: round2(wastedSpend30d),
    },
    monthly: {
      spendChangeAud: round2(-wastedSpend30d),
      revenueChangeAud: 0,
      netProfitChangeAud: round2(wastedSpend30d),
    },
    netSpendChangeAud: round2(-wastedSpend30d),
    formula: `Block "${st.searchTerm}": ${st.clicks} clicks × ${fmtAud(wastedSpend30d / Math.max(st.clicks, 1), 2)} CPC = ${fmtAud(wastedSpend30d, 2)} wasted over 30d → ${fmtAud(wastedSpend30d, 2)}/mo recovered.`,
    assumptions: [
      'Search term will continue triggering at the same volume if not blocked',
      'Zero conversions assumption holds (no hidden conversion path)',
      'Blocks the exact match — broad-match variants may still slip through',
    ],
    confidence: 'high',
    confidenceReason: 'Click volume + zero conversions is a clear-cut waste signal for high-intent category.',
  }
}

/**
 * Shopping product bleeding in PMAX. Exclude = stop spending on that SKU.
 */
function forecastShoppingProductBleed(finding) {
  const p = finding.rawData
  const spend30d = microsToDollars(p.costMicros)

  return {
    type: 'merchant_save',
    currentState: {
      spendAud: round2(spend30d),
      revenueAud: 0,
      roas: 0,
      period: '30d',
    },
    projectedState: { spendAud: 0, revenueAud: 0, roas: 0 },
    delta: {
      spendAud: round2(-spend30d),
      revenueAud: 0,
      netProfitAud: round2(spend30d),
    },
    monthly: {
      spendChangeAud: round2(-spend30d),
      revenueChangeAud: 0,
      netProfitChangeAud: round2(spend30d),
    },
    netSpendChangeAud: round2(-spend30d),
    formula: `Exclude "${p.productTitle}" from PMAX: ${fmtAud(spend30d, 2)} spent over 30d at 0 conversions → ${fmtAud(spend30d, 2)}/mo recovered. Freed budget goes to other SKUs in the same asset group.`,
    assumptions: [
      'Excluding a product redirects its share of PMAX budget to other products, not outside the campaign',
      'No phone/offline conversions attributed to this specific SKU (known attribution gap)',
      'Product has sufficient age for conversion data to be representative',
    ],
    confidence: 'medium',
    confidenceReason: 'Phone/offline bookings for hire products could be attributed to this SKU but not visible to the API. Worth a quick manual check in Shopify before approving.',
  }
}

/**
 * Bid scale opportunity — BLOCKED IN WEEK-1 REDISTRIBUTE MODE because it
 * increases total account spend. Kept for when Josh switches off the flag.
 */
function forecastBidScale(finding, cfg) {
  const kw = finding.rawData
  const currentSpend30d = microsToDollars(kw.costMicros)
  const scaleMultiplier = 1.25 // 25% bid increase
  const projectedSpend = currentSpend30d * scaleMultiplier
  const spendDelta = projectedSpend - currentSpend30d

  const impliedCpp = kw.impliedCpp || 0
  const projectedConversions = (projectedSpend / impliedCpp) || 0
  const projectedRevenue = projectedConversions * (cfg.avgOrderValueAud || 108)
  const currentRevenue = ((currentSpend30d / impliedCpp) || 0) * (cfg.avgOrderValueAud || 108)
  const revenueDelta = projectedRevenue - currentRevenue
  const netProfitDelta = (revenueDelta * cfg.grossMarginPct) - spendDelta

  return {
    type: 'scale_earn',
    currentState: {
      spendAud: round2(currentSpend30d),
      revenueAud: round2(currentRevenue),
      roas: round2(currentRevenue / Math.max(currentSpend30d, 1)),
      period: '30d',
    },
    projectedState: {
      spendAud: round2(projectedSpend),
      revenueAud: round2(projectedRevenue),
      roas: round2(projectedRevenue / Math.max(projectedSpend, 1)),
    },
    delta: {
      spendAud: round2(spendDelta),
      revenueAud: round2(revenueDelta),
      netProfitAud: round2(netProfitDelta),
    },
    monthly: {
      spendChangeAud: round2(spendDelta),
      revenueChangeAud: round2(revenueDelta),
      netProfitChangeAud: round2(netProfitDelta),
    },
    netSpendChangeAud: round2(spendDelta),
    formula: `Scale bid 25%: spend ${fmtAud(currentSpend30d)} → ${fmtAud(projectedSpend)} (+${fmtAud(spendDelta)}). Revenue ${fmtAud(currentRevenue)} → ${fmtAud(projectedRevenue)} (+${fmtAud(revenueDelta)}). Net profit after margin: ${fmtAud(netProfitDelta)}/mo.`,
    assumptions: [
      'Current conversion rate holds as bid increases (often degrades at scale)',
      'Auction inventory exists to absorb the higher bid',
      'ADDS NET SPEND — blocked in week-1 redistribute mode',
    ],
    confidence: 'low',
    confidenceReason: 'Scale findings assume linear extrapolation which rarely holds. Saved for post-week-1 when the account is consolidated around winners.',
  }
}

/**
 * Disapproved ad — hard to forecast without ad-level conversion data.
 * We mark as unknown and let Josh handle it via manual review.
 */
function forecastDisapprovedAd(finding, cfg) {
  return {
    type: 'quality_fix',
    currentState: { spendAud: 0, revenueAud: 0, roas: 0, period: '30d' },
    projectedState: { spendAud: 0, revenueAud: 0, roas: 0 },
    delta: { spendAud: 0, revenueAud: 0, netProfitAud: 0 },
    monthly: { spendChangeAud: 0, revenueChangeAud: 0, netProfitChangeAud: 0 },
    netSpendChangeAud: 0,
    formula: 'Disapproved ads cannot serve. Fixing the disapproval reason restores ad rotation. Dollar impact depends on the ad group inventory — not computable without historical performance for this specific creative.',
    assumptions: [
      'Disapproved ad was historically converting before the disapproval',
      'Other ads in the group may be absorbing the lost inventory',
    ],
    confidence: 'low',
    confidenceReason: 'No ad-level historical performance data pulled yet. Forecast requires a separate query.',
  }
}

/**
 * Low Quality Score — inflates effective CPC. Savings hard to forecast
 * precisely without before/after CPC data.
 */
function forecastLowQuality(finding, cfg) {
  const kw = finding.rawData
  const currentSpend30d = microsToDollars(kw.costMicros)
  // Rough: improving QS from <5 to >5 typically reduces effective CPC 15-25%
  const estimatedSaving = currentSpend30d * 0.20

  return {
    type: 'quality_save',
    currentState: {
      spendAud: round2(currentSpend30d),
      revenueAud: 0,
      roas: 0,
      period: '30d',
    },
    projectedState: {
      spendAud: round2(currentSpend30d - estimatedSaving),
      revenueAud: 0,
      roas: 0,
    },
    delta: {
      spendAud: round2(-estimatedSaving),
      revenueAud: 0,
      netProfitAud: round2(estimatedSaving),
    },
    monthly: {
      spendChangeAud: round2(-estimatedSaving),
      revenueChangeAud: 0,
      netProfitChangeAud: round2(estimatedSaving),
    },
    netSpendChangeAud: round2(-estimatedSaving),
    formula: `Improve Quality Score on "${kw.keywordText}" from ${kw.qualityScore}/10. Typical QS lift reduces effective CPC by ~20% = ${fmtAud(estimatedSaving)}/mo saving on current ${fmtAud(currentSpend30d)} spend.`,
    assumptions: [
      'QS improvement reduces effective CPC by 15-25% (industry average)',
      'Click volume holds constant after QS improvement',
      'Requires landing page / ad relevance work, not just a config change',
    ],
    confidence: 'low',
    confidenceReason: 'QS lifts are not guaranteed from a single change. Requires sustained landing page quality, ad relevance, and CTR improvement.',
  }
}

// ── Entry point: build forecast for any finding ─────────────────────────────

export function buildForecast(finding) {
  const cfg = getConfig()
  switch (finding.issueKey) {
    case 'campaign_zero_conversions':        return forecastCampaignZeroConversions(finding, cfg)
    case 'keyword_zero_conversions':         return forecastKeywordZeroConversions(finding, cfg)
    case 'keyword_zero_impressions':         return forecastKeywordZeroImpressions(finding)
    case 'budget_reallocation':              return forecastBudgetReallocation(finding, cfg)
    case 'negative_candidate':               return forecastNegativeCandidate(finding)
    case 'shopping_product_zero_conversions': return forecastShoppingProductBleed(finding)
    case 'bid_underbid':                     return forecastBidScale(finding, cfg)
    case 'disapproved_ad':                   return forecastDisapprovedAd(finding, cfg)
    case 'low_quality_score':                return forecastLowQuality(finding, cfg)
    default:
      return null
  }
}

// ── Week-1 redistribute constraint ──────────────────────────────────────────
//
// Returns true if the finding would ADD net spend to the account. When the
// redistributeModeOnly flag is on, such findings are suppressed entirely.

export function findingAddsNetSpend(finding) {
  const fc = finding.forecast
  if (!fc) return false
  return (fc.netSpendChangeAud || 0) > 0.01 // any positive spend change > 1 cent
}

// ── Cumulative tally across multiple findings ───────────────────────────────
//
// Sums up the dollar impact of approving every finding in a list. Used by
// the "if you approve all" panel at the top of the Findings tab.

export function computeCumulativeTally(findings) {
  const tally = {
    count: 0,
    spendChangeAud: 0,
    revenueChangeAud: 0,
    netProfitChangeAud: 0,
    maxNetSpendIncrease: 0,
    warnings: [],
  }
  for (const f of findings) {
    const fc = f.forecast
    if (!fc) continue
    tally.count++
    tally.spendChangeAud    += fc.monthly?.spendChangeAud    || 0
    tally.revenueChangeAud  += fc.monthly?.revenueChangeAud  || 0
    tally.netProfitChangeAud += fc.monthly?.netProfitChangeAud || 0
    if ((fc.netSpendChangeAud || 0) > tally.maxNetSpendIncrease) {
      tally.maxNetSpendIncrease = fc.netSpendChangeAud
    }
  }

  // Safety threshold: if cumulative monthly spend change exceeds this, warn
  const cfg = getConfig()
  const dailyBudgetCap = 245 // Josh's current daily spend total (approx from discovery)
  const monthlySpendCap = dailyBudgetCap * 30
  if (tally.spendChangeAud > monthlySpendCap * 0.15) {
    tally.warnings.push(`Cumulative monthly spend increase of ${fmtAud(tally.spendChangeAud)} exceeds 15% of current budget envelope — review before bulk-approving.`)
  }
  if (tally.spendChangeAud < -monthlySpendCap * 0.30) {
    tally.warnings.push(`Cumulative monthly spend cut of ${fmtAud(Math.abs(tally.spendChangeAud))} would remove more than 30% of current budget — confirm this is intentional.`)
  }

  return {
    ...tally,
    spendChangeAud:    round2(tally.spendChangeAud),
    revenueChangeAud:  round2(tally.revenueChangeAud),
    netProfitChangeAud: round2(tally.netProfitChangeAud),
    maxNetSpendIncrease: round2(tally.maxNetSpendIncrease),
  }
}
