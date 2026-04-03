/**
 * /api/flywheel/* routes — Ads Intelligence Flywheel.
 * Dashboard data, alerts, briefs, agent actions, conversions, AOV intelligence.
 */
import { Router } from 'express'
import {
  getAlerts, resolveAlert, getConversions, getCpaTargets, updateCpaTarget,
  getWeeklyRhythm, markRhythmDay, getPendingActions, approveAction, rejectAction,
  markActionExecuted, getFlywheelLog, getAovIntel, getAgentLearning,
  getIndustryKnowledge, saveIndustryKnowledge, getLatestBrief, approveBrief,
  getCampaigns, getAdSets, getAds,
} from '../lib/flywheel-store.js'
import {
  getFlywheelSummary, getCreativeLeaderboard, scoreCampaignHealth, calculateAovIntelligence, FLYWHEEL
} from '../lib/flywheel-engine.js'
import {
  generateCreativeBrief, runDecisionEngine, executeAction
} from '../lib/flywheel-intelligence.js'
import { metaSyncJob } from '../lib/flywheel-cron.js'
import { processShopifyOrder, verifyShopifyHmac } from '../lib/flywheel-webhook.js'

const router = Router()

// ── Summary metrics (top cards) ─────────────────────────────────────────────

router.get('/summary', (_req, res) => {
  try {
    const summary = getFlywheelSummary()
    const rhythm = getWeeklyRhythm()
    const pendingActions = getPendingActions('awaiting_approval')
    res.json({ ok: true, summary, rhythm, pendingActionsCount: pendingActions.length })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── Alerts ──────────────────────────────────────────────────────────────────

router.get('/alerts', (_req, res) => {
  try {
    const alerts = getAlerts(true)
    res.json({ ok: true, alerts })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

router.post('/alerts/:id/resolve', (req, res) => {
  try {
    const alert = resolveAlert(req.params.id)
    if (!alert) return res.status(404).json({ ok: false, error: 'Alert not found' })
    res.json({ ok: true, alert })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── Campaign health table ───────────────────────────────────────────────────

router.get('/campaigns', (_req, res) => {
  try {
    const campaigns = getCampaigns()
    const enriched = campaigns.map(c => ({
      ...c,
      health: scoreCampaignHealth(c),
    }))
    res.json({ ok: true, campaigns: enriched })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

router.get('/adsets', (_req, res) => {
  try {
    const adSets = getAdSets()
    res.json({ ok: true, adSets })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── AOV Intelligence ────────────────────────────────────────────────────────

router.get('/aov', (_req, res) => {
  try {
    const intel = calculateAovIntelligence()
    const history = getAovIntel(30)
    res.json({ ok: true, current: intel, history })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── Creative leaderboard ────────────────────────────────────────────────────

router.get('/creatives', (_req, res) => {
  try {
    const leaderboard = getCreativeLeaderboard()
    res.json({ ok: true, creatives: leaderboard })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── Creative briefs ─────────────────────────────────────────────────────────

router.get('/brief/latest', (_req, res) => {
  try {
    const brief = getLatestBrief()
    res.json({ ok: true, brief })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

router.post('/brief/generate', async (_req, res) => {
  try {
    const brief = await generateCreativeBrief()
    if (!brief) return res.status(500).json({ ok: false, error: 'Brief generation failed' })
    res.json({ ok: true, brief })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

router.post('/brief/:id/approve', (req, res) => {
  try {
    const brief = approveBrief(req.params.id)
    if (!brief) return res.status(404).json({ ok: false, error: 'Brief not found' })
    res.json({ ok: true, brief })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── Weekly rhythm ───────────────────────────────────────────────────────────

router.post('/rhythm/:day/complete', (req, res) => {
  try {
    const rhythm = markRhythmDay(req.params.day)
    if (!rhythm) return res.status(404).json({ ok: false, error: 'Rhythm not found' })
    res.json({ ok: true, rhythm })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── Flywheel log (raw conversion feed) ──────────────────────────────────────

router.get('/conversions', (req, res) => {
  try {
    const days = parseInt(req.query.days) || 14
    const conversions = getConversions(days)
    res.json({ ok: true, conversions })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

router.get('/log', (req, res) => {
  try {
    const days = parseInt(req.query.days) || 14
    const log = getFlywheelLog(days)
    res.json({ ok: true, log })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── CPA targets ─────────────────────────────────────────────────────────────

router.get('/targets', (_req, res) => {
  try {
    const targets = getCpaTargets()
    res.json({ ok: true, targets })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

router.post('/targets/:category', (req, res) => {
  try {
    const { target } = req.body
    if (!target || isNaN(target)) return res.status(400).json({ ok: false, error: 'Invalid target value' })
    const updated = updateCpaTarget(req.params.category, parseFloat(target))
    res.json({ ok: true, target: updated })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── AI Agent actions ────────────────────────────────────────────────────────

router.get('/actions', (req, res) => {
  try {
    const status = req.query.status || 'awaiting_approval'
    const actions = getPendingActions(status)
    res.json({ ok: true, actions })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

router.post('/actions/:id/approve', async (req, res) => {
  try {
    const action = approveAction(req.params.id)
    if (!action) return res.status(404).json({ ok: false, error: 'Action not found' })

    // Execute the action against Meta API
    const execResult = await executeAction(action)
    if (execResult.success) {
      markActionExecuted(req.params.id, execResult.result)
    }
    res.json({ ok: true, action, execution: execResult })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

router.post('/actions/:id/reject', (req, res) => {
  try {
    const { reason } = req.body
    const action = rejectAction(req.params.id, reason || '')
    if (!action) return res.status(404).json({ ok: false, error: 'Action not found' })
    res.json({ ok: true, action })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── Agent learning log ──────────────────────────────────────────────────────

router.get('/learning', (_req, res) => {
  try {
    const learning = getAgentLearning(50)
    res.json({ ok: true, learning })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── Decision engine trigger ─────────────────────────────────────────────────

router.post('/decision-engine/run', async (_req, res) => {
  try {
    const actions = await runDecisionEngine()
    res.json({ ok: true, actions })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── Meta sync trigger ───────────────────────────────────────────────────────

router.post('/meta-sync/trigger', async (_req, res) => {
  try {
    await metaSyncJob()
    res.json({ ok: true, message: 'Meta sync complete' })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── Shopify order webhook (flywheel entry point) ────────────────────────────

router.post('/webhook/order', (req, res) => {
  // Respond immediately
  res.status(200).json({ ok: true })

  // Process async
  try {
    const order = req.body
    if (order && order.id) {
      processShopifyOrder(order)
    }
  } catch (err) {
    console.error('[Flywheel Route] Webhook processing error:', err.message)
  }
})

// ── Industry knowledge ──────────────────────────────────────────────────────

router.get('/knowledge', (_req, res) => {
  try {
    const knowledge = getIndustryKnowledge()
    res.json({ ok: true, knowledge })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ── Constants (for frontend display) ────────────────────────────────────────

router.get('/constants', (_req, res) => {
  res.json({ ok: true, constants: FLYWHEEL })
})

export default router
