/**
 * ig-reply-bot/comment-poller.js
 * Polls recent Instagram posts for new comments and processes them.
 * Runs every 2 minutes via cron. Only checks comments from the last 24 hours.
 */

import { igGet, igAccountId } from '../instagram-publisher.js'
import { loadConfig, isReplied, markReplied, appendLog } from './store.js'
import { canReply, recordReply } from './rate-limiter.js'
import { classifyIntent } from './intent-classifier.js'
import { generateReply } from './reply-generator.js'
import { postReply } from './comment-replier.js'

const ONE_DAY_MS = 24 * 60 * 60 * 1000

export async function pollForNewComments() {
  const config = loadConfig()
  if (!config.enabled) return

  const accountId = igAccountId()
  const cutoff = new Date(Date.now() - ONE_DAY_MS)

  try {
    const mediaResult = await igGet(`/${accountId}/media`, {
      fields: 'id,caption,timestamp',
      limit: '5'
    })
    const posts = mediaResult.data || []

    for (const post of posts) {
      try {
        const commentsResult = await igGet(`/${post.id}/comments`, {
          fields: 'id,text,username,from,timestamp',
          limit: '25'
        })

        for (const comment of (commentsResult.data || [])) {
          // Already processed (replied OR skipped) — skip silently
          if (isReplied(comment.id)) continue

          // Skip comments older than 24 hours
          if (comment.timestamp && new Date(comment.timestamp) < cutoff) {
            markReplied(comment.id, { replyId: 'old', postId: post.id, replyText: '' })
            continue
          }

          // Skip own comments (business account)
          if (comment.from?.id === accountId) {
            markReplied(comment.id, { replyId: 'own', postId: post.id, replyText: '' })
            continue
          }

          await _processComment(comment, post)
        }
      } catch (e) {
        console.warn(`[IG-Reply-Bot] Poll error on post ${post.id}:`, e.message)
      }
    }
  } catch (e) {
    console.error('[IG-Reply-Bot] Poll failed:', e.message)
  }
}

async function _processComment(comment, post) {
  const { id: commentId, text = '', username = 'unknown' } = comment
  const { id: mediaId, caption: postCaption = '' } = post
  const logBase = { commentId, commentText: text, username, postId: mediaId, type: 'comment-poll' }

  try {
    // Rate limit check
    const rateCheck = canReply(mediaId)
    if (!rateCheck.allowed) {
      markReplied(commentId, { replyId: 'rate-limited', postId: mediaId, replyText: '' })
      appendLog({ ...logBase, intent: 'skip', reason: rateCheck.reason, replied: false })
      return
    }

    // Classify intent (includes prefilters for short/emoji comments)
    const { intent, reason, prefiltered } = await classifyIntent(text, postCaption)

    if (intent === 'skip') {
      markReplied(commentId, { replyId: 'skipped', postId: mediaId, replyText: '' })
      appendLog({ ...logBase, intent: 'skip', reason, prefiltered: prefiltered || false, replied: false })
      return
    }

    // Generate and post reply
    const { replyText } = await generateReply(text, username, postCaption)
    const { replyId } = await postReply(commentId, replyText)

    markReplied(commentId, { replyId, postId: mediaId, replyText })
    recordReply(mediaId)
    appendLog({ ...logBase, intent: 'buying', reason, replied: true, replyText, replyId })
    console.log(`[IG-Reply-Bot] REPLIED @${username}: "${replyText.slice(0, 60)}"`)
  } catch (e) {
    // Mark as processed even on error so we don't retry endlessly
    markReplied(commentId, { replyId: 'error', postId: mediaId, replyText: '' })
    appendLog({ ...logBase, intent: 'error', reason: e.message, replied: false })
    console.error(`[IG-Reply-Bot] ERROR on ${commentId}:`, e.message)
  }
}
