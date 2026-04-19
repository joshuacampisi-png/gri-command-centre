/**
 * Blog Autopublish Pipeline (v2 — evidence-backed)
 * ─────────────────────────────────────────────────────────────
 * Daily 06:00 AEST. Each step logs per-stage status. Any failure
 * blocks publish and stores the draft + reason for the dashboard.
 *
 * Pipeline:
 *  1. Topic pick          — manual queue first, else keyword pool
 *  2. YouTube evidence    — GRI channel transcripts → verified quotes
 *  3. Best-sellers        — Shopify top 100 (60d, active-only)
 *  4. Write article       — Sonnet with real quotes + real products
 *  5. Generate images     — FAL + Haiku vision QA (7/10 pass)
 *  6. Validate links      — HEAD checks + slug auto-repair + block on dead
 *  7. Validate content    — regex + Haiku placeholder / fabricated-quote scan
 *  8. Publish to Shopify  — author byline + schema + hero image
 *  9. Telegram            — failure by default; success if BLOG_NOTIFY_SUCCESS=1
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
import { getTopBestSellers, filterRelevantToKeyword } from './shopify-bestsellers.js'
import { getRelevantTranscripts } from './youtube-transcripts.js'
import { extractQuotes } from './quote-extractor.js'
import { validateAndRepairLinks } from './link-validator.js'
import { validateContent } from './content-qa.js'
import { recordFailure } from './blog-failure-store.js'
import { peekNext as peekTopic, popNext as popTopic, recordPublished } from './blog-topic-queue.js'

const STATE_FILE = dataFile('blog-autopublish-state.json')
const HISTORY_FILE = dataFile('blog-writer-history.json')
const MAX_IMAGE_ATTEMPTS = 5

// ── Keyword pool (fallback when manual queue is empty) ──────

const KEYWORD_POOL = [
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

// ── Topic selection ──────────────────────────────────────────

function pickFromPool(state) {
  const published = new Set(state.publishedKeywords || [])
  for (let i = 0; i < KEYWORD_POOL.length; i++) {
    const idx = (state.lastKeywordIndex + 1 + i) % KEYWORD_POOL.length
    const entry = KEYWORD_POOL[idx]
    if (!published.has(entry.keyword)) {
      return { ...entry, index: idx, source: 'pool' }
    }
  }
  console.log('[Autopublish] All pool keywords exhausted, resetting')
  state.publishedKeywords = []
  return { ...KEYWORD_POOL[0], index: 0, source: 'pool' }
}

function pickTopic(state) {
  // Manual queue wins
  const manual = peekTopic()
  if (manual) {
    return {
      keyword: manual.keyword,
      type: manual.articleType || 'informational',
      brief: manual.brief || '',
      source: 'manual-queue',
      index: -1,
    }
  }
  return pickFromPool(state)
}

// ── Image generation with QA retry (unchanged core logic) ────

async function generateImageWithQA(prompt, aspectRatio, referenceImageUrls, keyword, placement, alt) {
  let currentPrompt = prompt
  let bestResult = null
  let bestScore = 0

  for (let attempt = 1; attempt <= MAX_IMAGE_ATTEMPTS; attempt++) {
    try {
      console.log(`[Autopublish] Image ${placement} (${aspectRatio}) attempt ${attempt}/${MAX_IMAGE_ATTEMPTS}`)

      let finalRefs = []
      const providedRefs = (referenceImageUrls || []).filter(url =>
        url && (url.includes('cdn.shopify.com') || url.includes('shopifycdn'))
      )

      if (providedRefs.length > 0) {
        finalRefs = providedRefs
      } else {
        const searchKw = keyword || currentPrompt.slice(0, 50)
        const { images: shopifyImages } = await getProductImagesForKeyword(searchKw, 4)
        if (shopifyImages.length > 0) finalRefs = shopifyImages
        else {
          const webImages = await searchWebForProductImages(searchKw, 4)
          if (webImages.length > 0) finalRefs = webImages
        }
      }

      const result = await generateImage({ prompt: currentPrompt, aspectRatio, referenceImageUrls: finalRefs })

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

  if (bestResult) {
    console.log(`[Autopublish] Image ${placement}: best score ${bestScore}/10 after ${MAX_IMAGE_ATTEMPTS} attempts`)
    return { imageUrl: bestResult.imageUrl, score: bestScore, attempts: MAX_IMAGE_ATTEMPTS }
  }

  return null
}

// ── Image tag parsing / injection (unchanged from v1) ────────

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

function injectImages(body, imageMap) {
  let result = body
  const byPlacement = {}
  for (const [key, data] of Object.entries(imageMap)) {
    if (!data?.imageUrl || !data?.raw) continue
    const dashIdx = key.lastIndexOf('-')
    if (dashIdx === -1) continue
    const placement = key.slice(0, dashIdx)
    const variant = key.slice(dashIdx + 1)
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
      const pictureHtml = `<picture>
  <source media="(max-width: 767px)" srcset="${mobile.imageUrl}">
  <img src="${desktop.imageUrl}" alt="${alt}" width="1200" height="675" loading="${loading}"${fetchPriority} style="width:100%;height:auto;border-radius:8px;margin:1rem 0;">
</picture>`
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
  result = result.replace(/\[IMAGE_(DESKTOP|MOBILE):[^\]]*\]\s*\n?/g, '')
  return result
}

// ── Telegram ─────────────────────────────────────────────────

async function notifySuccess(article, liveUrl, stats) {
  // Only send success notifications when explicitly opted in
  if (process.env.BLOG_NOTIFY_SUCCESS !== '1') return
  const token = env.telegram?.botToken || process.env.TELEGRAM_BOT_TOKEN
  const chatId = env.telegram?.joshChatId || process.env.TELEGRAM_JOSH_CHAT_ID
  if (!token || !chatId) return

  const mins = Math.round(stats.durationMs / 60000)
  const aest = new Date().toLocaleString('en-AU', { timeZone: 'Australia/Brisbane' })
  const msg = [
    `📝 *NEW BLOG PUBLISHED*`,
    ``,
    `Title: ${article.title}`,
    `Keyword: ${article.primaryKeyword}`,
    `Words: ${article.wordCount}`,
    `SEO: ${article.checklistScore}/${article.checklistTotal}`,
    `Images: ${stats.imageCount}`,
    `Quotes: ${stats.quoteCount} verified`,
    `Links: ${stats.linksChecked} checked, ${stats.linkRepairs} repaired`,
    `Best-sellers used: ${stats.bestSellerCount}`,
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
      body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: 'Markdown', disable_web_page_preview: false }),
    })
  } catch (e) {
    console.error('[Autopublish] Telegram success notification failed:', e.message)
  }
}

async function notifyFailure(stage, keyword, reason, extras = '') {
  const token = env.telegram?.botToken || process.env.TELEGRAM_BOT_TOKEN
  const chatId = env.telegram?.joshChatId || process.env.TELEGRAM_JOSH_CHAT_ID
  if (!token || !chatId) return
  const msg = [
    `⚠️ *BLOG AUTOPUBLISH BLOCKED*`,
    ``,
    `Stage: ${stage}`,
    `Keyword: ${keyword}`,
    `Reason: ${reason}`,
    extras,
    ``,
    `Check /blog/failures in the dashboard to review and republish.`,
    `— Pablo Escobot`,
  ].filter(Boolean).join('\n')
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: 'Markdown' }),
    })
  } catch {}
}

// ── Main pipeline ────────────────────────────────────────────

export async function runAutopublish(options = {}) {
  const startTime = Date.now()
  const state = loadState()
  const dryRun = options.dryRun === true

  console.log('[Autopublish] ═══════════════════════════════════════')
  console.log(`[Autopublish] Starting v2 pipeline${dryRun ? ' [DRY-RUN]' : ''}`)

  // Pre-flight
  if (!process.env.ANTHROPIC_API_KEY) return blockedPreflight('ANTHROPIC_API_KEY not configured')
  if (!hasShopifyPublishConfig()) return blockedPreflight('Shopify publish config incomplete')
  if (!hasFalConfig()) return blockedPreflight('FAL_KEY not configured')

  // Step 1: topic
  const pick = options.overrideTopic || pickTopic(state)
  console.log(`[Autopublish] [1/9] Topic: "${pick.keyword}" (${pick.type}, source=${pick.source})`)

  const stageTimers = {}
  const timer = (stage) => { stageTimers[stage] = Date.now() }
  const done = (stage) => { stageTimers[stage] = Date.now() - stageTimers[stage] }

  try {
    // Step 2: YouTube evidence
    timer('youtube')
    console.log('[Autopublish] [2/9] Pulling YouTube transcripts + quotes...')
    let verifiedQuotes = []
    try {
      const transcripts = await getRelevantTranscripts(pick.keyword, 4)
      verifiedQuotes = await extractQuotes(transcripts, pick.keyword, 4)
    } catch (e) {
      console.warn('[Autopublish] YouTube evidence step non-fatal error:', e.message)
    }
    done('youtube')
    console.log(`[Autopublish] [2/9] ${verifiedQuotes.length} verified quotes`)

    // Step 3: Best-sellers
    timer('bestsellers')
    console.log('[Autopublish] [3/9] Fetching live Shopify best-sellers...')
    let bestSellers = []
    try {
      const topAll = await getTopBestSellers(100, 60)
      bestSellers = filterRelevantToKeyword(topAll, pick.keyword, 12)
    } catch (e) {
      console.warn('[Autopublish] Best-sellers step non-fatal error:', e.message)
    }
    done('bestsellers')
    console.log(`[Autopublish] [3/9] ${bestSellers.length} best-sellers matched`)

    // Reference image scrape (legacy, non-fatal)
    let brandScrape = null
    let webRefs = null
    try { brandScrape = await scrapeBrandSite(pick.keyword) } catch {}
    try { webRefs = await scrapeWebReferences(pick.keyword) } catch {}

    // Step 4: Article generation
    timer('article')
    console.log('[Autopublish] [4/9] Generating article via Sonnet...')
    const article = await generateBlogArticle(pick.keyword, {
      articleType: pick.type,
      brief: pick.brief,
      brandScrape,
      webRefs,
      bestSellers,
      verifiedQuotes,
    })
    done('article')
    console.log(`[Autopublish] [4/9] "${article.title}" — ${article.wordCount}w, SEO ${article.checklistScore}/${article.checklistTotal}`)

    // Step 5: Images (skippable for structural smoke tests)
    timer('images')
    const imageTags = parseImageTags(article.body_html)
    const imageMap = {}
    let imageCount = 0
    let featuredImageUrl = null
    if (options.skipImages) {
      console.log('[Autopublish] [5/9] Skipping image generation (skipImages=true)')
      // Strip image tags so downstream link + QA validators see clean HTML
      article.body_html = article.body_html.replace(/\[IMAGE_(DESKTOP|MOBILE):[^\]]*\]\s*\n?/g, '')
    } else {
      console.log('[Autopublish] [5/9] Generating images with QA...')
      for (const tag of imageTags) {
        const key = `${tag.placement}-${tag.variant}`
        const result = await generateImageWithQA(
          tag.prompt, tag.aspectRatio, tag.referenceImages, pick.keyword, tag.placement, tag.alt,
        )
        if (result) {
          imageMap[key] = { ...result, raw: tag.raw, alt: tag.alt }
          imageCount++
          if (tag.placement === 'hero' && tag.variant === 'desktop') featuredImageUrl = result.imageUrl
        }
      }
      article.body_html = injectImages(article.body_html, imageMap)
    }
    done('images')
    console.log(`[Autopublish] [5/9] ${imageCount}/${imageTags.length} images generated, featured=${!!featuredImageUrl}`)

    // Step 6: Link validation
    timer('links')
    console.log('[Autopublish] [6/9] Validating links (HEAD + repair)...')
    const linkResult = await validateAndRepairLinks(article.body_html, { allowExternal: true })
    if (!linkResult.ok) {
      return handleFailure({
        startTime, state, pick, stage: 'link-validation',
        reason: `Dead links: ${linkResult.deadLinks.map(d => `${d.url} (${d.status})`).join(', ').slice(0, 400)}`,
        issues: linkResult.deadLinks,
        article,
        dryRun,
      })
    }
    article.body_html = linkResult.body
    done('links')
    console.log(`[Autopublish] [6/9] ${linkResult.totalChecked} links OK, ${linkResult.repairs.length} repaired`)

    // Step 7: Content QA
    timer('contentqa')
    console.log('[Autopublish] [7/9] Running content QA (regex + Haiku)...')
    const qa = await validateContent(article.body_html, verifiedQuotes, bestSellers, { skipHaiku: false })
    if (!qa.ok) {
      return handleFailure({
        startTime, state, pick, stage: 'content-qa',
        reason: `Content issues: ${qa.issues.join(' | ').slice(0, 400)}`,
        issues: qa.issues,
        article,
        dryRun,
      })
    }
    done('contentqa')
    console.log('[Autopublish] [7/9] Content QA passed')

    if (dryRun) {
      console.log('[Autopublish] [DRY-RUN] Skipping publish + state save')
      const duration = Date.now() - startTime
      return {
        ok: true,
        dryRun: true,
        keyword: pick.keyword,
        title: article.title,
        wordCount: article.wordCount,
        seoScore: `${article.checklistScore}/${article.checklistTotal}`,
        imagesGenerated: imageCount,
        imagesTotal: imageTags.length,
        quotesUsed: verifiedQuotes.length,
        bestSellersMatched: bestSellers.length,
        linksChecked: linkResult.totalChecked,
        linkRepairs: linkResult.repairs.length,
        durationMs: duration,
        stageTimers,
      }
    }

    // Step 8: Shopify publish
    timer('publish')
    console.log('[Autopublish] [8/9] Publishing to Shopify...')
    const result = await publishToShopify({ ...article, featuredImageUrl })
    done('publish')
    console.log(`[Autopublish] [8/9] Published: ${result.liveUrl}`)

    // Update state
    if (pick.source === 'manual-queue') {
      popTopic()
      recordPublished(pick.keyword, pick.type, { title: article.title, liveUrl: result.liveUrl })
    } else {
      state.lastKeywordIndex = pick.index
      if (!state.publishedKeywords) state.publishedKeywords = []
      state.publishedKeywords.push(pick.keyword)
    }

    const duration = Date.now() - startTime
    const runRecord = {
      keyword: pick.keyword,
      articleType: pick.type,
      topicSource: pick.source,
      title: article.title,
      handle: article.handle,
      wordCount: article.wordCount,
      seoScore: `${article.checklistScore}/${article.checklistTotal}`,
      imagesGenerated: imageCount,
      imagesTotal: imageTags.length,
      featuredImage: !!featuredImageUrl,
      quotesUsed: verifiedQuotes.length,
      bestSellersMatched: bestSellers.length,
      linksChecked: linkResult.totalChecked,
      linkRepairs: linkResult.repairs.length,
      liveUrl: result.liveUrl,
      shopifyId: result.shopifyId,
      stageTimers,
      durationMs: duration,
      publishedAt: new Date().toISOString(),
      status: 'success',
    }

    if (!state.runs) state.runs = []
    state.runs.unshift(runRecord)
    state.runs = state.runs.slice(0, 60)
    saveState(state)

    try {
      let history = []
      if (existsSync(HISTORY_FILE)) history = JSON.parse(readFileSync(HISTORY_FILE, 'utf-8'))
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
      console.warn('[Autopublish] History save failed:', e.message)
    }

    // Step 9: Telegram (only on success if opted in; always on failure)
    await notifySuccess(article, result.liveUrl, {
      imageCount,
      quoteCount: verifiedQuotes.length,
      linksChecked: linkResult.totalChecked,
      linkRepairs: linkResult.repairs.length,
      bestSellerCount: bestSellers.length,
      durationMs: duration,
    })

    console.log('[Autopublish] ═══════════════════════════════════════')
    console.log(`[Autopublish] Pipeline complete in ${Math.round(duration / 1000)}s`)
    return { ok: true, ...runRecord }

  } catch (err) {
    return handleFailure({
      startTime, state, pick, stage: 'exception',
      reason: err.message,
      stack: err.stack,
      dryRun,
    })
  }
}

function blockedPreflight(reason) {
  console.error(`[Autopublish] BLOCKED: ${reason}`)
  notifyFailure('preflight', '—', reason).catch(() => {})
  return { ok: false, error: reason }
}

function handleFailure({ startTime, state, pick, stage, reason, issues = [], article, stack, dryRun }) {
  const duration = Date.now() - startTime
  console.error(`[Autopublish] ❌ BLOCKED at ${stage}: ${reason}`)

  const record = {
    keyword: pick.keyword,
    articleType: pick.type,
    topicSource: pick.source,
    stage,
    reason,
    issues,
    stack: stack?.split('\n').slice(0, 6).join('\n'),
    durationMs: duration,
    title: article?.title || null,
    draft: article?.body_html || null,
  }

  recordFailure(record)

  if (!state.runs) state.runs = []
  state.runs.unshift({ ...record, status: 'failed', publishedAt: new Date().toISOString() })
  state.runs = state.runs.slice(0, 60)
  saveState(state)

  notifyFailure(stage, pick.keyword, reason,
    issues?.length ? `\nIssues:\n- ${issues.slice(0, 5).map(i => typeof i === 'string' ? i : JSON.stringify(i)).join('\n- ')}` : '',
  ).catch(() => {})

  return { ok: false, stage, reason, issues, durationMs: duration, dryRun: !!dryRun }
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
  console.log('[Autopublish Cron] Scheduler active — daily at 6am AEST')
  const schedule = () => {
    const ms = msUntilNextUTC(20, 0) // 20:00 UTC = 06:00 AEST
    const next = new Date(Date.now() + ms)
    console.log(`[Autopublish Cron] Next run: ${next.toLocaleString('en-AU', { timeZone: 'Australia/Brisbane' })} AEST`)
    setTimeout(async () => {
      try { await runAutopublish() }
      catch (e) { console.error('[Autopublish Cron] Unhandled:', e.message) }
      schedule()
    }, ms)
  }
  schedule()
}

// ── Status for API ───────────────────────────────────────────

export function getAutopublishStatus() {
  const state = loadState()
  const manualNext = peekTopic()
  const nextFromPool = pickFromPool({ ...state })
  const nextTopic = manualNext
    ? { keyword: manualNext.keyword, type: manualNext.articleType, source: 'manual-queue' }
    : { keyword: nextFromPool.keyword, type: nextFromPool.type, source: 'pool' }

  return {
    active,
    next: nextTopic,
    totalKeywords: KEYWORD_POOL.length,
    publishedCount: (state.publishedKeywords || []).length,
    remainingCount: KEYWORD_POOL.length - (state.publishedKeywords || []).length,
    recentRuns: (state.runs || []).slice(0, 10),
    lastRun: (state.runs || [])[0] || null,
  }
}
