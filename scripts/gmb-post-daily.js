#!/usr/bin/env node
// Load .env when run standalone (Railway sets env vars natively so this is a no-op there)
import 'dotenv/config'
/**
 * gmb-post-daily.js — cron entry point for the GMB Auto-Poster Flywheel.
 *
 * Wiring (one daily run, invoked by cron at the time configured in
 * data/gmb-config.json):
 *   1. Load gmb-config.json (queue folder + urlMapping + alert email +
 *      descriptionMode + aiCategoryRotation + aiPostWhenQueueEmpty).
 *   2. Decide a "source" for today's post from the cross product of
 *      (queue state) × (config.descriptionMode):
 *
 *        queue has image + 'static'           → queue image + static pool description
 *        queue has image + 'ai-openai'        → queue image + OpenAI vision description
 *        queue has image + 'ai-fal-generated' → queue image + Claude description
 *                                               (image is real, but the COPY is
 *                                                generated via buildClaudePromptForGmb)
 *        queue empty    + 'ai-fal-generated' + aiPostWhenQueueEmpty
 *                                             → generateGmbAiPost() — pick the
 *                                               next category via posts-count
 *                                               modulo aiCategoryRotation, then
 *                                               FAL renders the image AND Claude
 *                                               writes the description.
 *        queue empty    + anything else       → log + exit 0 (existing behaviour)
 *
 *   3. postToGmb() — Playwright-driven post to the GBP listing.
 *   4. On success: markPosted() if the image came from the queue (AI-generated
 *      images live under data/gmb-ai-generated/ and are not in the queue
 *      folder, so there's nothing to "mark posted"). logPost() records
 *      generatedBy + costUsd + fallbackReason + sourceMode so the dashboard
 *      can tell AI posts apart from static ones, exit 0.
 *   5. On failure: logFailure(); if consecutiveFailures() > 1, fire a
 *      Telegram alert; exit 1.
 *
 * AI failure policy (per request):
 *   - 'ai-openai' description path keeps the existing soft-fall-back to the
 *     static pool — it's just a description swap and staff prefers a post
 *     landing over skipping.
 *   - 'ai-fal-generated' paths (both image + description) DO NOT fall back to
 *     stale static images. If Claude or FAL fail, we log the warning, write
 *     to the failures log, and exit 1 so cron skips the day. Posting a stale
 *     image after the operator opted into AI would silently misrepresent the
 *     account.
 *
 * Exit codes:
 *   0 — success OR (queue empty AND no AI fallback configured)
 *   1 — failure (logged + alert maybe fired) OR AI hard-failure that we
 *       intentionally did not paper over.
 *
 * Run: node scripts/gmb-post-daily.js
 */

import { readFileSync } from 'fs'
import { dataFile } from '../server/lib/data-dir.js'
import { getNextImage, getCategoryFromFilename, markPosted } from '../server/lib/gmb-queue.js'
import { pickDescription } from '../server/lib/gmb-descriptions.js'
import { generateAiDescription } from '../server/lib/gmb-ai-describer.js'
import { generateGmbAiPost } from '../server/lib/gmb-fal-generator.js'
import { buildClaudePromptForGmb, inferCategoryFromKeyword } from '../server/lib/gmb-prompt-templates.js'
import { callClaude } from '../server/lib/claude-guard.js'
import { postToGmb } from '../server/lib/gmb-poster.js'
import { logPost, logFailure, consecutiveFailures, readState } from '../server/lib/gmb-state.js'
import { pickTodaysTrend } from '../server/lib/gmb-trend-source.js'

const CONFIG_PATH = dataFile('gmb-config.json')

// Description-only Claude path used when the queue image is real but the
// operator wants AI-written copy (descriptionMode === 'ai-fal-generated' with
// a queued image). Pricing matches gmb-fal-generator.js so the dashboard
// numbers stay comparable.
const CLAUDE_DESC_COST_ESTIMATE = 0.003
const CLAUDE_DESC_GENERATED_BY  = 'claude-sonnet-4-6'

