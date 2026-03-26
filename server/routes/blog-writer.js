/**
 * Blog Writer API Routes
 * ─────────────────────────────────────────────────────────────
 * POST /api/blog-writer/generate     — generate article from keyword
 * POST /api/blog-writer/publish      — publish generated article to Shopify
 * GET  /api/blog-writer/history      — list generated articles
 * GET  /api/blog-writer/article-types — list available article types
 * ─────────────────────────────────────────────────────────────
 */

import { Router } from 'express'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { generateBlogArticle, ARTICLE_TYPES } from '../lib/blog-writer.js'
import { publishToShopify, hasShopifyPublishConfig } from '../lib/shopify-publisher.js'
import { generateImage, hasHiggsfieldConfig } from '../lib/higgsfield.js'
import { dataFile } from '../lib/data-dir.js'

const router = Router()
const HISTORY_FILE = dataFile('blog-writer-history.json')

// ── History store ─────────────────────────────────────────────

function loadHistory() {
  try {
    if (!existsSync(HISTORY_FILE)) return []
    return JSON.parse(readFileSync(HISTORY_FILE, 'utf8'))
  } catch { return [] }
}

function saveHistory(history) {
  writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2))
}

// ── Routes ────────────────────────────────────────────────────

// GET /api/blog-writer/article-types
router.get('/article-types', (_req, res) => {
  res.json({ ok: true, types: ARTICLE_TYPES })
})

// POST /api/blog-writer/generate
router.post('/generate', async (req, res) => {
  const { keyword, articleType } = req.body

  if (!keyword || !keyword.trim()) {
    return res.status(400).json({ ok: false, error: 'keyword is required' })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(400).json({ ok: false, error: 'ANTHROPIC_API_KEY not configured' })
  }

  try {
    const article = await generateBlogArticle(keyword.trim(), {
      articleType: articleType || 'informational',
    })

    // Save to history
    const history = loadHistory()
    const record = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      keyword: keyword.trim(),
      brand: article.brand,
      articleType: article.articleType,
      title: article.title,
      handle: article.handle,
      wordCount: article.wordCount,
      checklistScore: article.checklistScore,
      checklistTotal: article.checklistTotal,
      generatedAt: article.generatedAt,
      status: 'draft',
    }
    history.unshift(record)
    saveHistory(history)

    return res.json({ ok: true, article, historyId: record.id })
  } catch (err) {
    console.error('[BlogWriterRoute] Generate error:', err.message)
    return res.status(500).json({ ok: false, error: err.message })
  }
})

// POST /api/blog-writer/publish
router.post('/publish', async (req, res) => {
  const { article } = req.body

  if (!article) {
    return res.status(400).json({ ok: false, error: 'article payload required' })
  }

  if (!hasShopifyPublishConfig()) {
    return res.status(400).json({
      ok: false,
      error: 'Shopify credentials missing. Ensure SHOPIFY_STORE_DOMAIN, SHOPIFY_ADMIN_ACCESS_TOKEN, and SHOPIFY_BLOG_ID are set.',
    })
  }

  try {
    const result = await publishToShopify(article)

    // Update history record status
    const history = loadHistory()
    const record = history.find(h => h.handle === article.handle)
    if (record) {
      record.status = 'published'
      record.liveUrl = result.liveUrl
      record.shopifyId = result.shopifyId
      record.publishedAt = result.publishedAt
      saveHistory(history)
    }

    console.log(`[BlogWriterRoute] Published: ${result.liveUrl}`)

    return res.json({
      ok: true,
      message: 'Article published live to Shopify',
      liveUrl: result.liveUrl,
      title: result.title,
      handle: result.handle,
      publishedAt: result.publishedAt,
      shopifyId: result.shopifyId,
    })
  } catch (err) {
    console.error('[BlogWriterRoute] Publish error:', err.message)
    return res.status(500).json({ ok: false, error: err.message })
  }
})

// POST /api/blog-writer/generate-image
// Generates a single Higgsfield image
router.post('/generate-image', async (req, res) => {
  const { prompt, aspectRatio, resolution = '2K', model = 'nanoBananaPro' } = req.body

  if (!prompt) return res.status(400).json({ ok: false, error: 'prompt required' })
  if (!aspectRatio) return res.status(400).json({ ok: false, error: 'aspectRatio required' })

  if (!hasHiggsfieldConfig()) {
    return res.status(400).json({
      ok: false,
      error: 'Higgsfield credentials missing. Add HIGGSFIELD_API_KEY and HIGGSFIELD_API_SECRET to .env',
    })
  }

  try {
    const result = await generateImage({ prompt, aspectRatio, resolution, model })
    return res.json({ ok: true, imageUrl: result.imageUrl, requestId: result.requestId })
  } catch (err) {
    console.error('[BlogWriterRoute] Image generation error:', err.message)
    return res.status(500).json({ ok: false, error: err.message })
  }
})

// GET /api/blog-writer/image-config
router.get('/image-config', (_req, res) => {
  res.json({ ok: true, hasHiggsfield: hasHiggsfieldConfig() })
})

// GET /api/blog-writer/history
router.get('/history', (_req, res) => {
  const history = loadHistory()
  res.json({ ok: true, history })
})

export default router
