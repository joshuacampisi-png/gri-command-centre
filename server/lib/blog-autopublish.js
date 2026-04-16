/**
 * Blog Autopublish Pipeline
 * ─────────────────────────────────────────────────────────────
 * Fully autonomous daily blog publishing:
 * 1. Pick a trending keyword (rotate through keyword pool)
 * 2. Scrape brand site + web for reference images
 * 3. Generate article via Claude Sonnet
 * 4. Generate 4 image pairs (desktop + mobile) with QA retry
 * 5. Inject images into article HTML
 * 6. Set hero desktop as featured image
 * 7. Publish to Shopify
 * 8. Send Telegram notification to Josh
 *
 * Runs daily at 6am AEST (20:00 UTC previous day).
 * ─────────────────────────────────────────────────────────────
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { generateBlogArticle } from './blog-writer.js'
import { publishToShopify, hasShopifyPublishConfig } from './shopify-publisher.js'
import { generateImage, hasFalConfig } from './fal.js'
import { callClaude } from './claude-guard.js'
import { scrapeBrandSite, scrapeWebReferences } from './scraper.js'
import { getProductImagesForKeyword, searchWebForProductImages } from './product-images.js'
import { dataFile } from './data-dir.js'
import { env } from './env.js'

const STATE_FILE = dataFile('blog-autopublish-state.json')
const HISTORY_FILE = dataFile('blog-writer-history.json')
const MAX_IMAGE_ATTEMPTS = 5

// ── Keyword pool ─────────────────────────────────────────────

const KEYWORD_POOL = [
  // High-intent product keywords
  { keyword: 'gender reveal smoke bombs australia', type: 'buying_guide' },
  { keyword: 'gender reveal confetti cannon', type: 'buying_guide' },
  { keyword: 'gender reveal powder cannon', type: 'comparison' },
  { keyword: 'best gender reveal ideas 2026', type: 'listicle' },
  { keyword: 'unique gender reveal ideas', type: 'listicle' },
  { keyword: 'outdoor gender reveal ideas', type: 'informational' },
  { keyword: 'gender reveal party ideas australia', type: 'listicle' },
  { keyword: 'gender reveal party supplies australia', type: 'buying_guide' },
  { keyword: 'how to plan a gender reveal party', type: 'informational' },
  { keyword: 'gender reveal decorations', type: 'listicle' },
  { keyword: 'gender reveal games for guests', type: 'listicle' },
  { keyword: 'gender reveal photoshoot ideas', type: 'informational' },
  { keyword: 'gender reveal ideas for couples', type: 'listicle' },
  { keyword: 'gender reveal cake ideas', type: 'listicle' },
  { keyword: 'gender reveal balloons australia', type: 'buying_guide' },
  { keyword: 'big gender reveal ideas', type: 'listicle' },
  { keyword: 'gender reveal hire gold coast', type: 'local_seasonal' },
  { keyword: 'baby gender reveal party checklist', type: 'informational' },
  { keyword: 'gender reveal box ideas', type: 'informational' },
  { keyword: 'gender reveal poppers australia', type: 'buying_guide' },
  { keyword: 'summer gender reveal ideas australia', type: 'local_seasonal' },
  { keyword: 'budget gender reveal ideas', type: 'informational' },
  { keyword: 'gender reveal for second baby', type: 'informational' },
  { keyword: 'when to have a gender reveal party', type: 'informational' },
  { keyword: 'gender reveal vs baby shower', type: 'comparison' },
  { keyword: 'gender reveal party food ideas', type: 'listicle' },
  { keyword: 'twin gender reveal ideas', type: 'listicle' },
  { keyword: 'gender reveal invitation wording', type: 'informational' },
  { keyword: 'eco friendly gender reveal ideas', type: 'informational' },
  { keyword: 'gender reveal cannon how to use', type: 'informational' },
]

// ── State management ─────────────────────────────────────────

function loadState() {
  try {
    if (!existsSync(STATE_FILE)) return { lastKeywordIndex: -1, publishedKeywords: [], runs: [] }
    return JSON.parse(readFileSync(STATE_FILE, 'utf-8'))
  } catch { return { lastKeywordIndex: -1, publishedKeywords: [], runs: [] } }
}

function saveState(state) {
  try { writeFileSync(STATE_FILE, JSON.stringify(state, null, 2)) }
  catch (e) { console.error('[Autopublish] Failed to save state:', e.message) }
}

// ── Pick next keyword ────────────────────────────────────────

function pickNextKeyword(state) {
  const published = new Set(state.publishedKeywords || [])

  // Find next unpublished keyword
  for (let i = 0; i < KEYWORD_POOL.length; i++) {
    const idx = (state.lastKeywordIndex + 1 + i) % KEYWORD_POOL.length
    const entry = KEYWORD_POOL[idx]
    if (!published.has(entry.keyword)) {
      return { ...entry, index: idx }
    }
  }

  // All keywords used — reset and start over
  console.log('[Autopublish] All keywords exhausted, resetting pool')
  state.publishedKeywords = []
  return { ...KEYWORD_POOL[0], index: 0 }
}

// ── Image generation with QA retry ───────────────────────────

async function generateImageWithQA(prompt, aspectRatio, referenceImageUrls, keyword, placement, alt) {
  let currentPrompt = prompt
  let bestResult = null
  let bestScore = 0

  for (let attempt = 1; attempt <= MAX_IMAGE_ATTEMPTS; attempt++) {
    try {
      console.log(`[Autopublish] Image ${placement} (${aspectRatio}) attempt ${attempt}/${MAX_IMAGE_ATTEMPTS}`)

      // Resolve reference images
      let finalRefs = []
      const providedRefs = (referenceImageUrls || []).filter(url =>
        url && (url.includes('cdn.shopify.com') || url.includes('shopifycdn'))
      )

      if (providedRefs.length > 0) {
        finalRefs = providedRefs
      } else {
        const searchKw = keyword || currentPrompt.slice(0, 50)
        const { images: shopifyImages } = await getProductImagesForKeyword(searchKw, 4)
        if (shopifyImages.length > 0) {
          finalRefs = shopifyImages
        } else {
          const webImages = await searchWebForProductImages(searchKw, 4)
          if (webImages.length > 0) finalRefs = webImages
        }
      }

      const result = await generateImage({ prompt: currentPrompt, aspectRatio, referenceImageUrls: finalRefs })

      // QA the image
      const imgRes = await fetch(result.imageUrl, { signal: AbortSignal.timeout(30000) })
      if (!imgRes.ok) throw new Error(`Failed to fetch image: ${imgRes.status}`)

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
            { type: 'text', text: `Review this image. Prompt: "${currentPrompt}". Placement: ${placement}. Alt: "${alt || 'N/A'}"` },
          ],
        }],
      }, 'autopublish-image-qa')

      const rawText = message.content[0].text
      const jsonMatch = rawText.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('Could not parse QA response')

      const review = JSON.parse(jsonMatch[0])
      console.log(`[Autopublish] Image ${placement} attempt ${attempt}: score ${review.score}/10`)

      if (review.score > bestScore) {
        bestScore = review.score
        bestResult = { imageUrl: result.imageUrl, score: review.score, attempt }
      }

      if (review.pass && review.score >= 7) {
        return { imageUrl: result.imageUrl, score: review.score, attempts: attempt }
      }

      if (review.refinedPrompt) currentPrompt = review.refinedPrompt
    } catch (err) {
      console.error(`[Autopublish] Image ${placement} attempt ${attempt} error:`, err.message)
    }
  }

  // Return best attempt even if it didn't pass
  if (bestResult) {
    console.log(`[Autopublish] Image ${placement}: best score ${bestScore}/10 after ${MAX_IMAGE_ATTEMPTS} attempts`)
    return { imageUrl: bestResult.imageUrl, score: bestScore, attempts: MAX_IMAGE_ATTEMPTS }
  }

  return null
}

// ── Parse image tags from article body ───────────────────────

function parseImageTags(body) {
  const regex = /\[IMAGE_(DESKTOP|MOBILE):\s*(.*?)\]/g
  const images = []
  let match

  while ((match = regex.exec(body)) !== null) {
    const variant = match[1].toLowerCase()
    const attrs = match[2]

    const get = (key) => {
      const m = attrs.match(new RegExp(`${key}="([^"]*?)"`))
      return m ? m[1] : ''
    }

    images.push({
      variant,
      placement: get('placement'),
      aspectRatio: get('aspectRatio'),
      alt: get('alt'),
      referenceImages: get('referenceImages').split(',').map(s => s.trim()).filter(Boolean),
      prompt: get('prompt'),
      raw: match[0],
    })
  }

  return images
}

// ── Inject generated image URLs into article HTML ────────────
// Pairs desktop + mobile tags by placement into a single <picture>
// element so browsers render only one image per viewport.

function injectImages(body, imageMap) {
  let result = body

  // Group imageMap entries by placement
  const byPlacement = {}
  for (const [key, data] of Object.entries(imageMap)) {
    if (!data?.imageUrl || !data?.raw) continue
    const dashIdx = key.lastIndexOf('-')
    if (dashIdx === -1) continue
    const placement = key.slice(0, dashIdx)
    const variant = key.slice(dashIdx + 1) // 'desktop' | 'mobile'
    if (!byPlacement[placement]) byPlacement[placement] = {}
    byPlacement[placement][variant] = data
  }

  for (const [placement, variants] of Object.entries(byPlacement)) {
    const desktop = variants.desktop
    const mobile = variants.mobile
    const alt = (desktop?.alt || mobile?.alt || '').replace(/"/g, '&quot;')
    const isHero = placement === 'hero'
    const loading = isHero ? 'eager' : 'lazy'
    const fetchPriority = isHero ? ' fetchpriority="high"' : ''

    if (desktop && mobile) {
      // Pair into a single <picture> element
      const pictureHtml = `<picture>
  <source media="(max-width: 767px)" srcset="${mobile.imageUrl}">
  <img src="${desktop.imageUrl}" alt="${alt}" width="1200" height="675" loading="${loading}"${fetchPriority} style="width:100%;height:auto;border-radius:8px;margin:1rem 0;">
</picture>`
      // Replace desktop tag with the picture, strip the mobile tag entirely
      result = result.replace(desktop.raw, pictureHtml)
      result = result.replace(mobile.raw, '')
    } else if (desktop) {
      const imgHtml = `<img src="${desktop.imageUrl}" alt="${alt}" width="1200" height="675" loading="${loading}"${fetchPriority} style="width:100%;height:auto;border-radius:8px;margin:1rem 0;">`
      result = result.replace(desktop.raw, imgHtml)
    } else if (mobile) {
      const imgHtml = `<img src="${mobile.imageUrl}" alt="${alt}" width="1080" height="1920" loading="${loading}"${fetchPriority} style="width:100%;height:auto;border-radius:8px;margin:1rem 0;">`
      result = result.replace(mobile.raw, imgHtml)
    }
  }

  // Clean up any remaining unparsed image tags (failed generations, orphans)
  result = result.replace(/\[IMAGE_(DESKTOP|MOBILE):[^\]]*\]\s*\n?/g, '')

  return result
}

// ── Telegram notification ────────────────────────────────────

async function notifyTelegram(article, liveUrl, imageCount, duration) {
  const token = env.telegram?.botToken || process.env.TELEGRAM_BOT_TOKEN
  const chatId = env.telegram?.joshChatId || process.env.TELEGRAM_JOSH_CHAT_ID
  if (!token || !chatId) {
    console.warn('[Autopublish] No Telegram config, skipping notification')
    return
  }

  const mins = Math.round(duration / 60000)
  const aest = new Date().toLocaleString('en-AU', { timeZone: 'Australia/Brisbane' })

  const msg = [
    `📝 *NEW BLOG PUBLISHED*`,
    ``,
    `Title: ${article.title}`,
    `Keyword: ${article.primaryKeyword}`,
    `Words: ${article.wordCount}`,
    `SEO Score: ${article.checklistScore}/${article.checklistTotal}`,
    `Images: ${imageCount} generated`,
    `Time: ${mins} minutes`,
    ``,
    `🔗 ${liveUrl}`,
    ``,
    `Published: ${aest} AEST`,
    `— Pablo Escobot`,
  ].join('\n')

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: msg,
        parse_mode: 'Markdown',
        disable_web_page_preview: false,
      }),
    })
    console.log('[Autopublish] Telegram notification sent')
  } catch (e) {
    console.error('[Autopublish] Telegram notification failed:', e.message)
  }
}

// ── Main pipeline ────────────────────────────────────────────

export async function runAutopublish() {
  const startTime = Date.now()
  const state = loadState()

  console.log('[Autopublish] ═══════════════════════════════════════')
  console.log('[Autopublish] Starting autonomous blog publish pipeline')

  // Pre-flight checks
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('[Autopublish] BLOCKED: No ANTHROPIC_API_KEY')
    return { ok: false, error: 'ANTHROPIC_API_KEY not configured' }
  }
  if (!hasShopifyPublishConfig()) {
    console.error('[Autopublish] BLOCKED: Shopify publish config incomplete')
    return { ok: false, error: 'Shopify publish config incomplete' }
  }
  if (!hasFalConfig()) {
    console.error('[Autopublish] BLOCKED: No FAL_KEY for image generation')
    return { ok: false, error: 'FAL_KEY not configured' }
  }

  // 1. Pick keyword
  const pick = pickNextKeyword(state)
  console.log(`[Autopublish] Keyword: "${pick.keyword}" (${pick.type})`)

  try {
    // 2. Scrape for reference images
    console.log('[Autopublish] Scraping brand site and web for reference images...')
    let brandScrape = null
    let webRefs = null

    try {
      brandScrape = await scrapeBrandSite(pick.keyword)
    } catch (e) {
      console.warn('[Autopublish] Brand scrape failed (non-fatal):', e.message)
    }

    try {
      webRefs = await scrapeWebReferences(pick.keyword)
    } catch (e) {
      console.warn('[Autopublish] Web scrape failed (non-fatal):', e.message)
    }

    // 3. Generate article
    console.log('[Autopublish] Generating article via Claude Sonnet...')
    const article = await generateBlogArticle(pick.keyword, {
      articleType: pick.type,
      brandScrape,
      webRefs,
    })

    console.log(`[Autopublish] Article generated: "${article.title}" — ${article.wordCount} words, SEO ${article.checklistScore}/${article.checklistTotal}`)

    // 4. Parse image tags from article body
    const imageTags = parseImageTags(article.body_html)
    console.log(`[Autopublish] Found ${imageTags.length} image tags to generate`)

    // 5. Generate images with QA (process sequentially to manage API load)
    const imageMap = {}
    let imageCount = 0
    let featuredImageUrl = null

    for (const tag of imageTags) {
      const key = `${tag.placement}-${tag.variant}`
      const result = await generateImageWithQA(
        tag.prompt,
        tag.aspectRatio,
        tag.referenceImages,
        pick.keyword,
        tag.placement,
        tag.alt,
      )

      if (result) {
        imageMap[key] = { ...result, raw: tag.raw, alt: tag.alt }
        imageCount++

        // Use hero desktop as featured image
        if (tag.placement === 'hero' && tag.variant === 'desktop') {
          featuredImageUrl = result.imageUrl
        }
      }
    }

    console.log(`[Autopublish] Generated ${imageCount}/${imageTags.length} images`)

    // 6. Inject image URLs into article HTML
    const finalBody = injectImages(article.body_html, imageMap)
    article.body_html = finalBody

    // 7. Publish to Shopify
    console.log('[Autopublish] Publishing to Shopify...')
    const publishPayload = {
      ...article,
      featuredImageUrl,
    }
    const result = await publishToShopify(publishPayload)

    console.log(`[Autopublish] ✅ Published: ${result.liveUrl}`)

    // 8. Update state
    state.lastKeywordIndex = pick.index
    if (!state.publishedKeywords) state.publishedKeywords = []
    state.publishedKeywords.push(pick.keyword)

    const duration = Date.now() - startTime
    const runRecord = {
      keyword: pick.keyword,
      articleType: pick.type,
      title: article.title,
      handle: article.handle,
      wordCount: article.wordCount,
      seoScore: `${article.checklistScore}/${article.checklistTotal}`,
      imagesGenerated: imageCount,
      imagesTotal: imageTags.length,
      featuredImage: !!featuredImageUrl,
      liveUrl: result.liveUrl,
      shopifyId: result.shopifyId,
      durationMs: duration,
      publishedAt: new Date().toISOString(),
      status: 'success',
    }

    if (!state.runs) state.runs = []
    state.runs.unshift(runRecord)
    state.runs = state.runs.slice(0, 60) // Keep last 60 runs
    saveState(state)

    // Save to blog writer history too
    try {
      let history = []
      if (existsSync(HISTORY_FILE)) {
        history = JSON.parse(readFileSync(HISTORY_FILE, 'utf-8'))
      }
      history.unshift({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        keyword: pick.keyword,
        brand: 'GRI',
        articleType: pick.type,
        title: article.title,
        handle: article.handle,
        wordCount: article.wordCount,
        checklistScore: article.checklistScore,
        checklistTotal: article.checklistTotal,
        generatedAt: article.generatedAt,
        status: 'published',
        liveUrl: result.liveUrl,
        shopifyId: result.shopifyId,
        publishedAt: result.publishedAt,
        source: 'autopublish',
      })
      writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2))
    } catch (e) {
      console.warn('[Autopublish] Failed to update history:', e.message)
    }

    // 9. Telegram notification
    await notifyTelegram(article, result.liveUrl, imageCount, duration)

    console.log('[Autopublish] ═══════════════════════════════════════')
    console.log(`[Autopublish] Pipeline complete in ${Math.round(duration / 1000)}s`)

    return { ok: true, ...runRecord }

  } catch (err) {
    const duration = Date.now() - startTime
    console.error(`[Autopublish] Pipeline FAILED for "${pick.keyword}":`, err.message)

    // Log failure
    const failRecord = {
      keyword: pick.keyword,
      articleType: pick.type,
      error: err.message,
      durationMs: duration,
      publishedAt: new Date().toISOString(),
      status: 'failed',
    }
    if (!state.runs) state.runs = []
    state.runs.unshift(failRecord)
    state.runs = state.runs.slice(0, 60)
    saveState(state)

    // Notify Josh of failure
    const token = env.telegram?.botToken || process.env.TELEGRAM_BOT_TOKEN
    const chatId = env.telegram?.joshChatId || process.env.TELEGRAM_JOSH_CHAT_ID
    if (token && chatId) {
      try {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: `⚠️ *BLOG AUTOPUBLISH FAILED*\n\nKeyword: ${pick.keyword}\nError: ${err.message}\n\n— Pablo Escobot`,
            parse_mode: 'Markdown',
          }),
        })
      } catch {}
    }

    return { ok: false, error: err.message, ...failRecord }
  }
}

// ── Cron scheduler ───────────────────────────────────────────

function msUntilNextUTC(utcHour, utcMinute = 0) {
  const now = new Date()
  const target = new Date(now)
  target.setUTCHours(utcHour, utcMinute, 0, 0)
  if (target <= now) target.setUTCDate(target.getUTCDate() + 1)
  return Math.max(0, target.getTime() - now.getTime())
}

let active = false

export function startBlogAutopublishCron() {
  if (active) return
  active = true

  console.log('[Autopublish Cron] Blog autopublish scheduler active, daily at 6am AEST')

  // Daily at 6am AEST = 20:00 UTC (previous day)
  const schedule = () => {
    const ms = msUntilNextUTC(20, 0)
    const next = new Date(Date.now() + ms)
    console.log(`[Autopublish Cron] Next run: ${next.toLocaleString('en-AU', { timeZone: 'Australia/Brisbane' })} AEST`)

    setTimeout(async () => {
      try {
        await runAutopublish()
      } catch (e) {
        console.error('[Autopublish Cron] Unhandled error:', e.message)
      }
      schedule()
    }, ms)
  }

  schedule()
}

// ── Status for API ───────────────────────────────────────────

export function getAutopublishStatus() {
  const state = loadState()
  const nextKeyword = pickNextKeyword({ ...state })

  return {
    active,
    nextKeyword: nextKeyword.keyword,
    nextType: nextKeyword.type,
    totalKeywords: KEYWORD_POOL.length,
    publishedCount: (state.publishedKeywords || []).length,
    remainingCount: KEYWORD_POOL.length - (state.publishedKeywords || []).length,
    recentRuns: (state.runs || []).slice(0, 10),
    lastRun: (state.runs || [])[0] || null,
  }
}