/**
 * Send a Telegram alert when consecutive failures cross the threshold.
 * Mirrors the pattern in server/lib/hire-mailer.js#telegramFallback so we
 * stay consistent with the rest of the Command Centre's alerting.
 *
 * Silently no-ops if TELEGRAM_BOT_TOKEN or TELEGRAM_JOSH_CHAT_ID are unset
 * — alerting shouldn't crash the cron.
 */
async function telegramFallback({ image, error, failures }) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_JOSH_CHAT_ID
  if (!token || !chatId) {
    console.warn('[gmb-post-daily] Telegram not configured — skipping alert')
    return
  }

  const msg =
    `⚠️ GMB AUTO-POST FAILED (${failures} in a row)\n\n` +
    `Image: ${image || '(none)'}\n` +
    `Error: ${error}\n\n` +
    `Check the queue + auth state. May need to re-run scripts/gmb-login.js.`

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: msg }),
    })
  } catch (e) {
    console.error('[gmb-post-daily] Telegram fallback failed:', e?.message || e)
  }
}

function loadConfig() {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'))
  } catch (e) {
    throw new Error(`Cannot read ${CONFIG_PATH}: ${e.message}`)
  }
}

/**
 * Pull a JSON object out of a Claude response, tolerating ```json fences and
 * surrounding prose. Returns the parsed object or null. Mirrors the helper in
 * gmb-fal-generator.js so the two code paths behave the same.
 */
