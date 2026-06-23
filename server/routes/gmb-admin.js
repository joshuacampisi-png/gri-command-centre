/**
 * /api/gmb/* — GMB Auto-Poster admin API for the Command Centre tab.
 *
 * Mount with app.use('/api/gmb', gmbAdminRoutes) in server/index.js
 *
 * Admin-only — assumes the caller has already passed the dashboard auth gate
 * (do NOT add any of these routes to PUBLIC_PREFIXES).
 *
 * Surface:
 *   GET  /status        - queue + state + lastPost + lastFailure + descriptionStats + config (redacted) + authValid
 *   POST /post-now      - trigger one immediate post (real, headless)
 *   POST /dry-run       - same flow, dryRun:true (no browser launched)
 *   POST /config        - replace gmb-config.json (atomic, validated)
 *   GET  /posts         - paginated posts log ?limit=50&offset=0
 *   POST /skip          - mark { filename } as skipped (foo.png -> foo.png.skip)
 *   GET  /descriptions  - full description pool
 *   POST /descriptions  - replace pool with new array (atomic, validated)
 *
 * All writes are atomic (tmp file + rename) so a crashed write never leaves a
 * half-formed config or pool on disk.
 */

import { Router } from 'express'
import { existsSync, readFileSync, writeFileSync, renameSync, statSync } from 'fs'
import { join, basename } from 'path'
import { dataFile } from '../lib/data-dir.js'
import { postToGmb } from '../lib/gmb-poster.js'
import {
  getNextImage,
  markPosted,
  getCategoryFromFilename,
  getQueueStats,
} from '../lib/gmb-queue.js'
import {
  readState,
  logPost,
  logFailure,
  consecutiveFailures,
  getStats,
} from '../lib/gmb-state.js'
import { pickDescription, getDescriptionStats } from '../lib/gmb-descriptions.js'
import { buildAiPromptPreview } from '../lib/gmb-ai-describer.js'
import { isOpenAIConfigured } from '../lib/openai-client.js'
import { generateAiPreview, generateGmbAiPost } from '../lib/gmb-fal-generator.js'
import { hasFalConfig } from '../lib/fal.js'

const router = Router()

// Allowed values for config.descriptionMode. 'static' keeps the existing
// 30-variant pool; 'ai-openai' routes each post through GPT-4o vision;
// 'ai-fal-generated' generates both the image and the description copy via
// FAL Nano Banana Pro + Claude (see gmb-fal-generator.js).
const ALLOWED_DESCRIPTION_MODES = ['static', 'ai-openai', 'ai-fal-generated']

// Substring stamped onto post.generatedBy when the post was produced through
// the FAL pipeline — used to attribute cost in /status.aiMode.aiCostLast30Days.
const FAL_GENERATED_BY_TAG = 'fal-nano-banana-pro'

const CONFIG_PATH = dataFile('gmb-config.json')
const DESCRIPTIONS_PATH = dataFile('gmb-descriptions.json')
const AUTH_STATE_PATH = dataFile('gmb-auth.json')

// Playwright storage state expires after ~30 days of inactivity in our
// experience. Anything older than this triggers an authValid:false hint so
// the dashboard can prompt Josh to re-run scripts/gmb-login.js.
const AUTH_MAX_AGE_DAYS = 30

// Circuit-breaker thresholds — surfaced as `state` in /status so the UI can
// show a banner without having to do the math.
const CIRCUIT_DEGRADED_AT = 1
const CIRCUIT_OPEN_AT = 3

// ── helpers ────────────────────────────────────────────────────────────────

function atomicWriteJson(path, payload) {
  const tmp = `${path}.tmp`
  writeFileSync(tmp, JSON.stringify(payload, null, 2))
  renameSync(tmp, path)
}

function readConfig() {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'))
  } catch (e) {
    return null
  }
}

function readDescriptions() {
  try {
    const parsed = JSON.parse(readFileSync(DESCRIPTIONS_PATH, 'utf8'))
    return Array.isArray(parsed) ? parsed : []
  } catch (e) {
    return []
  }
}

