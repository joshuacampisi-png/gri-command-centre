/**
 * ig-reply-bot/dm-replier.js
 * Sends a DM reply via the Instagram Messaging API (Send API).
 * Uses: POST /v20.0/me/messages with the Page Access Token.
 */

import { igToken } from '../instagram-publisher.js'

const BASE = 'https://graph.facebook.com/v20.0'

export async function sendDMReply(recipientId, messageText) {
  const url = `${BASE}/me/messages`
  const body = {
    recipient: { id: recipientId },
    message: { text: messageText }
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${igToken()}`
    },
    body: JSON.stringify(body)
  })

  const data = await res.json()
  if (data.error) {
    const msg = data.error.message || ''
    // Rate limit
    if (msg.includes('(#17)') || msg.includes('(#4)')) {
      console.warn('[IG-Reply-Bot] DM rate limited by Meta:', msg)
      throw new Error('META_RATE_LIMIT')
    }
    // Invalid token or missing permission
    if (msg.includes('(#190)') || msg.includes('(#10)') || msg.includes('OAuthException')) {
      console.error('[IG-Reply-Bot] CRITICAL: DM token/permission error:', msg)
      throw new Error('META_TOKEN_INVALID')
    }
    throw new Error(`Instagram DM API: ${msg}`)
  }

  return { messageId: data.message_id || data.id }
}
