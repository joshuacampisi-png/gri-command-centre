// GMB AI Describer — orchestrates OpenAI vision + live site content into
// a grounded Google Business Profile post description.
//
// Strategy:
//   1. Pull the live page content (title / h1 / price / description / bullets)
//      from genderrevealideas.com.au for the URL this image will link to.
//   2. Build a system + user prompt that GROUNDS GPT-4o in that real copy
//      (no invented features, no invented prices).
//   3. Send the prompt plus the actual image to gpt-4o vision.
//   4. Return the final post text plus provenance (cost, model, URL grounded
//      on, whether live site context was available).
//
// On any failure (key missing, OpenAI down, network) we throw a labelled
// error so the caller can fall back to the static description pool in
// gmb-descriptions.js.

import { readFileSync } from 'fs'
import { callOpenAIVision } from './openai-client.js'
import { fetchContextForImage } from './gmb-site-context.js'
import { dataFile } from './data-dir.js'

const BRAND_NAME = 'Gender Reveal Ideas'
const BRAND_TAGLINE = "Australia's #1 gender reveal store"
const BRAND_LOCATIONS = 'Gold Coast & Sydney'
const MAX_CHARS = 1500
const KEYWORD_HEAD_CHARS = 100

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

function formatBullets(bullets) {
  if (!Array.isArray(bullets) || bullets.length === 0) return '(none provided)'
  return bullets
    .slice(0, 8)
    .map((b) => `- ${String(b).trim()}`)
    .join('\n')
}

function formatPageContent(pageContent) {
  if (!pageContent) return '(no live site content available — describe the image generically but stay on-brand)'

  const lines = []
  if (pageContent.title) lines.push(`Page title: ${pageContent.title}`)
  if (pageContent.h1) lines.push(`H1 heading: ${pageContent.h1}`)
  if (pageContent.productName) lines.push(`Product name: ${pageContent.productName}`)
  if (pageContent.productPrice) {
    const currency = pageContent.priceCurrency ? ` ${pageContent.priceCurrency}` : ''
    lines.push(`Price: ${pageContent.productPrice}${currency}`)
  }
  if (pageContent.productDescription) {
    lines.push(`Product description: ${pageContent.productDescription}`)
  }
  if (pageContent.metaDescription) {
    lines.push(`Meta description: ${pageContent.metaDescription}`)
  }
  lines.push(`Key bullets / features:\n${formatBullets(pageContent.bullets)}`)
  return lines.join('\n')
}

function buildSystemPrompt() {
  return [
    `You are the social media copywriter for ${BRAND_NAME} (${BRAND_TAGLINE}, based in ${BRAND_LOCATIONS}).`,
    `You write Google Business Profile post descriptions that rank in local search and convert browsers into buyers.`,
    `Rules:`,
    `- Write in Australian English. Use "colour" not "color", "organised" not "organized", "favourite" not "favorite", "centre" not "center".`,
    `- Ground EVERY product claim in the live site content provided. Do NOT invent features, prices, sizes, quantities, ingredients, or shipping promises.`,
    `- If the live site content is missing a fact, do not fabricate it — describe what is visible in the image instead.`,
    `- Lead with the primary keyword in the first ${KEYWORD_HEAD_CHARS} characters (Google indexes that window for GMB posts).`,
    `- Keep the whole post under ${MAX_CHARS} characters.`,
    `- Structure: 2-4 short paragraphs separated by ONE blank line. No bullet lists, no markdown headings, no emoji spam.`,
    `- End with 8-12 hashtags on the final line, space-separated. Mix brand + Australian-relevant tags (#genderreveal #genderrevealideas #boyorgirl #australia #sydney #goldcoast plus product-specific ones).`,
    `- Return ONLY the post description text. No preamble, no "Here is the post:", no quotation marks wrapping the whole thing, no explanation.`
  ].join('\n')
}