/**
 * Validate the gmb-config.json shape before writing. We only require the
 * fields the poster + queue + cron actually read so additional bookkeeping
 * fields can be added without churning this validator.
 */
function validateConfigShape(cfg) {
  if (!cfg || typeof cfg !== 'object') return 'config must be an object'
  if (typeof cfg.queueFolder !== 'string' || !cfg.queueFolder.trim()) {
    return 'queueFolder must be a non-empty string'
  }
  if (!Number.isInteger(cfg.scheduleHour) || cfg.scheduleHour < 0 || cfg.scheduleHour > 23) {
    return 'scheduleHour must be an integer 0-23'
  }
  if (!Number.isInteger(cfg.scheduleMinute) || cfg.scheduleMinute < 0 || cfg.scheduleMinute > 59) {
    return 'scheduleMinute must be an integer 0-59'
  }
  if (typeof cfg.timezone !== 'string' || !cfg.timezone.trim()) {
    return 'timezone must be a non-empty string'
  }
  if (typeof cfg.gbpSearchQuery !== 'string' || !cfg.gbpSearchQuery.trim()) {
    return 'gbpSearchQuery must be a non-empty string'
  }
  if (!Array.isArray(cfg.urlMapping) || cfg.urlMapping.length === 0) {
    return 'urlMapping must be a non-empty array'
  }
  for (const [i, m] of cfg.urlMapping.entries()) {
    if (!m || typeof m !== 'object') return `urlMapping[${i}] must be an object`
    if (typeof m.filenameMatch !== 'string' || !m.filenameMatch.trim()) {
      return `urlMapping[${i}].filenameMatch must be a non-empty string`
    }
    if (typeof m.url !== 'string' || !m.url.trim()) {
      return `urlMapping[${i}].url must be a non-empty string`
    }
    if (typeof m.button !== 'string' || !m.button.trim()) {
      return `urlMapping[${i}].button must be a non-empty string`
    }
  }
  const hasDefault = cfg.urlMapping.some(m => m.filenameMatch === 'default')
  if (!hasDefault) return 'urlMapping must contain a {filenameMatch:"default"} fallback'
  // descriptionMode is optional for backward-compat (treat missing as
  // 'static') but if present must be one of the allowed values.
  if (cfg.descriptionMode !== undefined) {
    if (typeof cfg.descriptionMode !== 'string' || !ALLOWED_DESCRIPTION_MODES.includes(cfg.descriptionMode)) {
      return `descriptionMode must be one of: ${ALLOWED_DESCRIPTION_MODES.join(', ')}`
    }
  }
  // aiCategoryRotation is the ordered list of category keys the FAL pipeline
  // walks through when descriptionMode === 'ai-fal-generated'. Optional;
  // empty/missing means the caller must always supply { category } explicitly.
  if (cfg.aiCategoryRotation !== undefined) {
    if (!Array.isArray(cfg.aiCategoryRotation)) {
      return 'aiCategoryRotation must be an array when provided'
    }
    for (const [i, c] of cfg.aiCategoryRotation.entries()) {
      if (typeof c !== 'string' || !c.trim()) {
        return `aiCategoryRotation[${i}] must be a non-empty string`
      }
    }
  }
  // aiPostWhenQueueEmpty toggles the cron's behaviour when the static image
  // queue runs dry — if true, the cron generates a fresh FAL post instead of
  // failing with QUEUE_EMPTY. Pure boolean.
  if (cfg.aiPostWhenQueueEmpty !== undefined && typeof cfg.aiPostWhenQueueEmpty !== 'boolean') {
    return 'aiPostWhenQueueEmpty must be a boolean when provided'
  }
  return null
}

/**
 * Resolve which category the next AI post should target. Walks the
 * aiCategoryRotation list in order using the existing post count modulo the
 * rotation length, so the rotation is deterministic and survives restarts
 * (state is derived from logPost history, not in-memory counters).
 */
function pickNextAiCategory(cfg, posts) {
  const rotation = Array.isArray(cfg?.aiCategoryRotation) ? cfg.aiCategoryRotation : []
  if (!rotation.length) return null
  const n = Array.isArray(posts) ? posts.length : 0
  return rotation[n % rotation.length]
}

