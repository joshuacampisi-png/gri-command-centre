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
} from '../lib/gads-mutations.js'
import { dollarsToMicros, microsToDollars, pingGads, isGadsConfigured } from '../lib/gads-client.js'
import { runFullScan } from '../lib/gads-agent-engine.js'

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

// ── Approve (execute the proposed change) ───────────────────────────────────

router.post('/approve', async (req, res) => {
  try {
    const { recommendationId } = req.body || {}
    if (!recommendationId) return res.status(400).json({ ok: false, error: 'recommendationId required' })

    const rec = getRecommendationById(recommendationId)
    if (!rec) return res.status(404).json({ ok: false, error: 'Recommendation not found' })
    if (rec.status !== 'pending') return res.status(400).json({ ok: false, error: `Recommendation is ${rec.status}` })

    const proposed = rec.proposedChange || {}
    let executionResult = { ok: false, error: 'Unknown action' }

    switch (proposed.action) {
      case 'PAUSE_CAMPAIGN':
        executionResult = await pauseCampaign(proposed.campaignId)
        break

      case 'PAUSE_KEYWORD':
        executionResult = await pauseKeyword(proposed.adGroupId, proposed.criterionId)
        break

      case 'ADD_NEGATIVE_KEYWORD':
        executionResult = await addCampaignNegativeKeyword(
          proposed.campaignId,
          proposed.searchTerm,
          proposed.matchType || 'PHRASE'
        )
        break

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

      case 'REDUCE_CAMPAIGN_BUDGET':
      case 'MANUAL_REVIEW_REQUIRED':
        executionResult = { ok: true, action: proposed.action, note: 'Flagged for manual review — no automatic mutation' }
        break

      default:
        executionResult = { ok: false, error: `No handler for action ${proposed.action}` }
    }

    const accuracyCheckDue = new Date()
    accuracyCheckDue.setDate(accuracyCheckDue.getDate() + (getConfig().accuracyCheckDays || 7))

    updateRecommendation(recommendationId, {
      status: 'completed',
      approvedAt: new Date().toISOString(),
      executedAt: new Date().toISOString(),
      executionResult,
      accuracyCheckDueAt: accuracyCheckDue.toISOString(),
    })

    logAudit('approved_and_executed', {
      action: proposed.action,
      executionResult,
      dryRun: executionResult.dryRun || false,
    }, recommendationId, 'user')

    res.json({ ok: true, executionResult })
  } catch (err) {
    console.error('[GadsAgent] approve error:', err)
    res.status(500).json({ ok: false, error: err.message })
  }
})

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
