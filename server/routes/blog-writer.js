/**
 * Blog Writer API Routes
 * ─────────────────────────────────────────────────────────────
 * POST /api/blog-writer/scrape-brand    — scrape brand site for product images
 * POST /api/blog-writer/scrape-web      — scrape web for lifestyle reference images
 * POST /api/blog-writer/generate       — generate article from keyword + scrape context
 * POST /api/blog-writer/publish        — publish generated article to Shopify
 * POST /api/blog-writer/generate-image — generate single image via Fal.ai FLUX
 * POST /api/blog-writer/review-image   — Claude vision QA review of generated image
 * GET  /api/blog-writer/session        — restore working state
 * PUT  /api/blog-writer/session        — save working state
 * DELETE /api/blog-writer/session      — clear session
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
import { scrapeBrandSite, scrapeWebReferences } from '../lib/scraper.js'
import { getProductImagesForKeyword, searchWebForProductImages } from '../lib/product-images.js'
import { dataFile } from '../lib/data-dir.js'

const router = Router()
const HISTORY_FILE = dataFile('blog-writer-history.json')
const SESSION_FILE = dataFile('blog-writer-session.json')

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

// ── Session store (persists blog writer state across tab switches / refreshes) ──

function loadSession() {
  try {
    if (!existsSync(SESSION_FILE)) return null
    const data = JSON.parse(readFileSync(SESSION_FILE, 'utf8'))
    // Expire sessions older than 24 hours
    if (data.savedAt && Date.now() - new Date(data.savedAt).getTime() > 24 * 60 * 60 * 1000) {
      return null
    }
    return data
  } catch { return null }
}

function saveSession(session) {
  try {
    writeFileSync(SESSION_FILE, JSON.stringify({ ...session, savedAt: new Date().toISOString() }, null, 2))
  } catch (e) {
    console.error('[BlogWriter] Failed to save session:', e.message)
  }
}

function clearSession() {
  try {
    if (existsSync(SESSION_FILE)) writeFileSync(SESSION_FILE, '{}')
  } catch {}
}

// ── Routes ────────────────────────────────────────────────────

// GET /api/blog-writer/article-types
router.get('/article-types', (_req, res) => {
  res.json({ ok: true, types: ARTICLE_TYPES })
})

// POST /api/blog-writer/scrape-brand — scrape brand site for product images
router.post('/scrape-brand', async (req, res) => {
  const { keyword } = req.body
  if (!keyword) return res.status(400).json({ ok: false, error: 'keyword required' })

  try {
    const result = await scrapeBrandSite(keyword.trim())
    return res.json({ ok: true, ...result })
  } catch (err) {
    console.error('[scrape-brand]', err.message)
    return res.json({
      ok: true,
      brand: 'gri',
      keyword: keyword.trim(),
      siteUrl: 'https://genderrevealideas.com.au',
      productImages: [],
      productNames: [],
      productDescriptions: [],
      productPageUrls: [],
      error: err.message,
    })
  }
})

// POST /api/blog-writer/scrape-web — scrape web for lifestyle reference images
router.post('/scrape-web', async (req, res) => {
  const { keyword } = req.body
  if (!keyword) return res.status(400).json({ ok: false, error: 'keyword required' })

  try {
    const result = await scrapeWebReferences(keyword.trim())
    return res.json({ ok: true, ...result })
  } catch (err) {
    console.error('[scrape-web]', err.message)
    return res.json({
      ok: true,
      keyword: keyword.trim(),
      referenceImages: [],
      searchQuery: '',
      error: err.message,
    })
  }
})

// POST /api/blog-writer/generate
router.post('/generate', async (req, res) => {
  const { keyword, articleType, brandScrape, webRefs } = req.body

  if (!keyword || !keyword.trim()) {
    return res.status(400).json({ ok: false, error: 'keyword is required' })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(400).json({ ok: false, error: 'ANTHROPIC_API_KEY not configured' })
  }

  try {
    const article = await generateBlogArticle(keyword.trim(), {
      articleType: articleType || 'informational',
      brandScrape: brandScrape || null,
      webRefs: webRefs || null,
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
// Generates a single image via Nano Banana Pro.
// If referenceImageUrls are empty or look like garbage (non-Shopify CDN),
// automatically fetches real product images from Shopify instead.
router.post('/generate-image', async (req, res) => {
  const { prompt, aspectRatio, referenceImageUrls, keyword } = req.body

  if (!prompt) return res.status(400).json({ ok: false, error: 'prompt required' })
  if (!aspectRatio) return res.status(400).json({ ok: false, error: 'aspectRatio required' })

  if (!hasFalConfig()) {
    return res.status(400).json({
      ok: false,
      error: 'Fal.ai credentials missing. Add FAL_KEY to environment variables.',
    })
  }

  try {
    const searchKeyword = keyword || prompt.slice(0, 50)
    let finalRefs = []
    let tier = 'none'

    // ── TIER 1: Shopify product images (exact match) ─────────
    const providedRefs = (referenceImageUrls || []).filter(url =>
      url && (url.includes('cdn.shopify.com') || url.includes('shopifycdn'))
    )

    if (providedRefs.length > 0) {
      finalRefs = providedRefs
      tier = '1-shopify-provided'
    } else {
      const { images: shopifyImages, matchedProducts } = await getProductImagesForKeyword(searchKeyword, 4)
      if (shopifyImages.length > 0) {
        finalRefs = shopifyImages
        tier = '1-shopify-registry'
        console.log(`[generate-image] TIER 1: Using ${finalRefs.length} Shopify images (${matchedProducts.join(', ')})`)
      }
    }

    // ── TIER 2: Web search for product images ────────────────
    if (finalRefs.length === 0) {
      console.log(`[generate-image] TIER 1 miss, trying web search for: "${searchKeyword}"`)
      const webImages = await searchWebForProductImages(searchKeyword, 4)
      if (webImages.length > 0) {
        finalRefs = webImages
        tier = '2-web-search'
        console.log(`[generate-image] TIER 2: Using ${finalRefs.length} web search images`)
      }
    }

    // ── TIER 3: Text-to-image with Product DNA context ───────
    if (finalRefs.length === 0) {
      tier = '3-text-only'
      console.log(`[generate-image] TIER 3: No reference images found, using text-to-image with Product DNA context`)
      // The Product DNA is already baked into the system prompt,
      // so even without reference images the prompt describes
      // GRI's exact products and photography style.
    }

    console.log(`[generate-image] Final: tier=${tier}, refs=${finalRefs.length}, aspect=${aspectRatio}`)

    const result = await generateImage({ prompt, aspectRatio, referenceImageUrls: finalRefs })
    return res.json({ ok: true, imageUrl: result.imageUrl, requestId: result.requestId, tier })
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
      model: 'claude-haiku-4-5-20251001',
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

EXACT PRODUCT APPEARANCE (score against these):
- MEGA BLASTER: White steel fire extinguisher shape, brass/gold valve top, red pressure gauge, chrome handle and trigger lever, "MEGA BLASTER" teal cloud logo
- MINI BLASTER: White cylindrical bottle, black twist-top nozzle, "MINI BLASTER" teal/red cloud logo
- BIO-CANNON: Long hot pink tube (~50cm), "BIO-CANNON" white text, black twist top
- SMOKE BOMBS: Grey/silver metallic canister, wire pull-ring on top
- BASKETBALL: White box with orange basketball graphic, "GENDER REVEAL BASKETBALL" pink text

SCORING CRITERIA:
1. Product accuracy (HIGHEST WEIGHT — does the product in the image match the exact description above? Correct shape, correct colour, correct mechanism?)
2. Scene authenticity (Australian outdoor setting, natural light, real moment feel?)
3. Composition quality (well composed for the aspect ratio?)
4. Brand alignment (warm, joyful, celebratory, not clinical or stock-photo?)
5. Prompt adherence (does the scene match what was requested?)
6. Colour accuracy (are the revealed colours vivid pink or blue? Is powder/smoke/confetti the right colour and visible?)
7. Face and skin realism (no AI artifacts on faces, no extra fingers, natural skin tones, no uncanny valley)
8. Product match (does the product in the image match 1:1 with a real GRI product from the DNA above? Wrong shape or wrong branding = automatic fail)

Respond in EXACTLY this JSON format, nothing else:
{
  "score": 7,
  "pass": true,
  "issues": ["brief issue 1", "brief issue 2"],
  "refinedPrompt": "only include this if score < 7 — a better prompt that fixes the issues"
}

Rules:
- Score 1-10. Pass threshold is 7.
- If score >= 7, set pass: true
- If score < 7, set pass: false and provide refinedPrompt
- Keep issues array short (max 3 items)
- refinedPrompt should be a complete replacement prompt, not a diff
- Product accuracy is KING: if the product shape, colour, or branding is wrong, cap the score at 4 regardless of how good the rest of the image is
- Face artifacts (extra fingers, melted features, uncanny skin) = cap score at 5
- Wrong reveal colour (blue when it should be pink, or vice versa) = cap score at 3`,
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

// POST /api/blog-writer/generate-image-with-qa
// Generates an image and retries up to 5 times until QA passes (score >= 7)
router.post('/generate-image-with-qa', async (req, res) => {
  const { prompt, aspectRatio, referenceImageUrls, keyword, placement, alt } = req.body

  if (!prompt) return res.status(400).json({ ok: false, error: 'prompt required' })
  if (!aspectRatio) return res.status(400).json({ ok: false, error: 'aspectRatio required' })

  if (!hasFalConfig()) {
    return res.status(400).json({ ok: false, error: 'Fal.ai credentials missing. Add FAL_KEY to environment variables.' })
  }

  const MAX_ATTEMPTS = 5
  let currentPrompt = prompt
  let lastReview = null
  let lastImageUrl = null
  const attempts = []

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    console.log(`[generate-image-with-qa] Attempt ${attempt}/${MAX_ATTEMPTS} for ${placement || 'unknown'} (${aspectRatio})`)

    try {
      // Generate image
      const searchKeyword = keyword || currentPrompt.slice(0, 50)
      let finalRefs = []
      let tier = 'none'

      const providedRefs = (referenceImageUrls || []).filter(url =>
        url && (url.includes('cdn.shopify.com') || url.includes('shopifycdn'))
      )

      if (providedRefs.length > 0) {
        finalRefs = providedRefs
        tier = '1-shopify-provided'
      } else {
        const { images: shopifyImages, matchedProducts } = await getProductImagesForKeyword(searchKeyword, 4)
        if (shopifyImages.length > 0) {
          finalRefs = shopifyImages
          tier = '1-shopify-registry'
        }
      }

      if (finalRefs.length === 0) {
        const webImages = await searchWebForProductImages(searchKeyword, 4)
        if (webImages.length > 0) {
          finalRefs = webImages
          tier = '2-web-search'
        }
      }

      if (finalRefs.length === 0) tier = '3-text-only'

      const result = await generateImage({ prompt: currentPrompt, aspectRatio, referenceImageUrls: finalRefs })
      lastImageUrl = result.imageUrl

      // QA the image
      const imgRes = await fetch(result.imageUrl)
      if (!imgRes.ok) throw new Error(`Failed to fetch image for QA: ${imgRes.status}`)

      const buffer = await imgRes.arrayBuffer()
      const base64 = Buffer.from(buffer).toString('base64')
      const contentType = imgRes.headers.get('content-type') || 'image/jpeg'

      const message = await callClaude({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 800,
        system: `You are a strict brand image QA reviewer for Gender Reveal Ideas. Score images 1-10. Pass threshold is 7. Product accuracy is KING — wrong product = cap at 4. Face artifacts = cap at 5. Wrong reveal colour = cap at 3.

EXACT PRODUCT APPEARANCE:
- MEGA BLASTER: White steel fire extinguisher shape, brass/gold valve, red gauge, chrome handle, "MEGA BLASTER" teal cloud logo
- MINI BLASTER: White cylindrical bottle, black twist-top, "MINI BLASTER" teal/red cloud logo
- BIO-CANNON: Long hot pink tube, "BIO-CANNON" white text, black twist top
- SMOKE BOMBS: Grey/silver metallic canister, wire pull-ring on top
- BASKETBALL: White box, orange basketball graphic, "GENDER REVEAL BASKETBALL" pink text

Respond in JSON only: {"score": N, "pass": bool, "issues": [...], "refinedPrompt": "...only if score < 7"}`,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: contentType, data: base64 } },
            { type: 'text', text: `Review this image. Prompt: "${currentPrompt}". Placement: ${placement || 'unknown'}. Alt: "${alt || 'N/A'}"` },
          ],
        }],
      }, 'blog-image-qa-auto')

      const rawText = message.content[0].text
      const jsonMatch = rawText.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('Could not parse QA response')

      lastReview = JSON.parse(jsonMatch[0])

      attempts.push({
        attempt,
        imageUrl: result.imageUrl,
        requestId: result.requestId,
        tier,
        prompt: currentPrompt,
        score: lastReview.score,
        pass: lastReview.pass,
        issues: lastReview.issues,
      })

      console.log(`[generate-image-with-qa] Attempt ${attempt}: score ${lastReview.score}/10, pass: ${lastReview.pass}`)

      if (lastReview.pass) {
        return res.json({
          ok: true,
          imageUrl: result.imageUrl,
          requestId: result.requestId,
          tier,
          review: lastReview,
          attempts,
          totalAttempts: attempt,
        })
      }

      // Use refined prompt for next attempt if provided
      if (lastReview.refinedPrompt) {
        currentPrompt = lastReview.refinedPrompt
      }
    } catch (err) {
      console.error(`[generate-image-with-qa] Attempt ${attempt} error:`, err.message)
      attempts.push({ attempt, error: err.message })
    }
  }

  // All attempts failed QA — return the best scoring one
  const bestAttempt = attempts
    .filter(a => a.score != null)
    .sort((a, b) => b.score - a.score)[0]

  return res.json({
    ok: true,
    imageUrl: bestAttempt?.imageUrl || lastImageUrl,
    requestId: bestAttempt?.requestId,
    tier: bestAttempt?.tier || 'unknown',
    review: lastReview,
    attempts,
    totalAttempts: MAX_ATTEMPTS,
    warning: `Best score was ${bestAttempt?.score || 'N/A'}/10 after ${MAX_ATTEMPTS} attempts`,
  })
})

// GET /api/blog-writer/session — restore working state after tab switch / refresh
router.get('/session', (_req, res) => {
  const session = loadSession()
  if (!session || !session.phase) {
    return res.json({ ok: true, session: null })
  }
  return res.json({ ok: true, session })
})

// PUT /api/blog-writer/session — save working state
router.put('/session', (req, res) => {
  const { phase, keyword, articleType, article, blocks, imagePairs, imageProgress, finalOutput, selectedImages, imagesApplied } = req.body
  saveSession({ phase, keyword, articleType, article, blocks, imagePairs, imageProgress, finalOutput, selectedImages, imagesApplied })
  return res.json({ ok: true })
})

// DELETE /api/blog-writer/session — clear session (on discard or publish)
router.delete('/session', (_req, res) => {
  clearSession()
  return res.json({ ok: true })
})

// GET /api/blog-writer/image-config
router.get('/image-config', (_req, res) => {
  res.json({ ok: true, hasFal: hasFalConfig() })
})

// ── Image Feedback Learning System ──────────────────────────
const FEEDBACK_FILE = dataFile('blog-writer-image-feedback.json')

function loadFeedback() {
  try {
    if (existsSync(FEEDBACK_FILE)) return JSON.parse(readFileSync(FEEDBACK_FILE, 'utf-8'))
  } catch {}
  return []
}

function saveFeedback(entries) {
  writeFileSync(FEEDBACK_FILE, JSON.stringify(entries, null, 2))
}

// POST /api/blog-writer/image-feedback — store thumbs up/down + comment
router.post('/image-feedback', (req, res) => {
  const { rating, comment, placement, variant, prompt, imageUrl, keyword } = req.body
  if (!rating) return res.status(400).json({ ok: false, error: 'rating required' })

  const entries = loadFeedback()
  entries.push({
    rating, // 'good' or 'bad'
    comment: comment || '',
    placement,
    variant,
    prompt: prompt || '',
    imageUrl: imageUrl || '',
    keyword: keyword || '',
    timestamp: new Date().toISOString(),
  })

  // Keep last 200 entries
  const trimmed = entries.slice(-200)
  saveFeedback(trimmed)

  console.log(`[image-feedback] ${rating} — ${comment || 'no comment'} — keyword: ${keyword}`)
  return res.json({ ok: true, totalFeedback: trimmed.length })
})

// POST /api/blog-writer/image-feedback-on-publish — mark all selected images as approved
router.post('/image-feedback-on-publish', (req, res) => {
  const { imagePairs, keyword } = req.body
  if (!imagePairs) return res.status(400).json({ ok: false, error: 'imagePairs required' })

  const entries = loadFeedback()
  const placements = ['hero', 'inline-1', 'inline-2', 'inline-3']

  for (const p of placements) {
    if (!imagePairs[p]) continue
    for (const v of ['desktop', 'mobile']) {
      const img = imagePairs[p][v]
      if (img && img.url && img.status === 'done') {
        entries.push({
          rating: 'published',
          comment: 'Auto-approved: selected and published to Shopify',
          placement: p,
          variant: v,
          prompt: img.prompt || '',
          imageUrl: img.url || '',
          keyword: keyword || '',
          timestamp: new Date().toISOString(),
        })
      }
    }
  }

  saveFeedback(entries.slice(-200))
  console.log(`[image-feedback] Published — auto-approved images for keyword: ${keyword}`)
  return res.json({ ok: true })
})

// GET /api/blog-writer/image-feedback — retrieve feedback for learning context
router.get('/image-feedback', (_req, res) => {
  const entries = loadFeedback()
  return res.json({ ok: true, feedback: entries, total: entries.length })
})

// GET /api/blog-writer/product-images?keyword=smoke+bombs
// Debug: see which real product images would be used for a keyword
router.get('/product-images', async (req, res) => {
  const keyword = req.query.keyword || 'gender reveal'
  try {
    const { images, matchedProducts } = await getProductImagesForKeyword(keyword)
    res.json({ ok: true, keyword, matchedProducts, images, count: images.length })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// GET /api/blog-writer/history
router.get('/history', (_req, res) => {
  const history = loadHistory()
  res.json({ ok: true, history })
})

// DELETE /api/blog-writer/history/:id
router.delete('/history/:id', (req, res) => {
  const { id } = req.params
  const history = loadHistory()
  const idx = history.findIndex(h => h.id === id)
  if (idx === -1) {
    return res.status(404).json({ ok: false, error: 'Article not found in history' })
  }
  const removed = history.splice(idx, 1)[0]
  saveHistory(history)
  console.log(`[BlogWriterRoute] Deleted from history: "${removed.title}"`)
  return res.json({ ok: true, deleted: removed.id })
})

export default router
