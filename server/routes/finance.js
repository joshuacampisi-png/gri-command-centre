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
// history. Run once after granting the read_all_orders Shopify scope.
router.post('/rebuild-history', async (_req, res) => {
  try {
    const result = await rebuildFinanceHistory()
    res.json(result)
  } catch (err) {
    console.error('[finance] rebuild-history error:', err)
    res.status(500).json({ ok: false, error: err.message })
  }
})

export default router
