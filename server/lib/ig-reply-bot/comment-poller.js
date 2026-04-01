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

// Track which comments we've already seen (in memory, resets on restart)
const seenComments = new Set()

export async function pollForNewComments() {
  const config = loadConfig()
  if (!config.enabled) {
    console.log('[IG-Reply-Bot] Poll: bot disabled, skipping')
    return
  }

  const accountId = igAccountId()
  console.log(`[IG-Reply-Bot] Poll: checking posts for account ${accountId}`)

  try {
    // Get last 5 posts
    const mediaResult = await igGet(`/${accountId}/media`, {
      fields: 'id,caption,timestamp',
      limit: '5'
    })
    const posts = mediaResult.data || []
    console.log(`[IG-Reply-Bot] Poll: found ${posts.length} posts`)

    for (const post of posts) {
      try {
        // Get comments on this post
        const commentsResult = await igGet(`/${post.id}/comments`, {
          fields: 'id,text,username,from,timestamp',
          limit: '25'
        })
        const comments = commentsResult.data || []

        let newCount = 0
        for (const comment of comments) {
          // Skip if we've already seen or replied to this comment
          if (seenComments.has(comment.id) || isReplied(comment.id)) continue
          seenComments.add(comment.id)
          newCount++

          // Skip own comments
          if (comment.from?.id === accountId) {
            console.log(`[IG-Reply-Bot] Poll: skipping own comment ${comment.id}`)
            continue
          }

          console.log(`[IG-Reply-Bot] Poll: processing comment by @${comment.username}: "${comment.text?.slice(0, 50)}"`)
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

  // Keep seenComments from growing forever (cap at 5000)
  if (seenComments.size > 5000) {
    const arr = [...seenComments]
    seenComments.clear()
    arr.slice(-2000).forEach(id => seenComments.add(id))
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
      appendLog({ ...logBase, intent: 'skip', reason, prefiltered: prefiltered || false, replied: false })
      console.log(`[IG-Reply-Bot] POLL SKIPPED | ${commentId} | @${username} | ${reason}`)
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
