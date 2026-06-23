// gmb-fal-generator.js
// Orchestrates Claude (for hook + description copy) + FAL Nano Banana Pro
// (for the image itself) into a complete daily GMB AI post.
//
// Two entry points:
//   generateGmbAiPost  — full pipeline, downloads image to disk, costs ~$0.15
//   generateAiPreview  — same copy generation but skips FAL spend; returns
//                        what *would* be sent so staff can dry-run.
//
// Safety:
//   - Claude failure  → falls back to HOOK_FALLBACKS + generic description
//   - FAL failure     → throws Error with code GMB_FAL_FAILED so the caller
//                       can drop back to the static pool + queue a regen.
//
// ES modules only.

import { readFileSync, writeFileSync } from 'fs'
import { generateImage } from './fal.js'
import { callClaude } from './claude-guard.js'
import {
  buildImagePrompt,
  buildClaudePromptForGmb,
  HOOK_FALLBACKS,
} from './gmb-prompt-templates.js'
import { dataFile, dataDir } from './data-dir.js'

// ─── Cost constants ─────────────────────────────────────────────────────────
const FAL_COST_PER_IMAGE = 0.15   // Nano Banana Pro flat per-image price
const CLAUDE_AVG_COST    = 0.003  // Sonnet 4.6 typical for prompt+description
const TOTAL_COST_ESTIMATE = FAL_COST_PER_IMAGE + CLAUDE_AVG_COST

const GENERATED_BY = 'fal-nano-banana-pro+claude'

// ─── Helpers ────────────────────────────────────────────────────────────────

function pickFallbackHook() {
  return HOOK_FALLBACKS[Math.floor(Math.random() * HOOK_FALLBACKS.length)]
}

function defaultDescription(category) {
  return [
    "Another beautiful reveal moment captured.",
    "Pink or blue, every story is worth celebrating.",
    "Gender Reveal Ideas — Australia's #1 gender reveal store, family-owned on the Gold Coast since 2010.",
    "#genderreveal #boyorgirl #pinkorblue #australianfamily #goldcoast"
  ].join(' ')
}

function safeSlug(text, maxLen = 20) {
  return String(text || 'post')
    .slice(0, maxLen)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'post'
}

/**
 * Pull the JSON body out of Claude's response, tolerating markdown fences.
 * Returns { hookText, description, imagePromptHint } on success, null on fail.
 */
function parseClaudeJson(response) {
  try {
    const text = response?.content?.[0]?.text || ''
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return null
    const parsed = JSON.parse(match[0])
    if (!parsed || typeof parsed !== 'object') return null
    return {
      hookText: typeof parsed.hookText === 'string' ? parsed.hookText.trim() : '',
      description: typeof parsed.description === 'string' ? parsed.description.trim() : '',
      imagePromptHint: typeof parsed.imagePromptHint === 'string' ? parsed.imagePromptHint.trim() : '',
    }
  } catch {
    return null
  }
}

/**
 * Step 1 — ask Claude for the hook + description (+ optional image style hint).
 * Wrapped in try/catch — never throws upstream. Returns fully-populated obj
 * with `fallbackUsed: true` if Claude was unavailable / unparseable.
 */
async function generateCopyViaClaude({ category, urlInfo, siteContext }) {
  try {
    const { system, user } = buildClaudePromptForGmb({ category, urlInfo, siteContext })
    const response = await callClaude({
      model: 'claude-sonnet-4-6',
      max_tokens: 1200,
      system,
      messages: [{ role: 'user', content: user }],
    }, 'gmb-fal-generator')

    const parsed = parseClaudeJson(response)
    if (!parsed || !parsed.hookText || !parsed.description) {
      console.warn('[GMB-FAL] Claude returned unparseable copy, using fallbacks')
      return {
        hookText: parsed?.hookText || pickFallbackHook(),
        description: parsed?.description || defaultDescription(category),
        imagePromptHint: parsed?.imagePromptHint || '',
        fallbackUsed: true,
      }
    }

    return { ...parsed, fallbackUsed: false }
  } catch (err) {
    console.warn(`[GMB-FAL] Claude copy generation failed: ${err.message}`)
    return {
      hookText: pickFallbackHook(),
      description: defaultDescription(category),
      imagePromptHint: '',
      fallbackUsed: true,
    }
  }
}

/**
 * Step 3+4 — call FAL, download the result locally.
 * On failure throws Error with .code = 'GMB_FAL_FAILED' so the caller
 * (gmb-poster) can fall back to the static pool.
 */
