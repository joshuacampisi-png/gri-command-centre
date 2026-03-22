import { env } from '../lib/env.js'
import { getShopifyClientCredentialsToken } from '../lib/shopify-client-credentials.js'

function adminUrl(path = '') {
  return `https://${env.shopify.storeDomain}/admin/api/2025-01${path}`
}

async function effectiveAdminToken() {
  if (env.shopify.adminAccessToken) return env.shopify.adminAccessToken
  if (env.shopify.apiKey && env.shopify.apiSecret) {
    return getShopifyClientCredentialsToken()
  }
  return ''
}

export async function shopifyFetch(path, options = {}) {
  const token = await effectiveAdminToken()
  const response = await fetch(adminUrl(path), {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
      ...(options.headers || {})
    }
  })
  const text = await response.text()
  let data = null
  try { data = JSON.parse(text) } catch { data = { raw: text } }
  if (!response.ok) {
    throw new Error(data?.errors ? JSON.stringify(data.errors) : `Shopify API error ${response.status}`)
  }
  return data
}

export async function getShopifyShop() {
  return shopifyFetch('/shop.json')
}

export async function getShopifyThemes() {
  return shopifyFetch('/themes.json')
}

export async function getShopifySnapshot() {
  const token = await effectiveAdminToken()
  if (!env.shopify.storeDomain || !token) {
    return { connected: false, error: 'Missing Shopify credentials' }
  }
  try {
    const [shop, themes] = await Promise.all([getShopifyShop(), getShopifyThemes()])
    return { connected: true, shop: shop.shop, themes: themes.themes || [], error: null }
  } catch (error) {
    return { connected: false, error: String(error?.message || error) }
  }
}
