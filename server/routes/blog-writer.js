/**
 * Blog Writer API Routes
 * ─────────────────────────────────────────────────────────────
 * POST /api/blog-writer/generate       — generate article from keyword
 * POST /api/blog-writer/publish        — publish generated article to Shopify
 * POST /api/blog-writer/generate-image — generate single image via Fal.ai FLUX
 * POST /api/blog-writer/review-image   — Claude vision QA review of generated image
 * GET  /api/blog-writer/image-config   — check Fal.ai config status
 * GET  /api/blog-writer/history        — list generated articles
 * GET  /api/blog-writer/article-types  — list available article types
 * ─────────────────────────────────────────────────────────────
 */

import { Router } from 'express'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { generateBlogArticle, ARTICLE_TYPES } from '../lib/blog-writer.js'
import { publishToShopify, hasShopifyPublishConfig } from '../lib/shopify-publisher.js'
import { generateImage, hasFalConfig } from '../lib/fal.js'
import { callClaude } from '../lib/claude-guard.js'
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
// Generates a single image via Fal.ai FLUX 1.1 Pro Ultra
router.post('/generate-image', async (req, res) => {
  const { prompt, aspectRatio } = req.body

  if (!prompt) return res.status(400).json({ ok: false, error: 'prompt required' })
  if (!aspectRatio) return res.status(400).json({ ok: false, error: 'aspectRatio required' })

  if (!hasFalConfig()) {
    return res.status(400).json({
      ok: false,
      error: 'Fal.ai credentials missing. Add FAL_KEY to environment variables.',
    })
  }

  try {
    const result = await generateImage({ prompt, aspectRatio })
    return res.json({ ok: true, imageUrl: result.imageUrl, requestId: result.requestId })
  } catch (err) {
    console.error('[BlogWriterRoute] Image generation error:', err.message)
    return res.status(500).json({ ok: false, error: err.message })
  }
})

// POST /api/blog-writer/review-image
// Claude vision QA — reviews a generated image against the original prompt
// Returns a score (1-10), pass/fail, and feedback for regeneration
router.post('/review-image', async (req, res) => {
  const { imageUrl, prompt, placement, alt } = req.body

  if (!imageUrl || !prompt) {
    return res.status(400).json({ ok: false, error: 'imageUrl and prompt required' })
  }

  try {
    // Fetch the image as base64 for Claude vision
    const imgRes = await fetch(imageUrl)
    if (!imgRes.ok) throw new Error(`Failed to fetch image: ${imgRes.status}`)

    const buffer = await imgRes.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')
    const contentType = imgRes.headers.get('content-type') || 'image/jpeg'

    const message = await callClaude({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 800,
      system: `You are a brand image QA reviewer for Gender Reveal Ideas (genderrevealideas.com.au), a Gold Coast Australia DTC e-commerce brand selling gender reveal smoke bombs, powder cannons, confetti cannons, balloon boxes, and party kits.

Your job is to review AI-generated images against the original prompt and score them on brand alignment.

BRAND VISUAL STANDARDS:
- Bright, joyful, warm colour palette
- Real-feeling lifestyle moments (not stock photo stiffness)
- Australian summer light, outdoor settings
- Young parents or family in natural settings
- Coloured powder, smoke, or confetti caught mid-action
- Natural expressions, no cheesy poses
- No studio backgrounds, no text overlays
- Products should resemble real GRI products (smoke grenades, confetti cannons, powder cannons)

SCORING CRITERIA:
1. Prompt adherence (does the image match what was requested?)
2. Brand alignment (does it feel like a GRI image?)
3. Composition quality (is it well composed for the intended aspect ratio?)
4. Authenticity (does it look like a real moment, not AI-generated stock?)
5. Product accuracy (if products are shown, do they look like real gender reveal products?)

Respond in EXACTLY this JSON format, nothing else:
{
  "score": 7,
  "pass": true,
  "issues": ["brief issue 1", "brief issue 2"],
  "refinedPrompt": "only include this if score < 7 — a better prompt that fixes the issues"
}

Rules:
- Score 1-10. Pass threshold is 6.
- If score >= 6, set pass: true
- If score < 6, set pass: false and provide refinedPrompt
- Keep issues array short (max 3 items)
- refinedPrompt should be a complete replacement prompt, not a diff`,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: contentType,
              data: base64,
            },
          },
          {
            type: 'text',
            text: `Review this generated image.\n\nOriginal prompt: "${prompt}"\nPlacement: ${placement || 'unknown'}\nIntended alt text: "${alt || 'N/A'}"\n\nScore it against GRI brand standards and prompt adherence.`,
          },
        ],
      }],
    }, 'blog-image-qa')

    const rawText = message.content[0].text

    // Parse JSON from response
    const jsonMatch = rawText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('Could not parse QA response')

    const review = JSON.parse(jsonMatch[0])

    console.log(`[BlogWriterRoute] Image QA — ${placement}: score ${review.score}/10, pass: ${review.pass}`)

    return res.json({ ok: true, review })
  } catch (err) {
    console.error('[BlogWriterRoute] Image QA error:', err.message)
    return res.status(500).json({ ok: false, error: err.message })
  }
})

// GET /api/blog-writer/image-config
router.get('/image-config', (_req, res) => {
  res.json({ ok: true, hasFal: hasFalConfig() })
})

// GET /api/blog-writer/history
router.get('/history', (_req, res) => {
  const history = loadHistory()
  res.json({ ok: true, history })
})

export default router
