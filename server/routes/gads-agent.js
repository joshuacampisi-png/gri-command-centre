/**
 * /api/gads-agent/* routes — Google Ads Agent.
 * Exposes: scan, approve, dismiss, audit, briefing, settings, status.
 */
import { Router } from 'express'
import {
  getRecommendations, getRecommendationById, updateRecommendation,
  getLatestBriefing, getBriefings, getAuditLog, getConfig, updateConfig,
  getStoreHealth, logAudit, isDryRun,
} from '../lib/gads-agent-store.js'
import {
  runAgentScanJob, runDailyBriefingJob, runAccuracyCheckJob,
} from '../lib/gads-agent-cron.js'
import {
  pauseCampaign, pauseKeyword, addCampaignNegativeKeyword, updateKeywordBid,
  addNegativeToSharedList,
} from '../lib/gads-mutations.js'
import { dollarsToMicros, microsToDollars, pingGads, isGadsConfigured } from '../lib/gads-client.js'
import { runFullScan } from '../lib/gads-agent-engine.js'
import {
  canExecuteRecommendation, findTargetSharedList, getProtectionLevel,
  getFullContext, refreshAutoContext,
} from '../lib/gads-agent-context.js'
import { executeRevert } from '../lib/gads-agent-revert.js'
import { getFrameworkMetrics } from '../lib/gads-agent-framework-metrics.js'

const router = Router()

// ── Status / health ─────────────────────────────────────────────────────────

