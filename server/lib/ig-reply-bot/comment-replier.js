/**
 * ig-reply-bot/comment-replier.js
 * Posts a reply to an Instagram comment via Meta Graph API.
 */

import { igPost } from '../instagram-publisher.js'

export async function postReply(commentId, replyText) {
  try {
    const result = await igPost(`/${commentId}/replies`, {
      message: replyText
    })
    return { replyId: result.id }
  } catch (e) {
    const msg = e.message || ''
    // Rate limit
    if (msg.includes('(#17)') || msg.includes('(#4)')) {
      console.warn('[IG-Reply-Bot] Rate limited by Meta:', msg)
      throw new Error('META_RATE_LIMIT')
    }
    // Invalid token
    if (msg.includes('(#190)') || msg.includes('OAuthException')) {
      console.error('[IG-Reply-Bot] CRITICAL: Token invalid or expired:', msg)
      throw new Error('META_TOKEN_INVALID')
    }
    throw e
  }
}