function parseClaudeJson(response) {
  try {
    const text = response?.content?.[0]?.text || ''
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return null
    const parsed = JSON.parse(match[0])
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

/**
 * Description-only AI path: the image already exists (it came from the queue)
 * but the operator asked for AI-written copy via descriptionMode === 'ai-fal-generated'.
 *
 * Calls Claude with the same buildClaudePromptForGmb prompt the FAL pipeline
 * uses, then extracts only the `description` field — we ignore hookText and
 * imagePromptHint because there's no image to render.
 *
 * Throws on Claude failure / unparseable / empty description. The caller is
 * responsible for treating that as a hard failure (no static fallback for
 * the ai-fal-generated mode, per spec).
 */
async function generateClaudeDescriptionForQueueImage({ category, mapping }) {
  const urlInfo = { url: mapping.url, button: mapping.button }
  const { system, user } = buildClaudePromptForGmb({ category, urlInfo, siteContext: null })

  const response = await callClaude(
    {
      model: 'claude-sonnet-4-6',
      max_tokens: 1200,
      system,
      messages: [{ role: 'user', content: user }],
    },
    'gmb-post-daily/queue-image-claude-desc'
  )

  const parsed = parseClaudeJson(response)
  const description = parsed && typeof parsed.description === 'string' ? parsed.description.trim() : ''
  if (!description) {
    const err = new Error('Claude returned empty or unparseable description for queue image')
    err.code = 'GMB_CLAUDE_DESC_EMPTY'
    throw err
  }
  return { description }
}

/**
 * Pick the next category from config.aiCategoryRotation using the count of
 * historical posts modulo the rotation length, so the rotation advances by
 * exactly one each day regardless of which mode produced previous posts.
 *
 * Falls back to 'default' if the rotation is missing/empty so we never crash
 * here.
 */
function pickNextRotationCategory(config) {
  const rotation = Array.isArray(config.aiCategoryRotation) ? config.aiCategoryRotation : []
  if (rotation.length === 0) return 'default'
  let postsCount = 0
  try {
    const state = readState()
    postsCount = Array.isArray(state.posts) ? state.posts.length : 0
  } catch {
    // readState already swallows errors, but guard anyway
    postsCount = 0
  }
  return rotation[postsCount % rotation.length]
}

/**
 * Build the mapping entry for a fully-AI post when the queue is empty. We
 * synthesize a pseudo-filename from the category so getCategoryFromFilename
 * can re-use the same urlMapping table operators already maintain — no
 * separate "AI URL mapping" to keep in sync.
 */
function resolveMappingForCategory(category, urlMapping) {
  const synthetic = `${category}-ai-generated.png`
  return getCategoryFromFilename(synthetic, urlMapping)
}

/**
 * Resolve description for the EXISTING-IMAGE flows ('static' and 'ai-openai'
 * when a queue image exists). The new 'ai-fal-generated'-with-queue-image
 * path is handled inline in main() because it has different failure semantics
 * (hard fail, no static fallback).
 *
 * Returns:
 *   {
 *     text:           string
 *     descriptionId:  string
 *     generatedBy:    'static-pool' | 'openai-gpt-4o'
 *     costUsd:        number
 *     fallbackReason: string|null
 *   }
 * or null if no description is available (caller treats as failure).
 */
async function resolveExistingImageDescription({ mode, category, image, mapping, urlMapping }) {
  if (mode === 'ai-openai') {
    try {
      // Use the describer's documented signature: { imagePath, imageFilename, urlMapping }
      const ai = await generateAiDescription({
        imagePath: image.path,
        imageFilename: image.name,
        urlMapping,
      })
      if (!ai || typeof ai.text !== 'string' || !ai.text.trim()) {
        throw new Error('generateAiDescription returned empty text')
      }
      return {
        text: ai.text,
        descriptionId: ai.model || ai.generatedBy || 'openai-gpt-4o',
        generatedBy: ai.generatedBy || 'openai-gpt-4o',
        costUsd: Number(ai.costUsd) || 0,
        fallbackReason: null,
      }
    } catch (aiErr) {
      const reason = aiErr?.message || String(aiErr)
      console.warn(`[gmb-post-daily] AI (OpenAI) description failed — falling back to static pool: ${reason}`)
      const fallback = pickDescription({ category })
      if (!fallback) return null
      return {
        text: fallback.text,
        descriptionId: fallback.id,
        generatedBy: 'static-pool',
        costUsd: 0,
        fallbackReason: reason,
      }
    }
  }

  // 'static' (default) — preserves the original behaviour exactly.
  const picked = pickDescription({ category })
  if (!picked) return null
  return {
    text: picked.text,
    descriptionId: picked.id,
    generatedBy: 'static-pool',
    costUsd: 0,
    fallbackReason: null,
  }
}

async function main() {
  const startedAt = new Date().toISOString()
  console.log(`[gmb-post-daily] Starting ${startedAt}`)

  const config = loadConfig()
  const mode = config.descriptionMode || 'static'
  const aiPostWhenQueueEmpty = Boolean(config.aiPostWhenQueueEmpty)
  console.log(`[gmb-post-daily] Description mode: ${mode}`)

  const image = getNextImage()

  // ─── Branch A: queue empty ───────────────────────────────────────────────
  if (!image) {
    // Only the ai-fal-generated mode + opt-in flag can rescue an empty queue.
    if (mode !== 'ai-fal-generated' || !aiPostWhenQueueEmpty) {
      console.log('[gmb-post-daily] Queue is empty — nothing to post. Exiting 0.')
      return 0
    }

    // Prefer a trending keyword for today's post so the GBP listing tracks
    // live search demand. Falls back to the existing static rotation only if
    // the trend seed list is exhausted (rare).
    let trend = null
    try {
      trend = await pickTodaysTrend()
    } catch (trendErr) {
      console.warn(`[gmb-post-daily] pickTodaysTrend failed — falling back to static rotation: ${trendErr?.message || trendErr}`)
      trend = null
    }

    let category
    let trendingKeyword = null
    let keywordSource = 'static-rotation'
    let keywordMonthlySearches = null

    if (trend && trend.keyword) {
      trendingKeyword = trend.keyword
      keywordSource = trend.source || 'trend-source'
      keywordMonthlySearches =
        typeof trend.monthlySearches === 'number' ? trend.monthlySearches : null
      category = inferCategoryFromKeyword(trend.keyword) || pickNextRotationCategory(config)
      console.log(`[gmb-post-daily] Queue empty + ai-fal-generated mode → trending keyword "${trendingKeyword}" (source: ${keywordSource}, vol: ${keywordMonthlySearches ?? 'n/a'}) → category: ${category}`)
    } else {
      category = pickNextRotationCategory(config)
      console.log(`[gmb-post-daily] Queue empty + ai-fal-generated mode → no trend available, static rotation category: ${category}`)
    }

    const mapping = resolveMappingForCategory(category, config.urlMapping)
    if (!mapping) {
      const err = new Error(`No urlMapping match for AI-generated category "${category}" (and no default mapping)`)
      logFailure({ image: `ai-generated:${category}`, error: err.message, at: new Date().toISOString() })
      console.error('[gmb-post-daily]', err.message)
      return 1
    }

    let aiPost
    try {
      aiPost = await generateGmbAiPost({
        category,
        trendingKeyword,
        urlInfo: { url: mapping.url, button: mapping.button },
        siteContext: null,
      })
    } catch (aiErr) {
      const reason = aiErr?.message || String(aiErr)
      const at = new Date().toISOString()
      console.warn(`[gmb-post-daily] AI image generation failed — skipping today (no stale fallback): ${reason}`)
      logFailure({ image: `ai-generated:${category}`, error: `AI generation failed: ${reason}`, at })
      // Still apply the consecutive-failure alerting so silent FAL/Claude
      // outages don't eat a week of posts.
      const failures = consecutiveFailures()
      if (failures > 1) {
        await telegramFallback({ image: `ai-generated:${category}`, error: reason, failures })
      }
      return 1
    }

    if (!aiPost || !aiPost.imagePath || !aiPost.description) {
      const err = new Error('generateGmbAiPost returned an incomplete result')
      logFailure({ image: `ai-generated:${category}`, error: err.message, at: new Date().toISOString() })
      console.error('[gmb-post-daily]', err.message)
      return 1
    }

    console.log(`[gmb-post-daily] AI image: ${aiPost.imagePath}`)
    console.log(`[gmb-post-daily] AI cost: $${Number(aiPost.costEstimateUsd || 0).toFixed(6)}`)
    console.log(`[gmb-post-daily] Button: ${mapping.button} → ${mapping.url}`)

    try {
      const result = await postToGmb({
        imagePath: aiPost.imagePath,
        description: aiPost.description,
        buttonType: mapping.button,
        buttonUrl: mapping.url,
      })

      // No markPosted() here — the AI-generated image was never in the queue
      // folder; it already lives in data/gmb-ai-generated/.
      logPost({
        image: aiPost.imagePath,
        descriptionId: `fal-${category}`,
        buttonUrl: mapping.url,
        buttonType: mapping.button,
        postedAt: result.postedAt,
        generatedBy: aiPost.generatedBy,
        costUsd: Number(aiPost.costEstimateUsd) || 0,
        fallbackReason: aiPost.fallbackUsed ? 'claude-copy-fallback-used' : null,
        sourceMode: 'ai-fal-generated/queue-empty',
        category,
        trendingKeyword,
        keywordSource,
        keywordMonthlySearches,
      })

      const postedAboutMsg = trendingKeyword
        ? ` (posted about: ${trendingKeyword})`
        : ''
      console.log(`[gmb-post-daily] ✓ Posted AI image for "${category}"${postedAboutMsg} at ${result.postedAt}`)
      return 0
    } catch (err) {
      const at = new Date().toISOString()
      const errorMsg = err?.message || String(err)
      console.error('[gmb-post-daily] FAILED:', errorMsg)
      logFailure({ image: aiPost.imagePath, error: errorMsg, at })
      const failures = consecutiveFailures()
      console.error(`[gmb-post-daily] Consecutive failures: ${failures}`)
      if (failures > 1) {
        await telegramFallback({ image: aiPost.imagePath, error: errorMsg, failures })
      }
      return 1
    }
  }

  // ─── Branch B: queue has an image ────────────────────────────────────────
  console.log(`[gmb-post-daily] Next image: ${image.name}`)

  const mapping = getCategoryFromFilename(image.name, config.urlMapping)
  if (!mapping) {
    const err = new Error(`No urlMapping match (and no default) for ${image.name}`)
    logFailure({ image: image.name, error: err.message, at: new Date().toISOString() })
    console.error('[gmb-post-daily]', err.message)
    return 1
  }
  // Category for description rotation = the filenameMatch token. The
  // 'default' mapping yields the 'default' description pool.
  const category = mapping.filenameMatch

  // The new 'ai-fal-generated' mode with a real queue image: keep the image,
  // generate the description via Claude. HARD-FAIL on AI errors per spec —
  // we do NOT silently post a queue image with stale static copy when the
  // operator opted into AI.
  let description
  let sourceMode

  if (mode === 'ai-fal-generated') {
    sourceMode = 'ai-fal-generated/queue-image'
    try {
      const { description: aiText } = await generateClaudeDescriptionForQueueImage({ category, mapping })
      description = {
        text: aiText,
        descriptionId: `claude-${category}`,
        generatedBy: CLAUDE_DESC_GENERATED_BY,
        costUsd: CLAUDE_DESC_COST_ESTIMATE,
        fallbackReason: null,
      }
    } catch (aiErr) {
      const reason = aiErr?.message || String(aiErr)
      const at = new Date().toISOString()
      console.warn(`[gmb-post-daily] AI description failed for queue image — skipping (no stale fallback): ${reason}`)
      logFailure({ image: image.name, error: `AI description failed: ${reason}`, at })
      const failures = consecutiveFailures()
      if (failures > 1) {
        await telegramFallback({ image: image.name, error: reason, failures })
      }
      return 1
    }
  } else {
    sourceMode = mode === 'ai-openai' ? 'ai-openai/queue-image' : 'static/queue-image'
    description = await resolveExistingImageDescription({
      mode,
      category,
      image,
      mapping,
      urlMapping: config.urlMapping,
    })
    if (!description) {
      const err = new Error(`No description available for category "${category}"`)
      logFailure({ image: image.name, error: err.message, at: new Date().toISOString() })
      console.error('[gmb-post-daily]', err.message)
      return 1
    }
  }

  console.log(`[gmb-post-daily] Description: ${description.descriptionId} (via ${description.generatedBy})`)
  if (description.fallbackReason) {
    console.warn(`[gmb-post-daily] Fallback reason: ${description.fallbackReason}`)
  }
  if (description.costUsd > 0) {
    console.log(`[gmb-post-daily] Cost: $${description.costUsd.toFixed(6)}`)
  }
  console.log(`[gmb-post-daily] Button: ${mapping.button} → ${mapping.url}`)

  try {
    const result = await postToGmb({
      imagePath: image.path,
      description: description.text,
      buttonType: mapping.button,
      buttonUrl: mapping.url,
    })

    markPosted(image.path)
    logPost({
      image: image.name,
      descriptionId: description.descriptionId,
      buttonUrl: mapping.url,
      buttonType: mapping.button,
      postedAt: result.postedAt,
      generatedBy: description.generatedBy,
      costUsd: description.costUsd,
      fallbackReason: description.fallbackReason,
      sourceMode,
      category,
      trendingKeyword: null,
      keywordSource: 'queue-image',
      keywordMonthlySearches: null,
    })

    console.log(`[gmb-post-daily] ✓ Posted ${image.name} at ${result.postedAt}`)
    return 0
  } catch (err) {
    const at = new Date().toISOString()
    const errorMsg = err?.message || String(err)
    console.error('[gmb-post-daily] FAILED:', errorMsg)

    logFailure({ image: image.name, error: errorMsg, at })

    const failures = consecutiveFailures()
    console.error(`[gmb-post-daily] Consecutive failures: ${failures}`)

    if (failures > 1) {
      await telegramFallback({ image: image.name, error: errorMsg, failures })
    }

    return 1
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error('[gmb-post-daily] FATAL:', err?.message || err)
    process.exit(1)
  })
