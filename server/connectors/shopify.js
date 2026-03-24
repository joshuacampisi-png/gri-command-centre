import { env } from '../lib/env.js'
import { getShopifyClientCredentialsToken } from '../lib/shopify-client-credentials.js'
import { loadShopifyOAuthState } from '../lib/shopify-oauth-store.js'

function adminUrl(path = '') {
  return `https://${env.shopify.storeDomain}/admin/api/2026-01${path}`
}

async function effectiveAdminToken() {
  // 1. Prefer OAuth token (has read_orders scope)
  try {
    const oauth = await loadShopifyOAuthState()
    if (oauth.accessToken) return oauth.accessToken
  } catch {}
  // 2. Prefer client credentials (auto-grants write_orders scope)
  if (env.shopify.apiKey && env.shopify.apiSecret) {
    try {
      return await getShopifyClientCredentialsToken()
    } catch {}
  }
  // 3. Fall back to custom app admin token
  if (env.shopify.adminAccessToken) return env.shopify.adminAccessToken
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

/**
 * Fetch today's orders from Shopify REST API (AEST timezone)
 */
export async function getShopifyTodayOrders() {
  const token = await effectiveAdminToken()
  if (!env.shopify.storeDomain || !token) {
    return { ok: false, error: 'Missing Shopify credentials' }
  }

  // Get start of today in AEST (UTC+10) — midnight AEST = 14:00 UTC previous day
  const now = new Date()
  const aestNow = new Date(now.getTime() + (10 * 60 * 60 * 1000))
  const aestDate = aestNow.toISOString().slice(0, 10) // YYYY-MM-DD in AEST
  const utcMidnightAEST = new Date(aestDate + 'T00:00:00+10:00')

  let allOrders = []
  let url = `/orders.json?status=any&created_at_min=${utcMidnightAEST.toISOString()}&limit=250`

  while (url) {
    const data = await shopifyFetch(url)
    allOrders = allOrders.concat(data.orders || [])
    // Shopify pagination via Link header not available via shopifyFetch, but 250 limit covers most days
    url = null
  }

  // Filter out cancelled/voided orders
  const validOrders = allOrders.filter(o =>
    o.financial_status !== 'voided' && o.cancelled_at === null
  )

  let revenue = 0, shipping = 0, orderCount = 0
  const items = []

  for (const order of validOrders) {
    const total = parseFloat(order.total_price || 0)
    const ship = (order.shipping_lines || []).reduce((sum, s) => sum + parseFloat(s.price || 0), 0)
    revenue += total
    shipping += ship
    orderCount++
    items.push({
      name: order.name,
      total,
      shipping: ship,
      time: order.created_at,
      lineItems: (order.line_items || []).map(li => ({
        title: li.title,
        quantity: li.quantity,
        price: parseFloat(li.price || 0)
      }))
    })
  }

  return { ok: true, revenue, shipping, orders: orderCount, items, date: aestDate }
}

// Shipping Protection product ID
const SHIPPING_PROTECTION_PRODUCT_ID = 8156417196121
const SHIPPING_PROTECTION_PRICE = 3.00

/**
 * Fetch orders for a date range from Shopify REST API with pagination
 */
export async function getShopifyOrdersRange(fromDate, toDate) {
  const token = await effectiveAdminToken()
  if (!env.shopify.storeDomain || !token) {
    return { ok: false, error: 'Missing Shopify credentials' }
  }

  const utcFrom = new Date(fromDate + 'T00:00:00+10:00')
  const utcTo = new Date(toDate + 'T23:59:59+10:00')

  let allOrders = []
  let page = 1
  let hasMore = true
  let sinceId = null

  while (hasMore) {
    let url = `/orders.json?status=any&created_at_min=${utcFrom.toISOString()}&created_at_max=${utcTo.toISOString()}&limit=250`
    if (sinceId) url += `&since_id=${sinceId}`
    const data = await shopifyFetch(url)
    const batch = data.orders || []
    allOrders = allOrders.concat(batch)
    if (batch.length < 250) { hasMore = false } else { sinceId = batch[batch.length - 1].id; page++ }
    if (page > 10) break // Safety cap at ~2500 orders
  }

  const validOrders = allOrders.filter(o =>
    o.financial_status !== 'voided' && o.cancelled_at === null
  )

  let revenue = 0, shipping = 0, orderCount = 0, protectionCount = 0, protectionRevenue = 0, productRevenue = 0
  for (const order of validOrders) {
    const total = parseFloat(order.total_price || 0)
    const subtotal = parseFloat(order.subtotal_price || 0)
    const ship = (order.shipping_lines || []).reduce((sum, s) => sum + parseFloat(s.price || 0), 0)
    revenue += total
    shipping += ship
    orderCount++
    const hasProtection = (order.line_items || []).some(
      li => li.product_id === SHIPPING_PROTECTION_PRODUCT_ID
        || (li.title || '').toLowerCase().includes('shipping protection')
    )
    if (hasProtection) {
      protectionCount++
      protectionRevenue += SHIPPING_PROTECTION_PRICE
    }
    // Product revenue = subtotal minus shipping protection line items
    productRevenue += subtotal - (hasProtection ? SHIPPING_PROTECTION_PRICE : 0)
  }

  return { ok: true, revenue, productRevenue, shipping, orders: orderCount, protectionCount, protectionRevenue, from: fromDate, to: toDate }
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