function buildUserPrompt({ imageFilename, siteContext }) {
  const url = siteContext?.url || '(no destination URL — write a generic on-brand post)'
  const category = siteContext?.category || 'unknown'
  const pageBlock = formatPageContent(siteContext?.pageContent)

  return [
    `Write a Google Business Profile post description for the attached image.`,
    ``,
    `Image filename: ${imageFilename || '(unknown)'}`,
    `Inferred product category: ${category}`,
    `Destination URL (where the "Learn more" button will send people): ${url}`,
    ``,
    `--- LIVE SITE CONTENT FROM ${url} ---`,
    `Use ONLY this product information from genderrevealideas.com.au. Do not invent features or prices.`,
    ``,
    pageBlock,
    `--- END SITE CONTENT ---`,
    ``,
    `Now look carefully at the attached image. Describe what makes THIS specific image compelling`,
    `(the moment, the colours visible, the energy, who would love it) and weave that into a post`,
    `that uses the live site facts above. Lead with the primary keyword in the first ${KEYWORD_HEAD_CHARS} characters.`,
    `End with 8-12 hashtags on the final line.`,
    ``,
    `Return ONLY the description text.`
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build the prompt that WOULD be sent to GPT-4o, without calling the API.
 * Used by the dashboard's dry-run preview.
 */
export async function buildAiPromptPreview(imageFilename, urlMapping) {
  const siteContext = await fetchContextForImage({ imageFilename, urlMapping })
  const systemPrompt = buildSystemPrompt()
  const userPrompt = buildUserPrompt({ imageFilename, siteContext })

  return {
    systemPrompt,
    userPrompt,
    siteContext,
    siteContextUsed: Boolean(siteContext?.pageContent),
    urlGrounding: siteContext?.url || null,
    model: 'gpt-4o'
  }
}

/**
 * Generate a final GMB post description using OpenAI vision grounded in
 * the live site content.
 *
 * @param {object} args
 * @param {string} args.imagePath     — absolute path to the image file on disk
 * @param {string} args.imageFilename — original filename (used to infer category + for the prompt)
 * @param {object} args.urlMapping    — category → URL mapping (from gmb-state)
 * @returns {Promise<{
 *   text: string,
 *   generatedBy: 'openai-gpt-4o',
 *   costUsd: number|null,
 *   siteContextUsed: boolean,
 *   urlGrounding: string|null,
 *   model: string
 * }>}
 */
export async function generateAiDescription({ imagePath, imageFilename, urlMapping }) {
  if (!imagePath) {
    const err = new Error('generateAiDescription: imagePath is required')
    err.code = 'GMB_AI_BAD_INPUT'
    throw err
  }

  // Step 1 — pull live site context so the model is grounded in real copy
  let siteContext
  try {
    siteContext = await fetchContextForImage({ imageFilename, urlMapping })
  } catch (err) {
    // Site fetch failed entirely — still let the caller decide whether to fall back.
    const wrapped = new Error(`GMB_AI_SITE_CONTEXT_FAILED: ${err.message}`)
    wrapped.code = 'GMB_AI_SITE_CONTEXT_FAILED'
    wrapped.cause = err
    throw wrapped
  }

  // Step 2 — build prompts
  const systemPrompt = buildSystemPrompt()
  const userPrompt = buildUserPrompt({ imageFilename, siteContext })
  const combinedPrompt = `${systemPrompt}\n\n${userPrompt}`

  // Step 3 — call OpenAI vision with the actual image bytes
  let response
  try {
    response = await callOpenAIVision({
      imagePath,
      prompt: combinedPrompt,
      model: 'gpt-4o',
      maxTokens: 800
    })
  } catch (err) {
    const message = err?.message || String(err)
    let code = 'GMB_AI_OPENAI_FAILED'
    if (/api key|not configured|OPENAI_API_KEY/i.test(message)) code = 'GMB_AI_OPENAI_KEY_MISSING'
    else if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network/i.test(message)) code = 'GMB_AI_OPENAI_NETWORK'
    else if (/failed to read image/i.test(message)) code = 'GMB_AI_IMAGE_READ_FAILED'

    const wrapped = new Error(`${code}: ${message}`)
    wrapped.code = code
    wrapped.cause = err
    throw wrapped
  }

  const text = String(response?.text || '').trim()
  if (!text) {
    const err = new Error('GMB_AI_EMPTY_RESPONSE: OpenAI returned no description text')
    err.code = 'GMB_AI_EMPTY_RESPONSE'
    throw err
  }

  // Step 4 — return result with provenance
  return {
    text,
    generatedBy: 'openai-gpt-4o',
    costUsd: response.costUsd ?? null,
    siteContextUsed: Boolean(siteContext?.pageContent),
    urlGrounding: siteContext?.url || null,
    model: response.model || 'gpt-4o'
  }
}

// Internal helpers exposed for tests / debug only
export const __internal = {
  buildSystemPrompt,
  buildUserPrompt,
  formatPageContent,
  formatBullets,
  MAX_CHARS,
  KEYWORD_HEAD_CHARS
}

// Note: `readFileSync` and `dataFile` are imported per the spec even though
// this module does not currently read from disk directly — image bytes are
// loaded inside callOpenAIVision, and site content comes from the network.
// Keeping the imports leaves the door open for a future on-disk prompt
// override file (e.g. dataFile('gmb/ai-prompt-overrides.json')) without a
// breaking change to the module surface.
void readFileSync
void dataFile
