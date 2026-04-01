/**
 * ig-reply-bot/webhook-handler.js
 * Orchestrates the full comment-reply AND DM-reply pipeline.
 * Processes events sequentially via promise chain to prevent JSON write conflicts.
 */

import { igAccountId, igGet } from '../instagram-publisher.js'
import { loadConfig, isReplied, markReplied, appendLog } from './store.js'
import { canReply, recordReply } from './rate-limiter.js'
import { classifyIntent } from './intent-classifier.js'
import { generateReply } from './reply-generator.js'
import { postReply } from './comment-replier.js'
import { sendDMReply } from './dm-replier.js'

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
    // Handle comment webhooks (via changes array)
    const changes = entry.changes || []
    for (const change of changes) {
      if (change.field === 'comments') {
        const value = change.value
        if (value) await _processComment(value)
      }
    }

    // Handle DM webhooks (via messaging array)
    const messaging = entry.messaging || []
    for (const event of messaging) {
      if (event.message && event.sender) {
        await _processMessage(event)
      }
    }
  }
}

// ── Comment Processing ──────────────────────────────────────────────────────

async function _processComment(value) {
  const commentId = value.id
  const text = value.text || ''
  const fromId = value.from?.id
  const username = value.from?.username || 'unknown'
  const mediaId = value.media?.id

  const logBase = { commentId, commentText: text, username, postId: mediaId, type: 'comment' }

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

// ── DM Processing ───────────────────────────────────────────────────────────

async function _processMessage(event) {
  const senderId = event.sender?.id
  const messageId = event.message?.mid || event.message?.id
  const text = event.message?.text || ''
  const isEcho = event.message?.is_echo // Skip messages sent BY us

  const logBase = { commentId: messageId, commentText: text, username: senderId, postId: 'dm', type: 'dm' }

  try {
    // Skip echo (our own messages)
    if (isEcho) return

    // Skip if no text (stickers, images, etc)
    if (!text || text.trim().length < 3) return

    // Dedup
    if (isReplied(messageId)) return

    // Bot enabled?
    const config = loadConfig()
    if (!config.enabled) {
      appendLog({ ...logBase, intent: 'skip', reason: 'Bot disabled', replied: false })
      return
    }

    // Rate limit (use 'dm' as the postId bucket)
    const rateCheck = canReply('dm-global')
    if (!rateCheck.allowed) {
      appendLog({ ...logBase, intent: 'skip', reason: rateCheck.reason, replied: false })
      console.log(`[IG-Reply-Bot] DM RATE LIMITED | ${messageId} | ${senderId} | ${rateCheck.reason}`)
      return
    }

    // For DMs, always reply if it looks like a product/shipping/buying question
    // Use the same intent classifier
    const { intent, reason } = await classifyIntent(text, '')

    if (intent === 'skip') {
      appendLog({ ...logBase, intent: 'skip', reason, replied: false })
      console.log(`[IG-Reply-Bot] DM SKIPPED | ${messageId} | ${senderId} | ${reason}`)
      return
    }

    // Generate reply (DMs can be longer than comments)
    const { replyText } = await generateReply(text, 'customer', '')

    // Send DM reply
    const { messageId: replyMsgId } = await sendDMReply(senderId, replyText)

    // Record
    markReplied(messageId, { replyId: replyMsgId, postId: 'dm', replyText })
    recordReply('dm-global')
    appendLog({ ...logBase, intent: 'buying', reason, replied: true, replyText, replyId: replyMsgId })

    console.log(`[IG-Reply-Bot] DM REPLIED | ${messageId} | ${senderId} | "${replyText.slice(0, 60)}..."`)
  } catch (e) {
    appendLog({ ...logBase, intent: 'error', reason: e.message, replied: false })
    console.error(`[IG-Reply-Bot] DM ERROR ${messageId}:`, e.message)
  }
}