/**
 * Look up the urlMapping entry for a category key. Falls back to the
 * {filenameMatch:"default"} row (which validateConfigShape guarantees exists)
 * so generateAiPreview / generateGmbAiPost always get a populated urlInfo.
 */
function urlInfoForCategory(cfg, category) {
  const map = Array.isArray(cfg?.urlMapping) ? cfg.urlMapping : []
  const exact = map.find(m => m.filenameMatch === category)
  const fallback = map.find(m => m.filenameMatch === 'default')
  const chosen = exact || fallback
  if (!chosen) return null
  return { url: chosen.url, button: chosen.button }
}

/**
 * Sum costUsd from posts whose postedAt falls inside the last 30 days.
 * Posts predating the AI mode rollout have no costUsd field — those count
 * as 0. Returned with 6-decimal precision to match how openai-client.js
 * rounds individual call costs.
 */
function sumCostLast30Days(posts, generatedByFilter = null) {
  if (!Array.isArray(posts) || !posts.length) return 0
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
  let total = 0
  for (const p of posts) {
    const t = Date.parse(p?.postedAt) || 0
    if (t < cutoff) continue
    if (generatedByFilter && !String(p?.generatedBy || '').includes(generatedByFilter)) continue
    const c = Number(p?.costUsd)
    if (Number.isFinite(c) && c > 0) total += c
  }
  return Number(total.toFixed(6))
}

/**
 * Redact PII before returning config to the dashboard. The config file itself
 * stays unredacted on disk — this is purely for the API surface so the UI
 * doesn't echo email addresses back into screenshots / logs.
 */
function redactConfig(cfg) {
  if (!cfg) return null
  const out = { ...cfg }
  if (out.alertEmail) out.alertEmail = '[redacted]'
  if (out.googleAccount) out.googleAccount = '[redacted]'
  return out
}

/**
 * Validate the description pool before writing. Each entry needs a stable id
 * (so logPost can reference it) and a non-empty text body. Categories is
 * optional but must be an array of strings when present.
 */
function validateDescriptionsShape(pool) {
  if (!Array.isArray(pool)) return 'descriptions must be an array'
  const seenIds = new Set()
  for (const [i, d] of pool.entries()) {
    if (!d || typeof d !== 'object') return `descriptions[${i}] must be an object`
    if (typeof d.id !== 'string' || !d.id.trim()) {
      return `descriptions[${i}].id must be a non-empty string`
    }
    if (seenIds.has(d.id)) return `descriptions[${i}].id "${d.id}" is duplicated`
    seenIds.add(d.id)
    if (typeof d.text !== 'string' || !d.text.trim()) {
      return `descriptions[${i}].text must be a non-empty string`
    }
    if (d.categories !== undefined) {
      if (!Array.isArray(d.categories)) {
        return `descriptions[${i}].categories must be an array when provided`
      }
      for (const [j, c] of d.categories.entries()) {
        if (typeof c !== 'string' || !c.trim()) {
          return `descriptions[${i}].categories[${j}] must be a non-empty string`
        }
      }
    }
  }
  return null
}

/**
 * Derive the circuit state from consecutive failure count. Reported in
 * /status so the dashboard can render a banner without re-implementing the
 * threshold logic.
 */
function deriveState(failuresInRow) {
  if (failuresInRow >= CIRCUIT_OPEN_AT) return 'circuit_open'
  if (failuresInRow >= CIRCUIT_DEGRADED_AT) return 'degraded'
  return 'ok'
}

/**
 * Inspect the Playwright storage-state file. We can't actually exercise the
 * cookies from inside a route handler (that would mean launching a browser
 * on every status poll) — instead we surface presence + age and let the
 * caller treat "missing or stale" as a re-auth prompt.
 */
