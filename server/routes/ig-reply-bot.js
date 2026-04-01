/**
 * routes/ig-reply-bot.js
 * API endpoints for the Instagram Auto Reply Bot.
 * Includes Meta webhook verify/receive + dashboard management endpoints.
 */

import { Router } from 'express'
import crypto from 'crypto'
import { handleCommentWebhook } from '../lib/ig-reply-bot/webhook-handler.js'
import { loadConfig, updateConfig, getLog, loadToneProfile, getStats } from '../lib/ig-reply-bot/store.js'
import { getRateLimitStatus } from '../lib/ig-reply-bot/rate-limiter.js'
import { extractToneProfile } from '../lib/ig-reply-bot/tone-extractor.js'

const router = Router()

// ── Webhook Verification (GET) ──────────────────────────────────────────────

router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode']
  const token = req.query['hub.verify_token']
  const challenge = req.query['hub.challenge']

  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN
  if (!verifyToken) {
    console.error('[IG-Reply-Bot] META_WEBHOOK_VERIFY_TOKEN not set')
    return res.sendStatus(403)
  }

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('[IG-Reply-Bot] Webhook verified successfully')
    return res.status(200).send(challenge)
  }

  console.warn('[IG-Reply-Bot] Webhook verification failed — token mismatch')
  res.sendStatus(403)
})

// ── Webhook Event Receiver (POST) ───────────────────────────────────────────

function verifySignature(rawBody, signature) {
  if (!signature || !process.env.META_APP_SECRET) return false
  try {
    const expected = 'sha256=' + crypto
      .createHmac('sha256', process.env.META_APP_SECRET)
      .update(rawBody)
      .digest('hex')
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  } catch {
    return false
  }
}

router.post('/webhook', (req, res) => {
  // Always return 200 immediately — Meta retries on non-200
  res.sendStatus(200)

  // Verify HMAC signature
  const signature = req.headers['x-hub-signature-256']
  if (process.env.META_APP_SECRET && req.rawBody) {
    if (!verifySignature(req.rawBody, signature)) {
      console.warn('[IG-Reply-Bot] Webhook signature verification failed')
      return
    }
  }

  // Process async (don't await)
  handleCommentWebhook(req.body)
})

// ── Dashboard API Endpoints ─────────────────────────────────────────────────

router.get('/status', (_req, res) => {
  const config = loadConfig()
  const tone = loadToneProfile()
  const rateLimit = getRateLimitStatus()
  const stats = getStats()

  res.json({
    ok: true,
    enabled: config.enabled,
    stats,
    rateLimit,
    toneProfile: tone ? {
      extractedAt: tone.extractedAt,
      postCount: tone.postCount,
      hasProfile: true
    } : { hasProfile: false },
    webhookUrl: '/api/ig-reply-bot/webhook'
  })
})

router.post('/toggle', (req, res) => {
  const { enabled } = req.body
  const config = updateConfig({ enabled: Boolean(enabled) })
  console.log(`[IG-Reply-Bot] Bot ${config.enabled ? 'ENABLED' : 'DISABLED'}`)
  res.json({ ok: true, enabled: config.enabled })
})

router.get('/log', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200)
  const offset = parseInt(req.query.offset) || 0
  const result = getLog(limit, offset)
  res.json({ ok: true, ...result })
})

router.get('/tone-profile', (_req, res) => {
  const tone = loadToneProfile()
  if (!tone) {
    return res.json({ ok: true, profile: null, message: 'No tone profile extracted yet' })
  }
  res.json({ ok: true, ...tone })
})

router.post('/refresh-tone', async (_req, res) => {
  try {
    const profile = await extractToneProfile()
    if (profile) {
      res.json({ ok: true, message: 'Tone profile refreshed', profile })
    } else {
      res.json({ ok: false, message: 'Tone extraction returned no results — check Meta API token' })
    }
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

router.get('/stats', (_req, res) => {
  const stats = getStats()
  const rateLimit = getRateLimitStatus()
  res.json({ ok: true, ...stats, rateLimit })
})

// Manual poll trigger (for debugging)
router.post('/poll-now', async (_req, res) => {
  try {
    const { pollForNewComments } = await import('../lib/ig-reply-bot/comment-poller.js')
    console.log('[IG-Reply-Bot] Manual poll triggered')
    await pollForNewComments()
    res.json({ ok: true, message: 'Poll completed' })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

export default router
