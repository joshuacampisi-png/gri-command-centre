/**
 * ig-reply-bot/intent-classifier.js
 * Classifies whether a comment shows buying intent worth replying to.
 * Pre-filters cheap checks before calling Claude.
 */

import { callClaude } from '../claude-guard.js'

const SYSTEM_PROMPT = `You are a buying-intent classifier for an Australian gender reveal product brand.

A comment shows BUYING INTENT if it contains any of the following signals:
- Asking about price, cost, how much, shipping, delivery
- Asking where to buy or how to order
- Asking if something is available, in stock
- Tagging a friend with excitement (they want to share it)
- Asking about a specific product they saw
- Expressing they want or need this product
- Asking how it works or what is included

A comment does NOT show buying intent if it is:
- A generic compliment with no product interest
- A complaint or negative comment
- Spam or irrelevant
- An existing customer talking about a past purchase with no follow-up interest
- Gibberish or unclear

Reply ONLY with a JSON object (no markdown, no preamble):
{"intent":"buying","reason":"brief reason"}
or
{"intent":"skip","reason":"brief reason"}`

// Pre-filters that skip without calling Claude (saves budget)
function preFilter(text) {
  const trimmed = text.trim()

  // Too short
  if (trimmed.length < 4) {
    return { intent: 'skip', reason: 'Too short (< 4 chars)', prefiltered: true }
  }

  // Emoji-only
  // Match strings that are only emoji, skin tone modifiers, variation selectors, ZWJ, and whitespace
  const emojiOnly = /^[\p{Emoji_Presentation}\p{Emoji_Modifier_Base}\p{Emoji_Modifier}\p{Emoji_Component}\uFE0F\u200D\s]+$/u
  if (emojiOnly.test(trimmed)) {
    return { intent: 'skip', reason: 'Emoji-only comment', prefiltered: true }
  }

  // Tag-only (just @mentions)
  if (/^(@\w+[\s,]*)+$/.test(trimmed)) {
    // Friend tags WITH excitement actually show intent, but bare tags don't
    return null // Let Claude decide — friend tags can indicate interest
  }

  return null // Not prefiltered, needs Claude
}

export async function classifyIntent(commentText, postCaption = '') {
  // Try pre-filters first
  const filtered = preFilter(commentText)
  if (filtered) return filtered

  try {
    const response = await callClaude({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 256,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `Comment: "${commentText}"\n\nPost caption context: "${postCaption?.slice(0, 300) || 'N/A'}"` }]
    }, 'ig-reply-intent')

    const raw = response.content[0].text.trim()
    const cleaned = raw.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '')
    const result = JSON.parse(cleaned)
    return { intent: result.intent || 'skip', reason: result.reason || '', prefiltered: false }
  } catch (e) {
    console.error('[IG-Reply-Bot] Intent classification failed:', e.message)
    return { intent: 'skip', reason: `Classification error: ${e.message}`, prefiltered: false }
  }
}
