/**
 * ig-reply-bot/tone-extractor.js
 * Sends scraped Instagram content to Claude to extract a structured voice profile.
 */

import { callClaude } from '../claude-guard.js'
import { scrapeOwnContent } from './tone-scraper.js'
import { saveToneProfile, loadToneProfile } from './store.js'

const SYSTEM_PROMPT = `You are a brand voice analyst. You will be given a collection of Instagram captions and comment replies from an Australian gender reveal product brand called Gender Reveal Ideas (genderrevealideas.com.au).

Your job is to extract a detailed, actionable tone-of-voice profile that can be used to write new Instagram comment replies that sound exactly like this brand.

Analyse the content and return ONLY a JSON object with this exact structure (no preamble, no markdown fences):

{
  "personality_traits": ["string"],
  "vocabulary_patterns": ["string"],
  "sentence_structure": "string",
  "emoji_usage": "string",
  "australian_expressions": ["string"],
  "sales_approach": "string",
  "what_to_avoid": ["string"],
  "example_reply_templates": ["string"]
}

The example_reply_templates should contain 5 example comment replies in this brand's exact voice, covering different scenarios (pricing question, shipping question, friend tag, product interest, general excitement).`

export async function extractToneProfile() {
  console.log('[IG-Reply-Bot] Starting tone extraction...')

  const { captions, ownReplies, postCount } = await scrapeOwnContent(50)

  if (captions.length === 0) {
    console.warn('[IG-Reply-Bot] No captions scraped, cannot extract tone')
    return null
  }

  const userMessage = `Here are ${captions.length} recent Instagram captions from Gender Reveal Ideas:\n\n` +
    captions.map((c, i) => `--- Caption ${i + 1} ---\n${c}`).join('\n\n') +
    (ownReplies.length > 0
      ? `\n\n--- The brand's own comment replies (${ownReplies.length} total) ---\n` +
        ownReplies.map((r, i) => `${i + 1}. ${r}`).join('\n')
      : '')

  try {
    const response = await callClaude({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }]
    }, 'ig-reply-tone')

    const raw = response.content[0].text.trim()
    // Strip markdown fences if present
    const cleaned = raw.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '')
    const profile = JSON.parse(cleaned)

    saveToneProfile(profile, postCount)
    console.log(`[IG-Reply-Bot] Tone profile extracted from ${postCount} posts, ${captions.length} captions`)
    return profile
  } catch (e) {
    console.error('[IG-Reply-Bot] Tone extraction failed:', e.message)
    // Return existing profile if available
    const existing = loadToneProfile()
    if (existing) {
      console.log('[IG-Reply-Bot] Falling back to existing tone profile')
      return existing.profile
    }
    return null
  }
}
