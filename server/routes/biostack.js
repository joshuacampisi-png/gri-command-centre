/**
 * biostack.js
 * BioStack ads account routes — reads + supervised writes.
 * Separate channel from GRI Meta (/api/ads) and Google Ads (/api/gads-agent).
 */
import { Router } from 'express'
import {
  isBiostackConfigured,
  fetchConnectionStatus,
  fetchOverview,
  fetchAccountInsights,
  fetchAccountInsightsByDay,
  updateObjectStatus,
  updateObjectBudget,
} from '../lib/biostack-api.js'

const router = Router()

// Connection health — call this first after any deploy/token change
router.get('/status', async (_req, res) => {
  if (!isBiostackConfigured()) {
    return res.json({ ok: false, error: 'BioStack Meta credentials not configured' })
  }
  try {
    const status = await fetchConnectionStatus()
    res.json({ ok: true, ...status })
  } catch (err) {
    res.json({ ok: false, error: err.message })
  }
})

// Full performance tree: account totals + campaigns > adsets > ads
router.get('/overview', async (req, res) => {
  try {
    const preset = req.query.preset || 'last_7d'
    const overview = await fetchOverview(preset)
    res.json(overview)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Account totals only (lightweight)
router.get('/account-insights', async (req, res) => {
  try {
    const preset = req.query.preset || 'last_7d'
    res.json(await fetchAccountInsights(preset))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Daily breakdown for trend charts
router.get('/daily', async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days, 10) || 14, 90)
    res.json(await fetchAccountInsightsByDay(days))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Pause/activate a campaign, ad set, or ad
router.post('/object/:id/status', async (req, res) => {
  const { status } = req.body || {}
  if (!['ACTIVE', 'PAUSED'].includes(status)) {
    return res.status(400).json({ error: 'status must be ACTIVE or PAUSED' })
  }
  try {
    const result = await updateObjectStatus(req.params.id, status)
    console.log(`[BioStack] ${req.params.id} -> ${status}`)
    res.json({ ok: true, result })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Update daily budget (dollars) on a campaign or ad set
router.post('/object/:id/budget', async (req, res) => {
  const dailyBudget = Number(req.body?.dailyBudget)
  if (!dailyBudget || dailyBudget <= 0 || dailyBudget > 10000) {
    return res.status(400).json({ error: 'dailyBudget must be between $1 and $10,000' })
  }
  try {
    const result = await updateObjectBudget(req.params.id, dailyBudget)
    console.log(`[BioStack] ${req.params.id} budget -> $${dailyBudget}/day`)
    res.json({ ok: true, result })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
