/**
 * ig-reply-bot/comment-poller.js
 * Polls recent Instagram posts for new comments and processes them.
 * This is a fallback for when webhooks aren't delivering (Development mode).
 * Runs every 2 minutes via cron.
 */

import { igGet, igAccountId } from '../instagram-publisher.js'
import { loadConfig, isReplied, markReplied, appendLog } from './store.js'
import { canReply, recordReply } from './rate-limiter.js'
import { classifyIntent } from './intent-classifier.js'
import { generateReply } from './reply-generator.js'
import { postReply } from './comment-replier.js'

export async function pollForNewComments() {
  const config = loadConfig()
  if (!config.enabled) {
    return
  }

  const accountId = igAccountId()

  try {
    // Get last 5 posts
    const mediaResult = await igGet(`/${accountId}/media`, {
      fields: 'id,caption,timestamp',
      limit: '5'
    })
    const posts = mediaResult.data || []

    for (const post of posts) {
      try {
        // Get comments on this post
        const commentsResult = await igGet(`/${post.id}/comments`, {
          fields: 'id,text,username,from,timestamp',
          limit: '25'
        })
        const comments = commentsResult.data || []

        for (const comment of comments) {
          // Only skip if we've ALREADY REPLIED (persistent check)
          if (isReplied(comment.id)) continue

          // Skip own comments (the business account)
          if (comment.from?.id === accountId) continue

          console.log(`[IG-Reply-Bot] Poll: processing @${comment.username}: "${comment.text?.slice(0, 50)}"`)
          await _processPolledComment(comment, post)
        }
        if (newCount > 0) console.log(`[IG-Reply-Bot] Poll: ${newCount} new comments on post ${post.id}`)
      } catch (e) {
        // One post failing shouldn't kill the whole poll
        console.warn(`[IG-Reply-Bot] Poll: Failed to check comments on ${post.id}:`, e.message)
      }
    }
  } catch (e) {
    console.error('[IG-Reply-Bot] Poll: Failed to fetch media:', e.message)
  }

}

async function _processPolledComment(comment, post) {
  const commentId = comment.id
  const text = comment.text || ''
  const username = comment.username || comment.from?.username || 'unknown'
  const mediaId = post.id
  const postCaption = post.caption || ''

  const logBase = { commentId, commentText: text, username, postId: mediaId, type: 'comment-poll' }

  try {
    // Rate limit
    const rateCheck = canReply(mediaId)
    if (!rateCheck.allowed) {
      appendLog({ ...logBase, intent: 'skip', reason: rateCheck.reason, replied: false })
      return
    }

    // Classify intent
    const { intent, reason, prefiltered } = await classifyIntent(text, postCaption)

    if (intent === 'skip') {
      // Mark as "replied" so we don't re-classify on next poll cycle
      markReplied(commentId, { replyId: 'skipped', postId: mediaId, replyText: '' })
      appendLog({ ...logBase, intent: 'skip', reason, prefiltered: prefiltered || false, replied: false })
      return
    }

    // Generate reply
    const { replyText } = await generateReply(text, username, postCaption)

    // Post reply
    const { replyId } = await postReply(commentId, replyText)

    // Record
    markReplied(commentId, { replyId, postId: mediaId, replyText })
    recordReply(mediaId)
    appendLog({ ...logBase, intent: 'buying', reason, replied: true, replyText, replyId })

    console.log(`[IG-Reply-Bot] POLL REPLIED | ${commentId} | @${username} | "${replyText.slice(0, 60)}..."`)
  } catch (e) {
    appendLog({ ...logBase, intent: 'error', reason: e.message, replied: false })
    console.error(`[IG-Reply-Bot] POLL ERROR ${commentId}:`, e.message)
  }
}
