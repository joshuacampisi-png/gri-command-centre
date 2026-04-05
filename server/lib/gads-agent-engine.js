/**
 * gads-agent-engine.js
 * Rules engine for the Google Ads Agent.
 * Pulls raw data via gads-queries.js, applies deterministic threshold rules
 * from config, and returns a ranked list of findings.
 *
 * A "finding" is objective evidence that something is wrong or scalable.
 * Findings get passed to gads-agent-intelligence.js which wraps them in
 * a recommendation card with AI-generated copy and web-searched best practice.
 */
import {
  getCampaignPerformance,
  getKeywordPerformance,
  getSearchTermsReport,
  getAdPerformance,
  getZeroImpressionKeywords,
  getShoppingProductPerformance,
} from './gads-queries.js'
import { microsToDollars } from './gads-client.js'
import { getConfig, logAudit } from './gads-agent-store.js'
import {
  refreshAutoContext,
  getAutoContext,
  evaluateFindingAgainstContext,
  getTargetRoasForCampaign,
  getCampaignById,
} from './gads-agent-context.js'
import { buildForecast, findingAddsNetSpend } from './gads-agent-forecast.js'
import { getFrameworkMetrics } from './gads-agent-framework-metrics.js'

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 }

function toRoas(convValue, costMicros) {
  const cost = microsToDollars(costMicros)
  if (cost <= 0) return 0
  return (Number(convValue) || 0) / cost
}

function fingerprint(entityType, entityId, issueKey) {
  return `${entityType}::${entityId}::${issueKey}`
}

// ── Individual check functions ──────────────────────────────────────────────

function checkCampaignBleed(campaigns, cfg) {
  const out = []
  for (const c of campaigns) {
    const spendAud = microsToDollars(c.costMicros)
    if (spendAud >= cfg.campaignBleedThresholdAud && c.conversions === 0) {
      out.push({
        category: 'spend',
        severity: spendAud >= cfg.campaignBleedThresholdAud * 2 ? 'critical' : 'high',
        entityType: 'campaign',
        entityId: c.campaignId,
        entityName: c.name,
        issueTitle: `Campaign "${c.name}" spent $${spendAud.toFixed(2)} AUD with zero conversions`,
        issueKey: 'campaign_zero_conversions',
        rawData: c,
        estimatedWastedSpendAud: spendAud,
      })
    }
  }
  return out
}

function checkBudgetReallocation(campaigns, cfg) {
  // Each campaign's "underperforming" threshold is a MULTIPLIER of ITS OWN target ROAS.
  // reallocationLowRoas=0.80 means "below 80% of target". reallocationHighRoas=1.40
  // means "above 140% of target". This respects per-campaign target overrides
  // (e.g. Cannon & Powder Reveals at 2.0x target has a different trigger band
  // than a 3.0x target campaign).
  const enriched = campaigns
    .filter(c => microsToDollars(c.costMicros) > 10)
    .map(c => {
      const campTarget = getTargetRoasForCampaign(c.campaignId) || cfg.targetRoas
      return { ...c, roas: toRoas(c.conversionsValue, c.costMicros), campTarget }
    })

  const lows  = enriched.filter(c => c.roas > 0 && c.roas < c.campTarget * cfg.reallocationLowRoas)
  const highs = enriched.filter(c => c.roas > c.campTarget * cfg.reallocationHighRoas)
  if (lows.length === 0 || highs.length === 0) return []

  const highNames = highs.map(h => h.name).join(', ')
  const out = []
  for (const low of lows) {
    const spendAud = microsToDollars(low.costMicros)
    const targetRoasGap = Math.max(0, low.campTarget - low.roas)
    out.push({
      category: 'spend',
      severity: 'high',
      entityType: 'campaign',
      entityId: low.campaignId,
      entityName: low.name,
      issueTitle: `Reallocation opportunity — "${low.name}" at ${low.roas.toFixed(2)}x ROAS (target ${low.campTarget}x) while ${highs.length} campaign(s) exceed their targets`,
      issueKey: 'budget_reallocation',
      // Promote campaignId to top-level rawData so context filter can see it
      rawData: {
        campaignId: low.campaignId,
        low,
        highCampaignNames: highNames,
        lowRoas: low.roas,
        campaignTargetRoas: low.campTarget,
        highRoasCampaigns: highs.map(h => ({ id: h.campaignId, name: h.name, roas: h.roas, target: h.campTarget })),
      },
      estimatedOpportunityAud: spendAud * targetRoasGap,
    })
  }
  return out
}