async function generateAndDownloadImage({ prompt, hookText }) {
  let falResult
  try {
    falResult = await generateImage({ prompt, aspectRatio: '1:1' })
  } catch (err) {
    const e = new Error(`FAL image generation failed: ${err.message}`)
    e.code = 'GMB_FAL_FAILED'
    e.cause = err
    throw e
  }

  // fal.js returns { imageUrl, requestId }. The spec described
  // result.images[0].url — handle either shape just in case the
  // contract changes upstream.
  const imageUrl =
    falResult?.imageUrl ||
    falResult?.images?.[0]?.url ||
    null

  if (!imageUrl) {
    const e = new Error('FAL returned no image URL')
    e.code = 'GMB_FAL_FAILED'
    throw e
  }

  // Generate timestamp at runtime — NOT a hardcoded literal.
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const slug = safeSlug(hookText, 20)
  const outDir = dataDir('gmb-ai-generated')
  const filename = `gmb-ai-${timestamp}-${slug}.png`
  const imagePath = `${outDir}/${filename}`

  try {
    const res = await fetch(imageUrl)
    if (!res.ok) throw new Error(`download HTTP ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    writeFileSync(imagePath, buf)
  } catch (err) {
    const e = new Error(`Failed to download FAL image: ${err.message}`)
    e.code = 'GMB_FAL_FAILED'
    e.cause = err
    throw e
  }

  return { imagePath, imageUrl }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Full pipeline: Claude copy → image prompt → FAL render → local download.
 *
 * @param {object} opts
 * @param {string} opts.category    — gmb-prompt-templates category key
 * @param {{url:string, button:string}} opts.urlInfo
 * @param {object|null} [opts.siteContext]
 * @returns {Promise<{
 *   imagePath: string,
 *   description: string,
 *   hookText: string,
 *   prompt: string,
 *   costEstimateUsd: number,
 *   generatedBy: string,
 *   fallbackUsed: boolean,
 * }>}
 *
 * Throws Error with .code = 'GMB_FAL_FAILED' if the FAL step fails — caller
 * is expected to fall back to the static image pool + queue a regen.
 */
export async function generateGmbAiPost({ category, urlInfo, siteContext = null }) {
  // Step 1 — copy via Claude (never throws; falls back internally)
  const copy = await generateCopyViaClaude({ category, urlInfo, siteContext })

  // Step 2 — assemble the image prompt (pure function, can't throw meaningfully
  // but wrap defensively anyway)
  let prompt
  try {
    prompt = buildImagePrompt({
      category,
      hookText: copy.hookText,
      styleHint: copy.imagePromptHint,
    })
  } catch (err) {
    console.warn(`[GMB-FAL] buildImagePrompt failed, using minimal prompt: ${err.message}`)
    prompt = buildImagePrompt({ category, hookText: copy.hookText })
  }

  // Steps 3 + 4 — FAL + download. Bubbles GMB_FAL_FAILED upward.
  const { imagePath } = await generateAndDownloadImage({
    prompt,
    hookText: copy.hookText,
  })

  // Step 5 — return the composed result
  return {
    imagePath,
    description: copy.description,
    hookText: copy.hookText,
    prompt,
    costEstimateUsd: TOTAL_COST_ESTIMATE,
    generatedBy: GENERATED_BY,
    fallbackUsed: copy.fallbackUsed,
  }
}

/**
 * Dry-run variant: runs Claude + builds the prompt, but does NOT call FAL.
 * Lets staff preview what would be generated without spending $0.15.
 *
 * @returns {Promise<{
 *   hookText: string,
 *   description: string,
 *   prompt: string,
 *   estimatedCostUsd: number,   // what the real run *would* cost
 *   willGenerate: string,
 * }>}
 */
export async function generateAiPreview({ category, urlInfo }) {
  const copy = await generateCopyViaClaude({ category, urlInfo, siteContext: null })

  let prompt
  try {
    prompt = buildImagePrompt({
      category,
      hookText: copy.hookText,
      styleHint: copy.imagePromptHint,
    })
  } catch {
    prompt = buildImagePrompt({ category, hookText: copy.hookText })
  }

  return {
    hookText: copy.hookText,
    description: copy.description,
    prompt,
    estimatedCostUsd: 0.16, // 0.15 FAL + ~0.01 Claude rounded up
    willGenerate: 'would-generate-via-fal',
  }
}
