import crypto from 'node:crypto'
import { Router } from 'express'
import { env } from '../lib/env.js'
import { loadShopifyOAuthState, saveShopifyOAuthState } from '../lib/shopify-oauth-store.js'

const router = Router()

function callbackUrl() {
  return `${env.shopify.appUrl}/api/shopify/oauth/callback`
}

function requiredConfig() {
  return Boolean(env.shopify.storeDomain && env.shopify.apiKey && env.shopify.apiSecret)
}

router.get('/status', async (_req, res) => {
  const state = await loadShopifyOAuthState()
  res.json({
    ok: true,
    configured: requiredConfig(),
    storeDomain: env.shopify.storeDomain,
    appUrl: env.shopify.appUrl,
    callbackUrl: callbackUrl(),
    scopes: env.shopify.scopes,
    connected: Boolean(state.accessToken),
    connectedAt: state.connectedAt || null,
    shop: state.shop || env.shopify.storeDomain || null
  })
})

router.get('/start', async (_req, res) => {
  if (!requiredConfig()) {
    return res.status(400).json({ ok: false, error: 'Missing Shopify API key, secret, or store domain' })
  }
  const nonce = crypto.randomBytes(16).toString('hex')
  await saveShopifyOAuthState({ nonce })
  const url = new URL(`https://${env.shopify.storeDomain}/admin/oauth/authorize`)
  url.searchParams.set('client_id', env.shopify.apiKey)
  url.searchParams.set('scope', env.shopify.scopes)
  url.searchParams.set('redirect_uri', callbackUrl())
  url.searchParams.set('state', nonce)
  res.json({ ok: true, installUrl: url.toString() })
})

router.get('/callback', async (req, res) => {
  try {
    const { code = '', hmac = '', shop = '', state = '' } = req.query
    const saved = await loadShopifyOAuthState()
    if (!code || !shop || !state) {
      return res.status(400).send('Invalid Shopify OAuth state — missing params')
    }
    // Allow manual installs (state starts with manual_install_) or matching nonce
    if (!state.startsWith('manual_install_') && state !== saved.nonce) {
      return res.status(400).send('Invalid Shopify OAuth state — nonce mismatch')
    }

    const params = new URLSearchParams(req.query)
    const providedHmac = String(hmac)
    params.delete('hmac')
    const message = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${Array.isArray(v) ? v.join(',') : v}`).join('&')
    const digest = crypto.createHmac('sha256', env.shopify.apiSecret).update(message).digest('hex')
    if (digest !== providedHmac) {
      return res.status(400).send('Invalid Shopify OAuth HMAC')
    }

    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: env.shopify.apiKey,
        client_secret: env.shopify.apiSecret,
        code
      })
    })
    const tokenJson = await tokenRes.json()
    if (!tokenRes.ok || !tokenJson.access_token) {
      return res.status(400).send(`OAuth exchange failed: ${JSON.stringify(tokenJson)}`)
    }

    await saveShopifyOAuthState({
      accessToken: tokenJson.access_token,
      scope: tokenJson.scope || env.shopify.scopes,
      connectedAt: new Date().toISOString(),
      shop,
      nonce: ''
    })

    res.send('Shopify connected successfully. Return to the command centre.')
  } catch (error) {
    res.status(500).send(`Shopify OAuth error: ${String(error?.message || error)}`)
  }
})

export default router