function checkKeywordBleed(keywords, cfg) {
  const out = []
  for (const kw of keywords) {
    const spendAud = microsToDollars(kw.costMicros)
    if (spendAud >= cfg.keywordBleedThresholdAud && kw.conversions === 0) {
      out.push({
        category: 'keyword',
        severity: spendAud >= cfg.breakevenCppAud ? 'critical' : 'high',
        entityType: 'keyword',
        entityId: kw.criterionId,
        entityName: `${kw.keywordText} (${kw.matchType})`,
        issueTitle: `Keyword "${kw.keywordText}" bleeding — $${spendAud.toFixed(2)} AUD with zero conversions`,
        issueKey: 'keyword_zero_conversions',
        rawData: kw,
        estimatedWastedSpendAud: spendAud,
      })
    }
  }
  return out
}

function checkZeroImpressionKeywords(zeroKws) {
  return zeroKws.map(kw => ({
    category: 'keyword',
    severity: 'medium',
    entityType: 'keyword',
    entityId: kw.criterionId,
    entityName: `${kw.keywordText} (${kw.matchType})`,
    issueTitle: `Zero impressions — "${kw.keywordText}" has been dead for the full window`,
    issueKey: 'keyword_zero_impressions',
    rawData: kw,
  }))
}

function checkNegativeCandidates(searchTerms, cfg) {
  const out = []
  for (const st of searchTerms) {
    const ctr = st.impressions > 0 ? st.clicks / st.impressions : 0
    if (
      st.clicks >= cfg.negativeKwMinClicks &&
      st.conversions === 0 &&
      ctr < cfg.negativeKwMaxCtr
    ) {
      const spendAud = microsToDollars(st.costMicros)
      out.push({
        category: 'keyword',
        severity: spendAud >= cfg.keywordBleedThresholdAud ? 'high' : 'medium',
        entityType: 'search_term',
        entityId: st.searchTerm,
        entityName: st.searchTerm,
        issueTitle: `Negative keyword candidate — "${st.searchTerm}" (${st.clicks} clicks, 0 conversions, ${(ctr * 100).toFixed(2)}% CTR)`,
        issueKey: 'negative_candidate',
        rawData: st,
        estimatedWastedSpendAud: spendAud,
      })
    }
  }
  return out
}

function checkBidScaleOpportunities(keywords, cfg) {
  const out = []
  for (const kw of keywords) {
    if (kw.clicks === 0) continue
    const convRate = kw.conversions / kw.clicks
    const cpcAud = kw.clicks > 0 ? microsToDollars(kw.costMicros) / kw.clicks : 0
    if (cpcAud <= 0 || convRate <= 0) continue
    const impliedCpp = cpcAud / convRate
    if (convRate >= cfg.bidScaleMinConvRate && impliedCpp < cfg.breakevenCppAud * cfg.bidScaleCppMultiplier) {
      out.push({
        category: 'bid',
        severity: 'high',
        entityType: 'keyword',
        entityId: kw.criterionId,
        entityName: `${kw.keywordText} (${kw.matchType})`,
        issueTitle: `Underbid opportunity — "${kw.keywordText}" converting at $${impliedCpp.toFixed(2)} CPP (well below breakeven $${cfg.breakevenCppAud})`,
        issueKey: 'bid_underbid',
        rawData: { ...kw, impliedCpp, convRate },
        estimatedOpportunityAud: microsToDollars(kw.costMicros) * 0.3,
      })
    }
  }
  return out
}

function checkQualityScore(keywords, cfg) {
  const out = []
  for (const kw of keywords) {
    const qs = kw.qualityScore
    if (qs != null && qs < cfg.lowQualityScoreThreshold && kw.impressions >= cfg.lowQualityMinImpressions) {
      out.push({
        category: 'quality',
        severity: qs <= 3 ? 'critical' : 'medium',
        entityType: 'keyword',
        entityId: kw.criterionId,
        entityName: `${kw.keywordText} (${kw.matchType})`,
        issueTitle: `Low Quality Score ${qs}/10 — "${kw.keywordText}" inflating CPCs`,
        issueKey: 'low_quality_score',
        rawData: kw,
        estimatedWastedSpendAud: microsToDollars(kw.costMicros) * 0.20,
      })
    }
  }
  return out
}

