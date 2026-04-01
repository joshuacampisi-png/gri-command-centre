/**
 * ig-reply-bot/tone-scraper.js
 * Pulls last N posts from GRI Instagram account via Meta Graph API.
 * Collects captions and the account's own comment replies for tone extraction.
 */

import { igGet, igAccountId } from '../instagram-publisher.js'

export async function scrapeOwnContent(count = 50) {
  const accountId = igAccountId()
  const captions = []
  const ownReplies = []

  // Fetch recent media
  let media = []
  try {
    const result = await igGet(`/${accountId}/media`, {
      fields: 'id,caption,timestamp',
      limit: String(count)
    })
    media = result.data || []
  } catch (e) {
    console.error('[IG-Reply-Bot] Failed to fetch media:', e.message)
    return { captions, ownReplies, postCount: 0 }
  }

  // Collect captions
  for (const post of media) {
    if (post.caption) captions.push(post.caption)
  }

  // Fetch comments on each post and find own replies
  for (const post of media) {
    try {
      const commentsResult = await igGet(`/${post.id}/comments`, {
        fields: 'id,text,username,from,replies{id,text,username,from}',
        limit: '50'
      })
      const comments = commentsResult.data || []

      for (const comment of comments) {
        // Check if the comment itself is from the account
        if (comment.from?.id === accountId) {
          ownReplies.push(comment.text)
        }
        // Check nested replies
        if (comment.replies?.data) {
          for (const reply of comment.replies.data) {
            if (reply.from?.id === accountId) {
              ownReplies.push(reply.text)
            }
          }
        }
      }
    } catch (e) {
      // One post failing shouldn't kill the whole scrape
      console.warn(`[IG-Reply-Bot] Failed to fetch comments for post ${post.id}:`, e.message)
    }
  }

  console.log(`[IG-Reply-Bot] Scraped ${captions.length} captions, ${ownReplies.length} own replies from ${media.length} posts`)
  return { captions, ownReplies, postCount: media.length }
}
