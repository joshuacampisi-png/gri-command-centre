/**
 * ig-reply-bot/reply-generator.js
 * Generates on-brand Instagram comment replies using the stored tone profile.
 */

import { callClaude } from '../claude-guard.js'
import { loadToneProfile } from './store.js'
import { buildKnowledgeContext, SITE_URL, YOUTUBE_URL } from './website-knowledge.js'

function buildSystemPrompt(profile, knowledgeContext) {
  return `You are the social media manager for Gender Reveal Ideas (genderrevealideas.com.au), an Australian online store selling gender reveal products including confetti cannons, smoke bombs, balloon boxes, and reveal kits.

Your job is to reply to an Instagram comment in the brand's exact voice. Here is the brand voice profile you must follow:

Personality traits: ${profile.personality_traits?.join(', ') || 'warm, friendly, excited'}
Vocabulary patterns: ${profile.vocabulary_patterns?.join(', ') || 'casual, conversational'}
Sentence structure: ${profile.sentence_structure || 'Short and punchy'}
Emoji usage: ${profile.emoji_usage || 'Moderate, 1 to 2 per reply'}
Australian expressions: ${profile.australian_expressions?.join(', ') || 'None specified'}
Sales approach: ${profile.sales_approach || 'Soft, helpful, not pushy'}
What to avoid: ${profile.what_to_avoid?.join(', ') || 'Being robotic, using dashes, being corporate'}

Example replies in this brand's voice:
${(profile.example_reply_templates || []).map((t, i) => `${i + 1}. ${t}`).join('\n')}

PRODUCT & SHIPPING KNOWLEDGE (use this to answer questions accurately):
${knowledgeContext}

RULES:
- Keep replies under 200 characters (Instagram comment limit awareness)
- When someone asks about shipping, provide real delivery timeframes from the knowledge above
- When someone asks about products, include the real product name and price from the knowledge above
- When someone asks where to buy, direct them to ${SITE_URL} or say "link in bio"
- When someone asks how to use a product, for help, or wants a tutorial/video, direct them to the YouTube channel: ${YOUTUBE_URL}
- Always include a soft call to action pointing to the website or the link in bio
- Never use dashes in your reply
- Sound human, warm, and excited, not robotic or corporate
- Write in Australian English
- Do not make up products or prices. Only use prices from the knowledge above
- If the comment tags a friend, address both of them warmly
- End with 1 to 2 relevant emojis maximum

Reply ONLY with the comment reply text. No explanation, no quotes around it.`
}

const FALLBACK_PROFILE = {
  personality_traits: ['warm', 'excitable', 'Aussie casual', 'friendly'],
  vocabulary_patterns: ['gorgeous', 'amazing', 'love it', 'so exciting'],
  sentence_structure: 'Short, punchy sentences with exclamation marks',
  emoji_usage: '1 to 2 emojis at the end of replies',
  australian_expressions: [],
  sales_approach: 'Soft sell, point to link in bio or website',
  what_to_avoid: ['dashes', 'corporate language', 'pushy sales', 'long paragraphs'],
  example_reply_templates: [
    'So exciting! Check out our full range at the link in bio 🎉',
    'We ship Australia wide! Head to genderrevealideas.com.au for all the details 💙💗',
    'Love that you both love it! Everything is on our website 🥰'
  ]
}

export async function generateReply(commentText, commentUsername, postCaption = '') {
  const toneData = loadToneProfile()
  const profile = toneData?.profile || FALLBACK_PROFILE

  const knowledgeContext = buildKnowledgeContext(commentText)
  const systemPrompt = buildSystemPrompt(profile, knowledgeContext)
  const userMessage = `Comment by @${commentUsername}: "${commentText}"\n\nPost caption: "${postCaption?.slice(0, 300) || 'N/A'}"`

  try {
    const response = await callClaude({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 512,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }]
    }, 'ig-reply-generate')

    let replyText = response.content[0].text.trim()
    // Strip any surrounding quotes Claude might add
    if ((replyText.startsWith('"') && replyText.endsWith('"')) ||
        (replyText.startsWith("'") && replyText.endsWith("'"))) {
      replyText = replyText.slice(1, -1)
    }

    return { replyText }
  } catch (e) {
    console.error('[IG-Reply-Bot] Reply generation failed:', e.message)
    throw e
  }
}