function checkDisapprovedAds(ads) {
  const out = []
  for (const ad of ads) {
    if (ad.approvalStatus === 'DISAPPROVED') {
      out.push({
        category: 'quality',
        severity: 'critical',
        entityType: 'ad',
        entityId: ad.adId,
        entityName: ad.name || `Ad ${ad.adId}`,
        issueTitle: `Disapproved ad in "${ad.campaignName}" — not serving`,
        issueKey: 'disapproved_ad',
        rawData: ad,
      })
    }
  }
  return out
}

function checkShoppingProducts(products, cfg) {
  const out = []
  for (const p of products) {
    const spendAud = microsToDollars(p.costMicros)
    if (spendAud >= cfg.keywordBleedThresholdAud && p.conversions === 0) {
      out.push({
        category: 'merchant',
        severity: 'high',
        entityType: 'product',
        entityId: p.productItemId,
        entityName: p.productTitle || p.productItemId,
        issueTitle: `Shopping product "${p.productTitle}" bleeding — $${spendAud.toFixed(2)} AUD, 0 conversions`,
        issueKey: 'shopping_product_zero_conversions',
        rawData: p,
        estimatedWastedSpendAud: spendAud,
      })
    }
  }
  return out
}

// ── Public entry points ─────────────────────────────────────────────────────

/**
 * Run all checks and return findings ranked by severity then impact.
 *
 * Context-aware: refreshes Layer 2 auto-discovery first, then filters every
 * raw finding through the context evaluator. Suppressed findings are logged
 * to the audit log with a reason so Josh can see what the agent decided
 * NOT to flag.
 */
export async function runFullScan() {
  const cfg = getConfig()

  // Layer 2: refresh auto-discovered context before anything else
  // (enabled campaigns, channel types, bid strategies, shared lists, etc)
  try {
    await refreshAutoContext()
  } catch (err) {
    console.error('[GadsEngine] Context refresh failed, continuing with stale context:', err.message)
  }
  const auto = getAutoContext()

  const [campaigns, keywords, searchTerms, ads, zeroKws, shoppingProducts] = await Promise.all([
    getCampaignPerformance(),
    getKeywordPerformance(),
    getSearchTermsReport(cfg.negativeKwMinClicks),
    getAdPerformance(),
    getZeroImpressionKeywords(cfg.zeroImpressionDays),
    getShoppingProductPerformance(),
  ])

  const rawFindings = [
    ...checkCampaignBleed(campaigns, cfg),
    ...checkBudgetReallocation(campaigns, cfg),
    ...checkKeywordBleed(keywords, cfg),
    ...checkZeroImpressionKeywords(zeroKws),
    ...checkNegativeCandidates(searchTerms, cfg),
    ...checkBidScaleOpportunities(keywords, cfg),
    ...checkQualityScore(keywords, cfg),
    ...checkDisapprovedAds(ads),
    ...checkShoppingProducts(shoppingProducts, cfg),
  ]

  // Context filter + forecast build + week-1 redistribute filter.
  // Order:
  //   1. Context gate (enabled campaigns only, auto-bid guards, protection)
  //   2. Attach campaign context
  //   3. Build forecast object with real fixed math
  //   4. Week-1 filter: block anything that adds net spend
  const findings = []
  let suppressedCount = 0
  const suppressionReasons = {}
  for (const f of rawFindings) {
    const check = evaluateFindingAgainstContext(f)
    if (!check.allowed) {
      suppressedCount++
      suppressionReasons[check.reason] = (suppressionReasons[check.reason] || 0) + 1
      continue
    }

    // Attach campaign context
    const cid = f.rawData?.campaignId ||
      (f.entityType === 'campaign' ? f.entityId : null)
    if (cid && auto) {
      const camp = getCampaignById(cid)
      if (camp) {
        f.campaignContext = {
          id: camp.id,
          name: camp.name,
          channel: camp.channel,
          bidStrategy: camp.bidStrategy,
          isAutoBid: camp.isAutoBid,
          isKeywordless: camp.isKeywordless,
          targetRoas: camp.targetRoas,
          optimizationScore: camp.optimizationScore,
          dailyBudgetAud: camp.budgetAud,
        }
        const campTargetRoas = getTargetRoasForCampaign(camp.id)
        if (campTargetRoas) f.effectiveTargetRoas = campTargetRoas
      }
    }

    // Build the forecast — real math, no hand-wavy projections
    f.forecast = buildForecast(f)

    // Week-1 redistribute constraint: suppress anything that adds net spend
    if (cfg.redistributeModeOnly && findingAddsNetSpend(f)) {
      suppressedCount++
      const reason = `redistribute-mode: blocks findings that add net spend (+${f.forecast.netSpendChangeAud?.toFixed(2)}/mo)`
      suppressionReasons[reason] = (suppressionReasons[reason] || 0) + 1
      continue
    }

    findings.push(f)
  }

  if (suppressedCount > 0) {
    try {
      logAudit('findings_suppressed', {
        count: suppressedCount,
        byReason: suppressionReasons,
      }, null, 'agent')
    } catch { /* ok */ }
  }

  // Attach fingerprints (after suppression so we don't waste IDs)
  for (const f of findings) {
    f.fingerprint = fingerprint(f.entityType, f.entityId, f.issueKey)
  }

  // Rank: severity first, then estimated dollar impact
  findings.sort((a, b) => {
    const sevDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
    if (sevDiff !== 0) return sevDiff
    const aImpact = (a.estimatedWastedSpendAud || 0) + (a.estimatedOpportunityAud || 0)
    const bImpact = (b.estimatedWastedSpendAud || 0) + (b.estimatedOpportunityAud || 0)
    return bImpact - aImpact
  })

  // Compute framework metrics (Layer 1 CM$ + Layer 3 customer metrics) for
  // this scan. Never throws — if framework computation fails, scan still
  // returns normally and framework section is null with an error flag.
  let frameworkMetrics = null
  try {
    frameworkMetrics = await getFrameworkMetrics(30)
  } catch (err) {
    console.warn('[GadsEngine] Framework metrics computation failed:', err.message)
    frameworkMetrics = { error: err.message }
  }

  return {
    findings,
    counts: {
      campaigns: campaigns.length,
      keywords: keywords.length,
      searchTerms: searchTerms.length,
      ads: ads.length,
      zeroImpressionKeywords: zeroKws.length,
      shoppingProducts: shoppingProducts.length,
      findings: findings.length,
    },
    summary: buildAccountSummary(campaigns, cfg),
    frameworkMetrics,
  }
}

