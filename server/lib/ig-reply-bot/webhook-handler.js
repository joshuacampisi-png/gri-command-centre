/**
 * ig-reply-bot/webhook-handler.js
 * Orchestrates the full comment-reply pipeline.
 * Processes comments sequentially via promise chain to prevent JSON write conflicts.
 */

import { igAccountId, igGet } from '../instagram-publisher.js'
import { loadConfig, isReplied, markReplied, appendLog } from './store.js'
import { canReply, recordReply } from './rate-limiter.js'
import { classifyIntent } from './intent-classifier.js'
import { generateReply } from './reply-generator.js'
import { postReply } from './comment-replier.js'

// Sequential promise chain
let queue = Promise.resolve()

export function handleCommentWebhook(body) {
  queue = queue.then(() => _processWebhook(body)).catch(e => {
    console.error('[IG-Reply-Bot] Webhook queue error:', e.message)
  })
  // Don't return the queue — caller should not await
}

// Caption cache (per media ID, cleared each webhook batch)
const captionCache = new Map()

async function fetchCaption(mediaId) {
  if (captionCache.has(mediaId)) return captionCache.get(mediaId)
  try {
    const result = await igGet(`/${mediaId}`, { fields: 'caption' })
    const caption = result.caption || ''
    captionCache.set(mediaId, caption)
    return caption
  } catch (e) {
    console.warn(`[IG-Reply-Bot] Failed to fetch caption for ${mediaId}:`, e.message)
    return ''
  }
}

async function _processWebhook(body) {
  if (!body || body.object !== 'instagram') return

  const entries = body.entry || []
  for (const entry of entries) {
    const changes = entry.changes || []
    for (const change of changes) {
      if (change.field !== 'comments') continue
      const value = change.value
      if (!value) continue

      await _processComment(value)
    }
  }
}

async function _processComment(value) {
  const commentId = value.id
  const text = value.text || ''
  const fromId = value.from?.id
  const username = value.from?.username || 'unknown'
  const mediaId = value.media?.id

  const logBase = { commentId, commentText: text, username, postId: mediaId }

  try {
    // 1. Skip own comments
    if (fromId === igAccountId()) {
      return // Silent skip, don't log
    }

    // 2. Dedup
    if (isReplied(commentId)) {
      return // Already handled
    }

    // 3. Bot enabled?
    const config = loadConfig()
    if (!config.enabled) {
      appendLog({ ...logBase, intent: 'skip', reason: 'Bot disabled', replied: false })
      return
    }

    // 4. Rate limit
    const rateCheck = canReply(mediaId)
    if (!rateCheck.allowed) {
      appendLog({ ...logBase, intent: 'skip', reason: rateCheck.reason, replied: false })
      console.log(`[IG-Reply-Bot] RATE LIMITED | ${commentId} | @${username} | ${rateCheck.reason}`)
      return
    }

    // 5. Classify intent
    const postCaption = mediaId ? await fetchCaption(mediaId) : ''
    const classification = classifyIntent(text, postCaption)
    const { intent, reason, prefiltered } = await classification

    if (intent === 'skip') {
      appendLog({ ...logBase, intent: 'skip', reason, prefiltered: prefiltered || false, replied: false })
      console.log(`[IG-Reply-Bot] SKIPPED | ${commentId} | @${username} | ${reason}`)
      return
    }

    // 6. Generate reply
    const { replyText } = await generateReply(text, username, postCaption)

    // 7. Post reply
    const { replyId } = await postReply(commentId, replyText)

    // 8. Record
    markReplied(commentId, { replyId, postId: mediaId, replyText })
    recordReply(mediaId)
    appendLog({ ...logBase, intent: 'buying', reason, replied: true, replyText, replyId })

    console.log(`[IG-Reply-Bot] REPLIED | ${commentId} | @${username} | "${replyText.slice(0, 60)}..."`)
  } catch (e) {
    appendLog({ ...logBase, intent: 'error', reason: e.message, replied: false })
    console.error(`[IG-Reply-Bot] ERROR processing ${commentId}:`, e.message)
  }
}
