/**
 * routes/finance.js
 * Finance tab API — business-health summary + editable fixed-cost config.
 */
import { Router } from 'express'
import { buildFinanceSummary, invalidateFinanceCache, rebuildFinanceHistory } from '../lib/finance-engine.js'
import { getFinanceConfig, saveFinanceConfig } from '../lib/finance-config.js'

const router = Router()

// GET /api/finance/summary — full dashboard payload (5-min cached)
router.get('/summary', async (req, res) => {
  try {
    const force = req.query.force === '1' || req.query.force === 'true'
    const summary = await buildFinanceSummary({ force })
    res.set('Cache-Control', 'no-store')
    res.json(summary)
  } catch (err) {
    console.error('[finance] summary error:', err)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// GET /api/finance/config
router.get('/config', (_req, res) => {
  res.set('Cache-Control', 'no-store')
  res.json({ ok: true, config: getFinanceConfig() })
})

// PUT /api/finance/config — save fixed costs / model settings
router.put('/config', (req, res) => {
  try {
    const config = saveFinanceConfig(req.body || {})
    invalidateFinanceCache()
    res.json({ ok: true, config })
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message })
  }
})

// POST /api/finance/rebuild-history — wipe order caches + refetch full
// history. Runs ASYNC: the pull takes several minutes (25 months of
// paginated Shopify calls) which outlives Railway's edge-proxy timeout,
// so the request returns immediately and progress is polled via GET.
let _rebuild = { running: false, startedAt: null, finishedAt: null, result: null, error: null }

router.post('/rebuild-history', (_req, res) => {
  if (_rebuild.running) {
    return res.json({ ok: true, alreadyRunning: true, startedAt: _rebuild.startedAt })
  }
  _rebuild = { running: true, startedAt: new Date().toISOString(), finishedAt: null, result: null, error: null }
  rebuildFinanceHistory()
    .then(result => { _rebuild = { ..._rebuild, running: false, finishedAt: new Date().toISOString(), result } })
    .catch(err => {
      console.error('[finance] rebuild-history error:', err)
      _rebuild = { ..._rebuild, running: false, finishedAt: new Date().toISOString(), error: err.message }
    })
  res.json({ ok: true, started: true, startedAt: _rebuild.startedAt })
})

// GET /api/finance/rebuild-history/status — poll the async rebuild
router.get('/rebuild-history/status', (_req, res) => {
  res.set('Cache-Control', 'no-store')
  res.json({ ok: true, ..._rebuild })
})

export default router
