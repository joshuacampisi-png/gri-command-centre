import { env } from './env.js'

let cache = { token: '', expiresAt: 0 }

export async function getShopifyClientCredentialsToken() {
  const now = Date.now()
  if (cache.token && cache.expiresAt > now + 60_000) return cache.token
  if (!env.shopify.apiKey || !env.shopify.apiSecret || !env.shopify.storeDomain) {
    throw new Error('Missing Shopify client credentials configuration')
  }

  const response = await fetch(`https://shopify.com/authentication/${env.shopify.storeDomain}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: env.shopify.apiKey,
      client_secret: env.shopify.apiSecret,
      grant_type: 'client_credentials'
    })
  })

  const text = await response.text()
  let data = null
  try { data = JSON.parse(text) } catch { data = { raw: text } }
  if (!response.ok || !data?.access_token) {
    throw new Error(data?.error_description || data?.error || data?.raw || JSON.stringify(data) || `Shopify token exchange failed (${response.status})`)
  }

  cache = {
    token: data.access_token,
    expiresAt: now + Number(data.expires_in || 86399) * 1000
  }
  return cache.token
}