function inspectAuthState() {
  if (!existsSync(AUTH_STATE_PATH)) {
    return { valid: false, reason: 'auth_state_missing', path: AUTH_STATE_PATH }
  }
  let mtime = 0
  try {
    mtime = statSync(AUTH_STATE_PATH).mtimeMs
  } catch (e) {
    return { valid: false, reason: 'auth_state_unreadable', error: e.message }
  }
  const ageMs = Date.now() - mtime
  const ageDays = ageMs / (24 * 60 * 60 * 1000)
  if (ageDays > AUTH_MAX_AGE_DAYS) {
    return {
      valid: false,
      reason: 'auth_state_stale',
      ageDays: Math.round(ageDays * 10) / 10,
      lastRefreshedAt: new Date(mtime).toISOString(),
    }
  }
  return {
    valid: true,
    ageDays: Math.round(ageDays * 10) / 10,
    lastRefreshedAt: new Date(mtime).toISOString(),
  }
}

/**
 * Run one post (real or dry-run) end-to-end: pick image, match category,
 * pick description, fire the poster, then update state + queue on success.
 *
 * Shared between /post-now and /dry-run so a dry-run is guaranteed to
 * exercise the same selection logic the real run uses.
 */
async function runOnePost({ dryRun }) {
  const cfg = readConfig()
  if (!cfg) {
    const e = new Error('gmb-config.json is missing or unreadable')
    e.code = 'CONFIG_MISSING'
    throw e
  }
  const validationErr = validateConfigShape(cfg)
  if (validationErr) {
    const e = new Error(`gmb-config.json invalid: ${validationErr}`)
    e.code = 'CONFIG_INVALID'
    throw e
  }

  const image = getNextImage()
  if (!image) {
    const e = new Error('Queue is empty — drop an image into the queue folder')
    e.code = 'QUEUE_EMPTY'
    throw e
  }

  const mapping = getCategoryFromFilename(image.name, cfg.urlMapping)
  if (!mapping) {
    const e = new Error(`No URL mapping matched filename "${image.name}" and no default fallback`)
    e.code = 'NO_URL_MAPPING'
    throw e
  }

  // Category for description rotation is the filenameMatch token — keeps the
  // description pool and the URL mapping aligned without a second config.
  const description = pickDescription({ category: mapping.filenameMatch })
  if (!description) {
    const e = new Error(`No description available for category "${mapping.filenameMatch}" (and no default)`)
    e.code = 'NO_DESCRIPTION'
    throw e
  }

  const result = await postToGmb({
    imagePath: image.path,
    description: description.text,
    buttonType: mapping.button,
    buttonUrl: mapping.url,
    dryRun,
    headless: true,
  })

  // Dry-run never advances the queue or touches state — it's purely a
  // selection-pipeline smoke test.
  if (!dryRun) {
    try {
      logPost({
        image: image.name,
        descriptionId: description.id,
        buttonUrl: mapping.url,
        buttonType: mapping.button,
        postedAt: result.postedAt,
      })
    } catch (e) {
      console.error('[gmb-admin] logPost failed:', e.message)
    }
    try {
      markPosted(image.path)
    } catch (e) {
      console.error('[gmb-admin] markPosted failed:', e.message)
    }
  }

  return {
    image: image.name,
    descriptionId: description.id,
    category: mapping.filenameMatch,
    buttonType: mapping.button,
    buttonUrl: mapping.url,
    postedAt: result.postedAt,
    dryRun: !!result.dryRun,
  }
}

// ── routes ─────────────────────────────────────────────────────────────────

