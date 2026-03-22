/**
 * Keyword Tracker Routes
 * GET  /api/keywords/rankings   — cached rankings + stats
 * POST /api/keywords/refresh    — trigger live fetch from Keyword.com
 * GET  /api/keywords/alerts     — active alerts only
 * GET  /api/keywords/settings   — current thresholds + config
 */

import { Router } from 'express'
import {
  readCache,
  writeCache,
  refreshRankings,
  hasCredentials,
  detectAlerts,
  getKeywordStatus,
  startKeywordScheduler,
} from '../lib/keyword-tracker.js'
import {
  loadDrops,
  updateDrop,
  addDrops,
  detectDrops,
} from '../lib/rank-drop-detector.js'

const router = Router()

// Ensure scheduler is running when routes are loaded
startKeywordScheduler()

// ── GET /api/keywords/status (alias for /rankings) ────────────────────────

router.get('/status', async (req, res) => {
  try {
    const cache = readCache()

    if (!cache) {
      return res.json({
        keywords: [],
        stats: { total: 0, top3: 0, top10: 0, improving: 0, declining: 0, critical: 0 },
        alerts: [],
        updatedAt: null
      })
    }

    const keywords = cache.keywords.map(kw => ({
      ...kw,
      status: getKeywordStatus(kw)
    }))

    res.json({
      keywords,
      stats: cache.stats,
      alerts: cache.alerts,
      updatedAt: cache.updatedAt
    })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ── GET /api/keywords/drops (alias for /blog-tasks) ───────────────────────

router.get('/drops', (req, res) => {
  try {
    const drops = loadDrops()
    const { status } = req.query
    const filtered = status ? drops.filter(d => d.status === status) : drops
    filtered.sort((a, b) => new Date(b.detectedAt) - new Date(a.detectedAt))
    res.json({ ok: true, drops: filtered })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ── POST /api/keywords/drops/:dropId/regenerate ───────────────────────────

router.post('/drops/:dropId/regenerate', async (req, res) => {
  try {
    const { regenerateArticle } = await import('../lib/blog-pipeline.js')
    const result = await regenerateArticle(req.params.dropId)
    res.json({ ok: true, result })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ── POST /api/keywords/drops/:dropId/publish ──────────────────────────────

router.post('/drops/:dropId/publish', async (req, res) => {
  try {
    const drops = loadDrops()
    const drop = drops.find(d => d.id === req.params.dropId)
    if (!drop) return res.status(404).json({ ok: false, error: 'Drop not found' })
    if (!drop.shopify?.shopifyArticleId) {
      return res.status(400).json({ ok: false, error: 'No Shopify draft to publish' })
    }

    const { publishArticle } = await import('../lib/shopify-blog-publisher.js')
    await publishArticle(drop.shopify.shopifyArticleId, drop.shopify.blogId)

    updateDrop(req.params.dropId, {
      status: 'published',
      publishedAt: new Date().toISOString()
    })

    const liveUrl = `https://genderrevealideas.com.au/blogs/news/${drop.shopify.handle || drop.keyword.toLowerCase().replace(/\s+/g, '-')}`
    
    res.json({ ok: true, liveUrl })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ── DELETE /api/keywords/drops/:dropId ────────────────────────────────────

router.delete('/drops/:dropId', async (req, res) => {
  try {
    const drops = loadDrops()
    const drop = drops.find(d => d.id === req.params.dropId)
    
    if (drop && drop.shopify?.shopifyArticleId) {
      try {
        const { deleteArticle } = await import('../lib/shopify-blog-publisher.js')
        await deleteArticle(drop.shopify.shopifyArticleId, drop.shopify.blogId)
      } catch (e) {
        console.error('[KW Route] Failed to delete Shopify draft:', e.message)
      }
    }

    const filtered = drops.filter(d => d.id !== req.params.dropId)
    const { saveDrops } = await import('../lib/rank-drop-detector.js')
    saveDrops(filtered)
    
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ── GET /api/keywords/rankings ─────────────────────────────────────────────

router.get('/rankings', async (req, res) => {
  try {
    const cache = readCache()

    if (!cache) {
      // No cache yet — trigger initial scrape in background
      refreshRankings().catch(e => console.error('[KW Route] Initial fetch failed:', e.message))
      return res.json({
        ok: true,
        status: 'fetching',
        message: 'First-time fetch in progress — refresh in 30 seconds',
        keywords: [],
        alerts: [],
        stats: null,
        updatedAt: null,
      })
    }

    // Filter by device/location if requested
    let { keywords } = cache
    const { device, search, sort } = req.query

    if (device && device !== 'all') {
      keywords = keywords.filter(k => k.device === device)
    }

    if (search) {
      const q = search.toLowerCase()
      keywords = keywords.filter(k => k.keyword.toLowerCase().includes(q))
    }

    // Sort
    if (sort === 'rank') {
      keywords = [...keywords].sort((a, b) => {
        if (a.rank === null && b.rank === null) return 0
        if (a.rank === null) return 1
        if (b.rank === null) return -1
        return a.rank - b.rank
      })
    } else if (sort === 'change') {
      keywords = [...keywords].sort((a, b) => b.change - a.change)
    } else if (sort === 'volume') {
      keywords = [...keywords].sort((a, b) => (b.volume || 0) - (a.volume || 0))
    } else if (sort === 'keyword') {
      keywords = [...keywords].sort((a, b) => a.keyword.localeCompare(b.keyword))
    }

    // Add status label to each keyword
    const withStatus = keywords.map(kw => ({
      ...kw,
      status: getKeywordStatus(kw),
    }))

    res.json({
      ok: true,
      status: 'ok',
      keywords: withStatus,
      alerts: cache.alerts || [],
      stats: cache.stats || null,
      project: cache.project,
      updatedAt: cache.updatedAt,
    })
  } catch (e) {
    console.error('[KW Route] rankings error:', e.message)
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ── POST /api/keywords/refresh ─────────────────────────────────────────────

router.post('/refresh', async (req, res) => {
  if (!hasCredentials()) {
    return res.status(400).json({ ok: false, error: 'KEYWORD_COM_API_KEY not set in .env' })
  }
  try {
    const cache = await refreshRankings()
    res.json({
      ok: true,
      message: `Refreshed ${cache.stats.total} keywords`,
      stats: cache.stats,
      alertCount: cache.alerts.length,
      updatedAt: cache.updatedAt,
    })
  } catch (e) {
    console.error('[KW Route] refresh error:', e.message)
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ── GET /api/keywords/alerts ───────────────────────────────────────────────

router.get('/alerts', (req, res) => {
  try {
    const cache = readCache()
    if (!cache) return res.json({ ok: true, alerts: [], updatedAt: null })

    // Re-detect fresh alerts from current data (in case thresholds changed)
    const alerts = detectAlerts(cache.keywords || [])

    res.json({
      ok: true,
      alerts,
      criticalCount: alerts.filter(a => a.severity === 'critical').length,
      highCount: alerts.filter(a => a.severity === 'high').length,
      updatedAt: cache.updatedAt,
    })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ── GET /api/keywords/settings ─────────────────────────────────────────────

router.get('/settings', (req, res) => {
  const cache = readCache()
  res.json({
    ok: true,
    hasCredentials: hasCredentials(),
    projectId: process.env.KEYWORD_COM_PROJECT_ID || 'IfZYQs3',
    thresholds: {
      criticalDrop:     parseInt(process.env.KW_THRESHOLD_CRITICAL  || '6'),
      sustainedDecline: parseInt(process.env.KW_THRESHOLD_SUSTAINED || '3'),
      sustainedDays:    parseInt(process.env.KW_THRESHOLD_DAYS      || '3'),
      top3RiskDropTo:   parseInt(process.env.KW_THRESHOLD_TOP3      || '5'),
    },
    cacheAge: cache?.updatedAt
      ? Math.round((Date.now() - new Date(cache.updatedAt).getTime()) / 60000)
      : null,
    totalKeywords: cache?.stats?.total || 0,
  })
})

// ── GET  /api/keywords/blog-tasks ─────────────────────────────────────────

router.get('/blog-tasks', (req, res) => {
  try {
    const drops = loadDrops()
    const { status } = req.query
    const filtered = status ? drops.filter(d => d.status === status) : drops
    // Sort: newest first
    filtered.sort((a, b) => new Date(b.detectedAt) - new Date(a.detectedAt))
    res.json({ ok: true, tasks: filtered, total: filtered.length })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ── POST /api/keywords/blog-tasks/:id/generate ─────────────────────────────

router.post('/blog-tasks/:id/generate', async (req, res) => {
  try {
    const { regenerateArticle } = await import('../lib/blog-pipeline.js')
    const result = await regenerateArticle(req.params.id)
    res.json({ ok: true, ...result })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ── POST /api/keywords/blog-tasks/:id/approve ─────────────────────────────
// Publishes the Shopify draft live

router.post('/blog-tasks/:id/approve', async (req, res) => {
  try {
    const drops = loadDrops()
    const drop = drops.find(d => d.id === req.params.id)
    if (!drop) return res.status(404).json({ ok: false, error: 'Task not found' })
    if (!drop.shopify?.shopifyArticleId) {
      return res.status(400).json({ ok: false, error: 'No Shopify draft to publish' })
    }

    const { publishArticle } = await import('../lib/shopify-blog-publisher.js')
    await publishArticle(drop.shopify.shopifyArticleId, drop.shopify.blogId)

    updateDrop(req.params.id, {
      status:      'published',
      publishedAt: new Date().toISOString(),
      approvedBy:  req.body.userId || 'josh',
    })

    res.json({ ok: true, message: 'Article published live', liveUrl: drop.shopify.draftUrl })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ── POST /api/keywords/blog-tasks/:id/reject ──────────────────────────────

router.post('/blog-tasks/:id/reject', async (req, res) => {
  try {
    const drops = loadDrops()
    const drop = drops.find(d => d.id === req.params.id)
    if (!drop) return res.status(404).json({ ok: false, error: 'Task not found' })

    if (drop.shopify?.shopifyArticleId) {
      try {
        const { deleteArticle } = await import('../lib/shopify-blog-publisher.js')
        await deleteArticle(drop.shopify.shopifyArticleId, drop.shopify.blogId)
      } catch (e) {
        console.error('[KW Route] Failed to delete Shopify draft:', e.message)
      }
    }

    updateDrop(req.params.id, { status: 'rejected', rejectedAt: new Date().toISOString() })
    res.json({ ok: true, message: 'Article rejected and Shopify draft deleted' })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ── POST /api/keywords/scan-drops ─────────────────────────────────────────
// Manual trigger: compare current cache vs snapshot

router.post('/scan-drops', async (req, res) => {
  try {
    const cache = readCache()
    if (!cache) return res.status(400).json({ ok: false, error: 'No keyword cache yet' })

    const drops = detectDrops(cache)
    if (drops.length === 0) return res.json({ ok: true, drops: 0, message: 'No drops detected' })

    const allDrops = addDrops(drops)

    // Trigger generation in background
    const newDrops = drops.filter(d => allDrops.find(a => a.id === d.id))
    if (newDrops.length > 0) {
      const { generateAndQueueArticles } = await import('../lib/blog-pipeline.js')
      generateAndQueueArticles(newDrops).catch(e => console.error('[KW Route] Generation error:', e.message))
    }

    res.json({ ok: true, drops: drops.length, message: `${drops.length} drop(s) detected — generating articles` })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ── POST /api/keywords/seed-cache ─────────────────────────────────────────
// Accepts scraped data from the viewkey browser session and writes to cache.
// Called from the browser-side scraper — no API key needed.

router.post('/seed-cache', (req, res) => {
  try {
    const { keywords, stats, alerts, updatedAt, project, source } = req.body
    if (!keywords || !Array.isArray(keywords)) {
      return res.status(400).json({ ok: false, error: 'keywords array required' })
    }

    // Add status label to each keyword
    const withStatus = keywords.map(kw => ({ ...kw, status: getKeywordStatus(kw) }))

    // Re-detect alerts
    const freshAlerts = detectAlerts(withStatus)
    const freshStats = {
      total:     withStatus.length,
      top3:      withStatus.filter(k => k.rank != null && k.rank <= 3).length,
      top10:     withStatus.filter(k => k.rank != null && k.rank <= 10).length,
      improving: withStatus.filter(k => k.change > 0).length,
      declining: withStatus.filter(k => k.change < 0).length,
      critical:  freshAlerts.filter(a => a.type === 'CRITICAL_DROP').length,
    }

    const cache = {
      updatedAt: updatedAt || new Date().toISOString(),
      project:   project || 'IfZYQs3',
      source:    source || 'viewkey-scrape',
      keywords:  withStatus,
      alerts:    freshAlerts,
      stats:     freshStats,
    }

    writeCache(cache)
    console.log(`[KW Route] Seeded cache: ${withStatus.length} keywords, ${freshAlerts.length} alerts`)

    res.json({ ok: true, total: withStatus.length, alerts: freshAlerts.length })
  } catch (e) {
    console.error('[KW Route] seed-cache error:', e.message)
    res.status(500).json({ ok: false, error: e.message })
  }
})

export default router
