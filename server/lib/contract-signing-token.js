/**
 * contract-signing-token.js
 * ─────────────────────────────────────────────────────────────
 * HMAC-SHA256 signed short tokens for TNT contract signing URLs.
 * The token binds an orderNumber to a 30-day expiry so the URL
 * can be emailed safely — it's unguessable and can't be reused
 * for other hires.
 *
 * URL shape: /sign/:orderNumber/:token
 *
 * Token format: base64url(first-12-bytes-of-HMAC + ":" + expiryDays)
 * Example: BmR3Uc7Pq1Zx:30
 * ─────────────────────────────────────────────────────────────
 */

import { createHmac } from 'crypto'

function getSecret() {
  const s = process.env.CONTRACT_SIGNING_SECRET
    || process.env.SHOPIFY_API_SECRET
    || process.env.DASHBOARD_PASSWORD
    || 'gri-tnt-contract-default-secret-2026'
  return s
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Sign a contract URL token for an order.
 * @param {string} orderNumber e.g. "#12047" or "12047"
 * @param {number} ttlDays default 60
 */
export function signOrderToken(orderNumber, ttlDays = 60) {
  const normalised = String(orderNumber).replace(/^#/, '')
  const expiresAt = Date.now() + ttlDays * 24 * 60 * 60 * 1000
  const payload = `${normalised}.${expiresAt}`
  const mac = createHmac('sha256', getSecret()).update(payload).digest()
  const tag = b64url(mac.slice(0, 16)) // 16 bytes = ~22 b64url chars
  return `${tag}.${expiresAt.toString(36)}`
}

/**
 * Verify a token for an order number.
 * @returns {{ ok: boolean, expired?: boolean }}
 */
export function verifyOrderToken(orderNumber, token) {
  if (!token || typeof token !== 'string') return { ok: false }
  const parts = token.split('.')
  if (parts.length !== 2) return { ok: false }
  const [tagFromUrl, expStr] = parts
  const expiresAt = parseInt(expStr, 36)
  if (!Number.isFinite(expiresAt)) return { ok: false }
  if (Date.now() > expiresAt) return { ok: false, expired: true }
  const normalised = String(orderNumber).replace(/^#/, '')
  const payload = `${normalised}.${expiresAt}`
  const expected = b64url(createHmac('sha256', getSecret()).update(payload).digest().slice(0, 16))
  // Constant-time compare
  if (tagFromUrl.length !== expected.length) return { ok: false }
  let diff = 0
  for (let i = 0; i < tagFromUrl.length; i++) diff |= tagFromUrl.charCodeAt(i) ^ expected.charCodeAt(i)
  return { ok: diff === 0 }
}

/**
 * Build a complete signing URL for an order.
 * @param {string} orderNumber
 * @param {string} baseUrl defaults to process.env.BASE_URL
 */
export function buildSigningUrl(orderNumber, baseUrl) {
  const normalised = String(orderNumber).replace(/^#/, '')
  const token = signOrderToken(normalised)
  const base = baseUrl || process.env.CONTRACT_BASE_URL || process.env.BASE_URL || ''
  return `${base}/sign/${normalised}/${token}`
}