function buildAccountSummary(campaigns, cfg) {
  let totalSpend = 0
  let totalConvValue = 0
  let totalConversions = 0
  let totalClicks = 0
  let totalImpressions = 0
  for (const c of campaigns) {
    totalSpend += microsToDollars(c.costMicros)
    totalConvValue += Number(c.conversionsValue) || 0
    totalConversions += Number(c.conversions) || 0
    totalClicks += Number(c.clicks) || 0
    totalImpressions += Number(c.impressions) || 0
  }
  return {
    lookbackDays: 30,
    activeCampaigns: campaigns.length,
    totalSpendAud: Number(totalSpend.toFixed(2)),
    totalConversionsValueAud: Number(totalConvValue.toFixed(2)),
    totalConversions: Number(totalConversions.toFixed(2)),
    totalClicks,
    totalImpressions,
    roas: totalSpend > 0 ? Number((totalConvValue / totalSpend).toFixed(2)) : 0,
    avgCpc: totalClicks > 0 ? Number((totalSpend / totalClicks).toFixed(2)) : 0,
    targetRoas: cfg.targetRoas,
    breakevenCppAud: cfg.breakevenCppAud,
  }
}

// ── Impact projection (used by intelligence layer) ──────────────────────────

/**
 * Convert a finding's raw numbers into a monthly dollar impact projection.
 * Lookback is 30 days so wasted-spend findings project straight through.
 */
export function projectImpact(finding, cfg = getConfig()) {
  const waste = Number(finding.estimatedWastedSpendAud) || 0
  const opp = Number(finding.estimatedOpportunityAud) || 0

  if (waste > 0) {
    return { impact: Number(waste.toFixed(2)), direction: 'save' }
  }
  if (opp > 0) {
    return { impact: Number(opp.toFixed(2)), direction: 'earn' }
  }

  // Merchant / disapproved ads — estimate 2 lost orders per week if critical
  if (finding.category === 'quality' && finding.issueKey === 'disapproved_ad') {
    return { impact: Number((cfg.avgOrderValueAud * 8).toFixed(2)), direction: 'earn' }
  }
  if (finding.category === 'merchant') {
    return { impact: Number((cfg.avgOrderValueAud * 2).toFixed(2)), direction: 'earn' }
  }

  return { impact: 0, direction: 'save' }
}