router.get('/status', async (_req, res) => {
  try {
    const configured = isGadsConfigured()
    const health = getStoreHealth()
    let ping = { ok: false, error: 'not configured' }
    if (configured) {
      ping = await pingGads()
    }
    res.json({
      ok: true,
      configured,
      apiPing: ping,
      health,
      dryRun: isDryRun(),
    })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

router.get('/account-summary', async (_req, res) => {
  try {
    if (!isGadsConfigured()) return res.json({ ok: false, error: 'Google Ads API not configured' })
    const scan = await runFullScan()
    res.json({ ok: true, summary: scan.summary, counts: scan.counts })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── Per-campaign breakdown (every enabled campaign — ROAS, CPA, budget) ────
//
// Layer 4 attribution table. Supplements the Layer 1/3 framework panel by
// answering the "which campaigns are actually spending the money" question.
// Returns every ENABLED campaign in the account, sorted by spend, plus a
// per-channel-type rollup so Search / Shopping / Performance Max / etc can
// be compared at a glance. Window defaults to 30 days; override ?days=N.

// google-ads-api AdvertisingChannelType enum → string name.
// The SDK returns the integer enum for some query paths, so we normalise here
// to stable string keys the UI understands.
const CHANNEL_TYPE_NAMES = {
  0: 'UNSPECIFIED',
  1: 'UNKNOWN',
  2: 'SEARCH',
  3: 'DISPLAY',
  4: 'SHOPPING',
  5: 'HOTEL',
  6: 'VIDEO',
  7: 'MULTI_CHANNEL',
  8: 'LOCAL',
  9: 'SMART',
  10: 'PERFORMANCE_MAX',
  11: 'LOCAL_SERVICES',
  12: 'DISCOVERY',
  13: 'TRAVEL',
  14: 'DEMAND_GEN',
}
function normaliseChannelType(t) {
  if (t == null || t === '') return 'UNKNOWN'
  if (typeof t === 'number') return CHANNEL_TYPE_NAMES[t] || 'UNKNOWN'
  if (typeof t === 'string' && /^\d+$/.test(t)) return CHANNEL_TYPE_NAMES[parseInt(t, 10)] || 'UNKNOWN'
  return String(t)
}

router.get('/campaigns', async (req, res) => {
  try {
    if (!isGadsConfigured()) return res.json({ ok: false, error: 'Google Ads API not configured' })
    const days = Math.max(1, Math.min(180, parseInt(req.query.days || '30', 10)))
    const { getCampaignPerformance } = await import('../lib/gads-queries.js')
    const rows = await getCampaignPerformance(days)

    const campaigns = rows.map(c => {
      const spendAud = microsToDollars(c.costMicros)
      const dailyBudgetAud = microsToDollars(c.budgetMicros)
      const conversions = Number(c.conversions) || 0
      const convValue   = Number(c.conversionsValue) || 0
      const clicks      = Number(c.clicks) || 0
      const impressions = Number(c.impressions) || 0
      const roas = spendAud > 0 ? convValue / spendAud : 0
      const cpa  = conversions > 0 ? spendAud / conversions : 0
      const convRate = clicks > 0 ? conversions / clicks : 0
      const ctr = impressions > 0 ? clicks / impressions : 0
      const avgCpc = clicks > 0 ? spendAud / clicks : 0
      // Utilisation: actual spend vs theoretical ceiling (daily budget × days).
      // Flags campaigns that are budget-capped (>90%) or chronically under (<30%).
      const budgetCeiling = dailyBudgetAud * days
      const utilisation = budgetCeiling > 0 ? spendAud / budgetCeiling : 0
      return {
        campaignId: c.campaignId,
        name: c.name,
        status: c.status,
        channelType: normaliseChannelType(c.channelType),
        dailyBudgetAud: Number(dailyBudgetAud.toFixed(2)),
        spendAud: Number(spendAud.toFixed(2)),
        conversions: Number(conversions.toFixed(2)),
        conversionsValueAud: Number(convValue.toFixed(2)),
        clicks,
        impressions,
        roas: Number(roas.toFixed(2)),
        cpa: Number(cpa.toFixed(2)),
        convRate: Number((convRate * 100).toFixed(2)), // as %
        ctr: Number((ctr * 100).toFixed(2)),           // as %
        avgCpc: Number(avgCpc.toFixed(2)),
        utilisationPct: Number((utilisation * 100).toFixed(1)),
        budgetCeilingAud: Number(budgetCeiling.toFixed(2)),
      }
    })

    // Sort highest spend first — shows Josh where the money is actually going
    campaigns.sort((a, b) => b.spendAud - a.spendAud)

    // Totals row for the footer
    const totalsAcc = campaigns.reduce((acc, c) => {
      acc.spendAud += c.spendAud
      acc.conversionsValueAud += c.conversionsValueAud
      acc.conversions += c.conversions
      acc.clicks += c.clicks
      acc.impressions += c.impressions
      acc.dailyBudgetAud += c.dailyBudgetAud
      return acc
    }, { spendAud: 0, conversionsValueAud: 0, conversions: 0, clicks: 0, impressions: 0, dailyBudgetAud: 0 })
    const totals = {
      spendAud: Number(totalsAcc.spendAud.toFixed(2)),
      conversionsValueAud: Number(totalsAcc.conversionsValueAud.toFixed(2)),
      conversions: Number(totalsAcc.conversions.toFixed(2)),
      clicks: totalsAcc.clicks,
      impressions: totalsAcc.impressions,
      dailyBudgetAud: Number(totalsAcc.dailyBudgetAud.toFixed(2)),
      roas: totalsAcc.spendAud > 0 ? Number((totalsAcc.conversionsValueAud / totalsAcc.spendAud).toFixed(2)) : 0,
      cpa:  totalsAcc.conversions > 0 ? Number((totalsAcc.spendAud / totalsAcc.conversions).toFixed(2)) : 0,
      campaignCount: campaigns.length,
    }

    // Group by channel type so Search vs Shopping vs PMax comparisons are easy
    const byChannel = {}
    for (const c of campaigns) {
      const k = c.channelType || 'UNKNOWN'
      if (!byChannel[k]) byChannel[k] = { channelType: k, count: 0, spendAud: 0, conversionsValueAud: 0, conversions: 0, dailyBudgetAud: 0 }
      byChannel[k].count += 1
      byChannel[k].spendAud += c.spendAud
      byChannel[k].conversionsValueAud += c.conversionsValueAud
      byChannel[k].conversions += c.conversions
      byChannel[k].dailyBudgetAud += c.dailyBudgetAud
    }
    const channelTotals = Object.values(byChannel).map(ch => ({
      channelType: ch.channelType,
      count: ch.count,
      spendAud: Number(ch.spendAud.toFixed(2)),
      conversionsValueAud: Number(ch.conversionsValueAud.toFixed(2)),
      conversions: Number(ch.conversions.toFixed(2)),
      dailyBudgetAud: Number(ch.dailyBudgetAud.toFixed(2)),
      roas: ch.spendAud > 0 ? Number((ch.conversionsValueAud / ch.spendAud).toFixed(2)) : 0,
      cpa:  ch.conversions > 0 ? Number((ch.spendAud / ch.conversions).toFixed(2)) : 0,
    })).sort((a, b) => b.spendAud - a.spendAud)

    res.json({
      ok: true,
      window: { days },
      campaigns,
      totals,
      channelTotals,
      computedAt: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[GadsAgent] campaigns error:', err)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── Framework metrics (Layer 1 CM$ + Layer 3 customer metrics) ──────────────
//
// Returns the full nCAC/LTGP/CM$ framework view computed from:
//   - customer-index.json (new/returning classification, live)
//   - ads-metrics.js (all 12 framework functions)
//   - Google Ads API (Google spend)
//   - Meta Flywheel ad-set snapshots (Meta spend)
//
// See memory/project_gads_framework_integration.md for the full design.
// Default window 30 days; override via ?days=N.

router.get('/framework-metrics', async (req, res) => {
  try {
    if (!isGadsConfigured()) return res.json({ ok: false, error: 'Google Ads API not configured' })
    const days = Math.max(1, Math.min(180, parseInt(req.query.days || '30', 10)))
    const metrics = await getFrameworkMetrics(days)
    res.json({ ok: true, metrics })
  } catch (err) {
    console.error('[GadsAgent] framework-metrics error:', err)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── Context (Layer 1 + 2) ───────────────────────────────────────────────────

router.get('/context', (_req, res) => {
  try {
    res.json({ ok: true, context: getFullContext() })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

router.post('/context/refresh', async (_req, res) => {
  try {
    if (!isGadsConfigured()) return res.status(400).json({ ok: false, error: 'Google Ads API not configured' })
    const auto = await refreshAutoContext()
    res.json({
      ok: true,
      enabledCampaigns: auto.enabledCampaigns.length,
      pausedCampaigns: auto.pausedCampaigns.length,
      sharedLists: auto.sharedLists.length,
    })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── Recommendations ─────────────────────────────────────────────────────────

router.get('/recommendations', (req, res) => {
  try {
    const status = req.query.status || null
    const recs = getRecommendations(status)
    res.json({ ok: true, recommendations: recs })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

router.get('/recommendations/:id', (req, res) => {
  const rec = getRecommendationById(req.params.id)
  if (!rec) return res.status(404).json({ ok: false, error: 'Not found' })
  res.json({ ok: true, recommendation: rec })
})

// ── Manual scan trigger ─────────────────────────────────────────────────────

router.post('/scan', async (_req, res) => {
  try {
    const result = await runAgentScanJob()
    res.json({ ok: true, ...result })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── Regenerate findings with the latest agent logic ────────────────────────
//
// When the AI prompts, forecast module, or rules engine are updated, the
// existing pending recommendations in the store still carry the output of
// the OLD logic. The dedup fingerprint system blocks them from being
// recreated on a normal scan because their fingerprints already exist as
// pending. This endpoint breaks that loop:
//
//   1. All currently-pending recommendations are marked "dismissed" with
//      reason "regenerated_after_logic_update" (so the audit trail shows
//      why they disappeared).
//   2. A fresh scan runs. Because the old fingerprints are now in dismissed
//      status (not pending/completed), getExistingActiveFingerprints() no
//      longer blocks them, and the rules engine rebuilds them through the
//      current prompts/forecast/rules.
//
// This is the correct way to force a regeneration. Do not delete records —
// dismissing preserves the audit history.

router.post('/recommendations/regenerate', async (_req, res) => {
  try {
    const existing = getRecommendations('pending') || []
    const now = new Date().toISOString()
    let invalidated = 0
    for (const rec of existing) {
      updateRecommendation(rec.id, {
        status: 'dismissed',
        dismissedAt: now,
        dismissReason: 'regenerated_after_logic_update',
      })
      invalidated++
    }
    logAudit('recommendations_regenerated', {
      invalidatedCount: invalidated,
      reason: 'user_triggered_regenerate',
    }, null, 'user')

    const scan = await runAgentScanJob()

    res.json({
      ok: true,
      invalidated,
      scan: {
        findings: scan.findings || 0,
        newRecommendations: scan.newRecommendations || 0,
      },
    })
  } catch (err) {
    console.error('[GadsAgent] regenerate error:', err)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── Approve (execute the proposed change) ───────────────────────────────────

router.post('/approve', async (req, res) => {
  try {
    const { recommendationId } = req.body || {}
    if (!recommendationId) return res.status(400).json({ ok: false, error: 'recommendationId required' })

    const rec = getRecommendationById(recommendationId)
    if (!rec) return res.status(404).json({ ok: false, error: 'Recommendation not found' })
    if (rec.status !== 'pending') return res.status(400).json({ ok: false, error: `Recommendation is ${rec.status}` })

    // Protection-level gate: alert_only campaigns refuse auto-execution.
    // User still sees the recommendation but must action it manually in Google Ads.
    const protectionCheck = canExecuteRecommendation(rec)
    if (!protectionCheck.canExecute) {
      logAudit('approve_blocked_by_protection', {
        reason: protectionCheck.reason,
        entityId: rec.entityId,
        entityName: rec.entityName,
      }, recommendationId, 'user')
      return res.status(403).json({
        ok: false,
        blocked: true,
        reason: protectionCheck.reason,
        action: 'manual_review',
        message: 'This campaign is protected. Action the recommendation manually in Google Ads, then dismiss the card here.',
      })
    }

    const proposed = rec.proposedChange || {}
    let executionResult = { ok: false, error: 'Unknown action' }

    switch (proposed.action) {
      case 'PAUSE_CAMPAIGN':
        executionResult = await pauseCampaign(proposed.campaignId)
        break

      case 'PAUSE_KEYWORD':
        executionResult = await pauseKeyword(proposed.adGroupId, proposed.criterionId)
        break

      case 'ADD_NEGATIVE_KEYWORD': {
        // Smart routing: try to add to the correct shared negative list first.
        // Falls back to campaign-level with a warning if no shared list matches.
        const target = findTargetSharedList(proposed.searchTerm, proposed.campaignId)
        if (target && target.subscribed) {
          executionResult = await addNegativeToSharedList(
            target.listId,
            proposed.searchTerm,
            proposed.matchType || 'PHRASE'
          )
          executionResult.routedTo = 'shared_list'
          executionResult.listName = target.listName
          executionResult.category = target.category
          executionResult.note = target.reason
        } else {
          executionResult = await addCampaignNegativeKeyword(
            proposed.campaignId,
            proposed.searchTerm,
            proposed.matchType || 'PHRASE'
          )
          executionResult.routedTo = 'campaign_level'
          executionResult.fallbackReason = target?.reason || 'no matching shared list found'
        }
        break
      }

      case 'INCREASE_BID': {
        const currentCpcMicros = rec.currentValue?.cpcBidMicros
          || (rec.currentValue?.clicks > 0
                ? (rec.currentValue.costMicros / rec.currentValue.clicks)
                : 0)
        const currentCpcAud = microsToDollars(currentCpcMicros)
        const newBidAud = Math.max(0.10, currentCpcAud * (proposed.multiplier || 1.25))
        executionResult = await updateKeywordBid(proposed.adGroupId, proposed.criterionId, newBidAud)
        executionResult.previousBidMicros = currentCpcMicros
        executionResult.newBidAud = newBidAud
        break
      }

      case 'REVERT_CHANGE': {
        // Revert approval card — execute the reverse of the original change.
        // This only runs because Josh explicitly clicked Approve on this card.
        const originalRecId = proposed.originalRecommendationId
        const originalRec = getRecommendationById(originalRecId)
        if (!originalRec) {
          executionResult = { ok: false, error: `Original recommendation ${originalRecId} not found` }
          break
        }
        executionResult = await executeRevert(originalRec)
        executionResult.revertOf = originalRecId
        // Mark the original rec as reverted (with the full trail)
        updateRecommendation(originalRecId, {
          status: 'reverted',
          revertedAt: new Date().toISOString(),
          revertReason: `User-approved revert via card ${recommendationId}. ${proposed.reason || ''}`.trim(),
          revertResult: executionResult,
        })
        break
      }

      case 'REDUCE_CAMPAIGN_BUDGET':
      case 'MANUAL_REVIEW_REQUIRED':
        executionResult = { ok: true, action: proposed.action, note: 'Flagged for manual review — no automatic mutation' }
        break

      default:
        executionResult = { ok: false, error: `No handler for action ${proposed.action}` }
    }

    const accuracyCheckDue = new Date()
    accuracyCheckDue.setDate(accuracyCheckDue.getDate() + (getConfig().accuracyCheckDays || 7))
    const recordedAt = new Date().toISOString()

    updateRecommendation(recommendationId, {
      status: 'completed',
      approvedAt: recordedAt,
      executedAt: recordedAt,
      executionResult,
      accuracyCheckDueAt: accuracyCheckDue.toISOString(),
    })

    logAudit('approved_and_executed', {
      action: proposed.action,
      executionResult,
      dryRun: executionResult.dryRun || false,
    }, recommendationId, 'user')

    // Build a rich confirmation payload for the frontend modal.
    // Backwards compatible — existing callers that only read `ok` and
    // `executionResult` continue to work unchanged. New callers can use
    // `confirmation` to render a post-approval detail view.
    const confirmation = buildConfirmation({
      rec,
      proposed,
      executionResult,
      recordedAt,
      accuracyCheckDueAt: accuracyCheckDue.toISOString(),
      recommendationId,
      protectionLevel: getProtectionLevel(rec.entityId || rec.currentValue?.campaignId),
    })

    res.json({ ok: true, executionResult, confirmation })
  } catch (err) {
    console.error('[GadsAgent] approve error:', err)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── Confirmation payload builder ────────────────────────────────────────────
// Converts the raw approve-path state into a presentation-ready object the
// frontend modal can render without any additional API calls. Pure function.

function buildConfirmation({ rec, proposed, executionResult, recordedAt, accuracyCheckDueAt, recommendationId, protectionLevel }) {
  const dryRun = executionResult?.dryRun === true
  const apiCallMade = !dryRun && executionResult?.ok === true && proposed.action !== 'MANUAL_REVIEW_REQUIRED' && proposed.action !== 'REDUCE_CAMPAIGN_BUDGET'
  const success = executionResult?.ok === true

  // Human-readable action label + detail
  const actionMap = {
    PAUSE_CAMPAIGN:       { label: 'Pause campaign',              detail: `Pausing "${rec.entityName}" — stops all spend on this campaign until re-enabled.` },
    ENABLE_CAMPAIGN:      { label: 'Re-enable campaign',          detail: `Re-enabling "${rec.entityName}".` },
    PAUSE_KEYWORD:        { label: 'Pause keyword',               detail: `Pausing keyword "${rec.entityName}" — stops it from triggering ad impressions.` },
    ENABLE_KEYWORD:       { label: 'Re-enable keyword',           detail: `Re-enabling keyword "${rec.entityName}".` },
    ADD_NEGATIVE_KEYWORD: { label: 'Add negative keyword',        detail: `Blocking "${rec.entityName}" so it never triggers ads again. Routed ${executionResult?.routedTo === 'shared_list' ? `to shared list "${executionResult?.listName}" (propagates across subscribing campaigns)` : 'at campaign level'}.` },
    INCREASE_BID:         { label: 'Increase keyword bid',        detail: `Raising CPC bid by ${Math.round(((proposed.multiplier || 1.25) - 1) * 100)}% to capture more of the available inventory.` },
    REVERT_CHANGE:        { label: 'Revert previous change',      detail: `Reversing the earlier "${proposed.originalRecommendationId}" change because the projected impact did not materialise at the 7-day check.` },
    REDUCE_CAMPAIGN_BUDGET: { label: 'Reduce campaign budget',    detail: 'Flagged for your manual review — no automatic mutation.' },
    MANUAL_REVIEW_REQUIRED: { label: 'Manual review required',    detail: 'This change requires you to action it directly in Google Ads.' },
  }
  const act = actionMap[proposed.action] || { label: proposed.action || 'Unknown action', detail: '' }

  // What the 7-day accuracy check will specifically measure
  const measuringMap = {
    PAUSE_CAMPAIGN: 'Confirmed absence of spend on this campaign over the 7-day window. If spend resumed, the pause did not take effect.',
    PAUSE_KEYWORD: 'Confirmed absence of spend on this keyword over 7 days.',
    ADD_NEGATIVE_KEYWORD: 'Zero incremental clicks matching this search term over 7 days.',
    INCREASE_BID: 'Conversion rate stability on the bid-scaled keyword. If new conversions did not materialise, the bid increase is reverted.',
    REVERT_CHANGE: 'N/A — this is itself a revert action.',
  }

  return {
    recordedAt,
    recommendationId,
    entityName: rec.entityName,
    entityType: rec.entityType,
    entityId: rec.entityId,
    campaignContext: rec.campaignContext || null,

    action: proposed.action,
    actionLabel: act.label,
    actionDetail: act.detail,

    mutationSummary: act.label,

    apiCallMade,
    apiCallDetail: apiCallMade ? (executionResult?.raw ? { resourceName: executionResult?.resourceName, raw: '(API result trimmed)' } : executionResult) : null,
    dryRun,
    success,
    blockedByProtection: false, // if we got here, we weren't blocked
    protectionLevel: protectionLevel || 'execute_freely',

    forecastSnapshot: rec.forecast || null,

    accuracyCheckDueAt,
    whatWeAreMeasuring: measuringMap[proposed.action] || 'Actual dollar impact vs projected forecast after 7 days.',

    auditEventType: 'approved_and_executed',
  }
}

// ── Dismiss ─────────────────────────────────────────────────────────────────

router.post('/dismiss', (req, res) => {
  try {
    const { recommendationId, reason } = req.body || {}
    if (!recommendationId) return res.status(400).json({ ok: false, error: 'recommendationId required' })
    const rec = getRecommendationById(recommendationId)
    if (!rec) return res.status(404).json({ ok: false, error: 'Not found' })
    updateRecommendation(recommendationId, {
      status: 'dismissed',
      dismissedAt: new Date().toISOString(),
      dismissReason: reason || '',
    })
    logAudit('dismissed', { reason: reason || '' }, recommendationId, 'user')
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── Manual accuracy check / revert sweep ────────────────────────────────────

router.post('/accuracy-check', async (_req, res) => {
  try {
    const result = await runAccuracyCheckJob()
    res.json({ ok: true, ...result })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── Intelligence briefing ───────────────────────────────────────────────────

router.get('/briefing', (_req, res) => {
  try {
    const latest = getLatestBriefing()
    res.json({ ok: true, briefing: latest })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

router.get('/briefings', (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '14', 10)
    res.json({ ok: true, briefings: getBriefings(limit) })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

router.post('/briefing/generate', async (_req, res) => {
  try {
    const result = await runDailyBriefingJob()
    res.json({ ok: true, ...result })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── Audit log ───────────────────────────────────────────────────────────────

router.get('/audit', (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '200', 10)
    res.json({ ok: true, events: getAuditLog(limit) })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── Config / thresholds ─────────────────────────────────────────────────────

router.get('/config', (_req, res) => {
  try {
    res.json({ ok: true, config: getConfig() })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

router.post('/config', (req, res) => {
  try {
    const patch = req.body || {}
    // Only allow known config keys
    const allowed = new Set([
      'dryRun', 'breakevenCppAud', 'avgOrderValueAud', 'grossMarginPct', 'targetRoas',
      'keywordBleedThresholdAud', 'negativeKwMinClicks', 'negativeKwMaxCtr',
      'zeroImpressionDays', 'campaignBleedThresholdAud', 'campaignBleedDays',
      'reallocationLowRoas', 'reallocationHighRoas', 'lowQualityScoreThreshold',
      'lowQualityMinImpressions', 'bidScaleMinConvRate', 'bidScaleCppMultiplier',
      'accuracyCheckDays', 'accuracyMaterialisedPct',
    ])
    const safePatch = {}
    for (const k of Object.keys(patch)) {
      if (allowed.has(k)) safePatch[k] = patch[k]
    }
    const next = updateConfig(safePatch)
    logAudit('config_updated', { patch: safePatch }, null, 'user')
    res.json({ ok: true, config: next })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

export default router
