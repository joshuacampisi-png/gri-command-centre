/**
 * Blog Publish API Routes
 * ─────────────────────────────────────────────────────────────
 * POST /api/publish/generate-and-publish  — generate + publish live
 * POST /api/publish/preview-article       — generate only, no publish
 * GET  /api/publish/published-articles    — list all published articles
 * ─────────────────────────────────────────────────────────────
 */

import { Router } from 'express'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { readTrendsCache } from '../lib/google-trends.js'
import { publishToShopify, hasShopifyPublishConfig } from '../lib/shopify-publisher.js'
import { generateFullArticle } from '../lib/article-generator.js'
import { VOLCANO_CANNON_ARTICLE } from '../lib/test-articles.js'
import { dataFile } from '../lib/data-dir.js'

const router = Router()
const PUBLISH_FILE = dataFile('published-articles.json')

// ── Published articles store ──────────────────────────────────

function loadPublished() {
  try {
    if (!existsSync(PUBLISH_FILE)) return []
    return JSON.parse(readFileSync(PUBLISH_FILE, 'utf8'))
  } catch { return [] }
}

function savePublished(articles) {
  writeFileSync(PUBLISH_FILE, JSON.stringify(articles, null, 2))
}

// Check if keyword is cannon/tnt related
function isCannonKeyword(kw = '') {
  const l = kw.toLowerCase()
  return l.includes('volcano') || l.includes('tnt') || l.includes('cannon')
}

// GET /api/publish/published-articles
router.get('/published-articles', (_req, res) => {
  const articles = loadPublished()
  res.json({ ok: true, articles })
})

// GET /api/publish/config-status
router.get('/config-status', (_req, res) => {
  res.json({
    ok: true,
    hasShopifyConfig: hasShopifyPublishConfig(),
    hasAnthropicKey:  Boolean(process.env.ANTHROPIC_API_KEY),
    blogId:           process.env.SHOPIFY_BLOG_ID || null,
    storeDomain:      process.env.SHOPIFY_STORE_DOMAIN || null,
  })
})

// POST /api/publish/preview-article
// Generates article but does NOT publish — returns full HTML for preview
router.post('/preview-article', async (req, res) => {
  const { spikeKeyword } = req.body
  if (!spikeKeyword) return res.status(400).json({ ok: false, error: 'spikeKeyword required' })

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(400).json({ ok: false, error: 'ANTHROPIC_API_KEY not configured' })
  }

  try {
    const cache = readTrendsCache()
    const spike = (cache?.spikes || []).find(s => s.keyword.toLowerCase() === spikeKeyword.toLowerCase())
      || { keyword: spikeKeyword, type: 'MANUAL_TRIGGER', changePercent: 0 }

    // Use pre-written article for cannon/TNT terms
    let article
    if (isCannonKeyword(spikeKeyword)) {
      article = VOLCANO_CANNON_ARTICLE
    } else {
      article = await generateFullArticle(spike)
    }

    return res.json({ ok: true, article })
  } catch (err) {
    console.error('[PreviewRoute] Error:', err.message)
    return res.status(500).json({ ok: false, error: err.message })
  }
})

// POST /api/publish/generate-and-publish
// Body: { spikeKeyword: string, useTestArticle?: boolean }
router.post('/generate-and-publish', async (req, res) => {
  const { spikeKeyword, useTestArticle = false } = req.body

  if (!spikeKeyword) {
    return res.status(400).json({ ok: false, error: 'spikeKeyword is required' })
  }

  if (!hasShopifyPublishConfig()) {
    return res.status(400).json({
      ok: false,
      error: 'Shopify credentials missing. Ensure SHOPIFY_STORE_DOMAIN, SHOPIFY_ADMIN_ACCESS_TOKEN, and SHOPIFY_BLOG_ID are set in .env',
    })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(400).json({ ok: false, error: 'ANTHROPIC_API_KEY not configured' })
  }

  try {
    // Get spike context from trends cache
    const cache = readTrendsCache()
    const spike = (cache?.spikes || []).find(s => s.keyword.toLowerCase() === spikeKeyword.toLowerCase())
      || { keyword: spikeKeyword, type: 'MANUAL_TRIGGER', changePercent: 0 }

    // Resolve article: pre-written test article for cannon/TNT, or Claude-generated
    let article
    if (useTestArticle || isCannonKeyword(spikeKeyword)) {
      console.log(`[PublishRoute] Using pre-written Volcano Cannon article for: ${spikeKeyword}`)
      article = VOLCANO_CANNON_ARTICLE
    } else {
      console.log(`[PublishRoute] Generating article via Claude for: ${spikeKeyword}`)
      article = await generateFullArticle(spike)
    }

    // Publish to Shopify
    const result = await publishToShopify(article)

    // Persist to published-articles store
    const published = loadPublished()
    const record = {
      ...result,
      spikeKeyword,
      articleTitle: article.title,
      seoTitle:     article.seo_title,
      spikeType:    spike.type,
      generatedAt:  new Date().toISOString(),
    }
    published.unshift(record)
    savePublished(published)

    console.log(`[PublishRoute] ✅ Published: ${result.liveUrl}`)

    return res.json({
      ok:          true,
      message:     'Article published live to Shopify',
      liveUrl:     result.liveUrl,
      title:       result.title,
      handle:      result.handle,
      publishedAt: result.publishedAt,
      shopifyId:   result.shopifyId,
      spikeKeyword,
    })
  } catch (err) {
    console.error('[PublishRoute] Error:', err.message)
    return res.status(500).json({ ok: false, error: err.message })
  }
})

export default router