router.get('/status', (_req, res) => {
  try {
    const cfg = readConfig()
    const cfgValidationErr = cfg ? validateConfigShape(cfg) : 'gmb-config.json missing'

    let queue = null
    let queueErr = null
    try {
      queue = cfg && !cfgValidationErr ? getQueueStats() : null
    } catch (e) {
      queueErr = e.message
    }

    const stats = getStats()
    const failuresInRow = consecutiveFailures()
    const state = deriveState(failuresInRow)

    const { posts, failures } = readState()
    const lastPost = posts.length ? posts[posts.length - 1] : null
    const lastFailure = failures.length ? failures[failures.length - 1] : null

    const descriptionStats = getDescriptionStats()
    const auth = inspectAuthState()

    const aiMode = {
      configured: isOpenAIConfigured(),
      mode: (cfg && cfg.descriptionMode) || 'static',
      costLast30Days: sumCostLast30Days(posts),
      // FAL-pipeline-specific surface — separate from the legacy
      // OpenAI-describer fields above so the dashboard can render both
      // without conflating them.
      falConfigured: hasFalConfig(),
      claudeConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
      categoryRotation: (cfg && Array.isArray(cfg.aiCategoryRotation)) ? cfg.aiCategoryRotation : [],
      aiCostLast30Days: sumCostLast30Days(posts, FAL_GENERATED_BY_TAG),
      nextCategoryIfAi: pickNextAiCategory(cfg, posts),
    }

    res.json({
      ok: true,
      state,
      consecutiveFailures: failuresInRow,
      circuit: { degradedAt: CIRCUIT_DEGRADED_AT, openAt: CIRCUIT_OPEN_AT },
      queue,
      queueError: queueErr,
      stats,
      lastPost,
      lastFailure,
      descriptionStats,
      aiMode,
      config: redactConfig(cfg),
      configError: cfgValidationErr || null,
      authValid: auth.valid,
      auth,
      fetchedAt: new Date().toISOString(),
    })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

router.post('/post-now', async (_req, res) => {
  try {
    const result = await runOnePost({ dryRun: false })
    res.json({ ok: true, result })
  } catch (err) {
    // Log the failure into state so the circuit breaker sees it — but only
    // for real posts. Selection-pipeline errors (QUEUE_EMPTY etc.) still
    // count: an empty queue when Josh hit "Post now" IS a real failure
    // worth surfacing in the failure log.
    try {
      logFailure({
        image: err?.image || null,
        error: `${err.code || 'POST_FAILED'}: ${err.message}`,
        at: new Date().toISOString(),
      })
    } catch (e) {
      console.error('[gmb-admin] logFailure failed:', e.message)
    }
    res.status(500).json({ ok: false, code: err.code || 'POST_FAILED', error: err.message })
  }
})

router.post('/dry-run', async (_req, res) => {
  try {
    const result = await runOnePost({ dryRun: true })
    res.json({ ok: true, result })
  } catch (err) {
    // Dry-run failures don't trip the circuit breaker — they're explicitly
    // a "show me what would happen" probe, not a real post attempt.
    res.status(500).json({ ok: false, code: err.code || 'DRY_RUN_FAILED', error: err.message })
  }
})

router.post('/config', (req, res) => {
  try {
    const incoming = req.body
    const err = validateConfigShape(incoming)
    if (err) return res.status(400).json({ ok: false, error: err })

    // Guardrail: switching to ai-openai with no API key configured would
    // mean every cron run falls back to the static pool silently — block
    // the save so the dashboard surfaces the missing env var instead.
    if (incoming.descriptionMode === 'ai-openai' && !isOpenAIConfigured()) {
      return res.status(400).json({
        ok: false,
        error: 'descriptionMode "ai-openai" requires OPENAI_API_KEY in the server environment. Add it to .env (or Railway variables) and restart, then try again.',
      })
    }

    // Same guardrail for the FAL pipeline — without FAL_KEY the generator
    // throws on the first cron tick, so reject the save up front rather than
    // letting the misconfiguration land on disk.
    if (incoming.descriptionMode === 'ai-fal-generated' && !hasFalConfig()) {
      return res.status(400).json({
        ok: false,
        error: 'descriptionMode "ai-fal-generated" requires FAL_KEY in the server environment. Add it to .env (or Railway variables) and restart, then try again.',
      })
    }

    // Atomic write so a crash mid-save never leaves a half-formed config on
    // disk — the cron reads this file on every run.
    atomicWriteJson(CONFIG_PATH, incoming)

    res.json({ ok: true, config: redactConfig(incoming), savedAt: new Date().toISOString() })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

/**
 * POST /api/gmb/ai-preview — read-only AI preview.
 *
 * Two shapes, distinguished by the body:
 *
 *  1. { filename }            → legacy OpenAI describer preview. Resolves the
 *                               queued image, runs buildAiPromptPreview()
 *                               (grounded site fetch + GPT-4o prompt assembly)
 *                               and returns what WOULD be sent. Zero tokens.
 *
 *  2. { category? } (or {})   → FAL pipeline preview. Calls generateAiPreview()
 *                               from gmb-fal-generator.js to produce the hook,
 *                               description, and image prompt that the next
 *                               ai-fal-generated post would use. Zero FAL spend.
 *                               If category is omitted, picks the next entry
 *                               from cfg.aiCategoryRotation based on post count.
 */
router.post('/ai-preview', async (req, res) => {
  try {
    const body = req.body || {}
    const filename = body.filename || req.query.filename

    // ── Legacy OpenAI describer preview ────────────────────────────────
    if (typeof filename === 'string' && filename.trim()) {
      if (filename.includes('/') || filename.includes('\\') || filename.startsWith('.')) {
        return res.status(400).json({ ok: false, error: 'filename must be a plain image name in the queue folder' })
      }

      const cfg = readConfig()
      if (!cfg) {
        return res.status(500).json({ ok: false, error: 'gmb-config.json is missing or unreadable' })
      }
      if (!cfg.queueFolder) {
        return res.status(500).json({ ok: false, error: 'gmb-config.json missing queueFolder' })
      }

      const imagePath = join(cfg.queueFolder, basename(filename))
      if (!existsSync(imagePath)) {
        return res.status(404).json({ ok: false, error: `${filename} not found in queue folder` })
      }

      const mapping = getCategoryFromFilename(basename(filename), cfg.urlMapping)
      if (!mapping) {
        return res.status(400).json({ ok: false, error: `No URL mapping matched filename "${filename}" and no default fallback` })
      }

      const preview = await buildAiPromptPreview({
        imagePath,
        imageName: basename(filename),
        category: mapping.filenameMatch,
        buttonUrl: mapping.url,
      })

      return res.json({
        ok: true,
        filename: basename(filename),
        category: mapping.filenameMatch,
        buttonUrl: mapping.url,
        preview,
        apiCalled: false,
        fetchedAt: new Date().toISOString(),
      })
    }

    // ── FAL pipeline preview (no filename → driven by rotation) ────────
    const cfg = readConfig()
    if (!cfg) {
      return res.status(500).json({ ok: false, error: 'gmb-config.json is missing or unreadable' })
    }
    const cfgErr = validateConfigShape(cfg)
    if (cfgErr) {
      return res.status(500).json({ ok: false, error: `gmb-config.json invalid: ${cfgErr}` })
    }

    const { posts } = readState()
    const category = (typeof body.category === 'string' && body.category.trim())
      ? body.category.trim()
      : pickNextAiCategory(cfg, posts)

    if (!category) {
      return res.status(400).json({
        ok: false,
        error: 'category is required (none supplied and aiCategoryRotation is empty)',
      })
    }

    const urlInfo = urlInfoForCategory(cfg, category)
    if (!urlInfo) {
      return res.status(400).json({ ok: false, error: `No urlMapping entry for category "${category}" and no default fallback` })
    }

    const aiPreview = await generateAiPreview({ category, urlInfo })

    return res.json({
      ok: true,
      preview: {
        category,
        hookText: aiPreview.hookText,
        description: aiPreview.description,
        prompt: aiPreview.prompt,
        estimatedCostUsd: aiPreview.estimatedCostUsd,
        urlInfo,
      },
      apiCalled: false,
      fetchedAt: new Date().toISOString(),
    })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

/**
 * POST /api/gmb/ai-generate-now — REAL FAL call.
 *
 * Body: { category? } — omitted falls back to next from aiCategoryRotation.
 *
 * Spends ~$0.15 on FAL Nano Banana Pro + ~$0.003 on Claude. Saves the
 * generated PNG to data/gmb-ai-generated/ and returns its path. Does NOT
 * post the result to GBP — call /post-now (or a future ai-post-now) for
 * that. Gated on hasFalConfig() so a missing FAL_KEY 400s instead of
 * burning a queued request.
 */
router.post('/ai-generate-now', async (req, res) => {
  try {
    if (!hasFalConfig()) {
      return res.status(400).json({
        ok: false,
        error: 'FAL_KEY missing from server environment — add it to .env (or Railway variables) and restart',
      })
    }

    const cfg = readConfig()
    if (!cfg) {
      return res.status(500).json({ ok: false, error: 'gmb-config.json is missing or unreadable' })
    }
    const cfgErr = validateConfigShape(cfg)
    if (cfgErr) {
      return res.status(500).json({ ok: false, error: `gmb-config.json invalid: ${cfgErr}` })
    }

    const body = req.body || {}
    const { posts } = readState()
    const category = (typeof body.category === 'string' && body.category.trim())
      ? body.category.trim()
      : pickNextAiCategory(cfg, posts)

    if (!category) {
      return res.status(400).json({
        ok: false,
        error: 'category is required (none supplied and aiCategoryRotation is empty)',
      })
    }

    const urlInfo = urlInfoForCategory(cfg, category)
    if (!urlInfo) {
      return res.status(400).json({ ok: false, error: `No urlMapping entry for category "${category}" and no default fallback` })
    }

    const generated = await generateGmbAiPost({ category, urlInfo })

    res.json({
      ok: true,
      post: {
        imagePath: generated.imagePath,
        description: generated.description,
        costUsd: generated.costEstimateUsd,
        generatedBy: generated.generatedBy,
      },
      hookText: generated.hookText,
      prompt: generated.prompt,
      fallbackUsed: generated.fallbackUsed,
      category,
      urlInfo,
      generatedAt: new Date().toISOString(),
    })
  } catch (err) {
    res.status(err?.code === 'GMB_FAL_FAILED' ? 502 : 500).json({
      ok: false,
      code: err?.code || 'AI_GENERATE_FAILED',
      error: err.message,
    })
  }
})

router.get('/posts', (req, res) => {
  try {
    const limit = Math.max(1, Math.min(500, parseInt(req.query.limit, 10) || 50))
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0)

    const { posts } = readState()
    // Newest first — the log is appended chronologically so we reverse before
    // slicing. .slice() copies so the underlying array isn't mutated.
    const ordered = posts.slice().reverse()
    const page = ordered.slice(offset, offset + limit)

    res.json({
      ok: true,
      total: posts.length,
      limit,
      offset,
      posts: page,
      hasMore: offset + page.length < posts.length,
    })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

router.post('/skip', (req, res) => {
  try {
    const { filename } = req.body || {}
    if (typeof filename !== 'string' || !filename.trim()) {
      return res.status(400).json({ ok: false, error: 'filename is required' })
    }
    // Reject path traversal — basename() strips any directory component but
    // we belt-and-brace by rejecting separators outright.
    if (filename.includes('/') || filename.includes('\\') || filename.startsWith('.')) {
      return res.status(400).json({ ok: false, error: 'filename must be a plain image name in the queue folder' })
    }
    if (filename.endsWith('.skip')) {
      return res.status(400).json({ ok: false, error: 'filename is already marked as skipped' })
    }

    const cfg = readConfig()
    if (!cfg || !cfg.queueFolder) {
      return res.status(500).json({ ok: false, error: 'gmb-config.json missing queueFolder' })
    }

    const src = join(cfg.queueFolder, basename(filename))
    if (!existsSync(src)) {
      return res.status(404).json({ ok: false, error: `${filename} not found in queue folder` })
    }
    const dest = `${src}.skip`
    if (existsSync(dest)) {
      return res.status(409).json({ ok: false, error: `${filename}.skip already exists` })
    }
    renameSync(src, dest)

    res.json({ ok: true, filename, skippedTo: basename(dest) })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

router.get('/descriptions', (_req, res) => {
  try {
    const pool = readDescriptions()
    res.json({ ok: true, total: pool.length, descriptions: pool })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

router.post('/descriptions', (req, res) => {
  try {
    const incoming = req.body
    // Accept either a raw array or { descriptions: [...] } to make the API
    // friendly to both curl-with-array and dashboard-with-wrapper callers.
    const pool = Array.isArray(incoming) ? incoming : incoming?.descriptions
    const err = validateDescriptionsShape(pool)
    if (err) return res.status(400).json({ ok: false, error: err })

    atomicWriteJson(DESCRIPTIONS_PATH, pool)

    res.json({ ok: true, total: pool.length, savedAt: new Date().toISOString() })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

export default router
