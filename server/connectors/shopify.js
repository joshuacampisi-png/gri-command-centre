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

/**
 * Fetch today's orders from Shopify REST API (AEST timezone)
 */
export async function getShopifyTodayOrders() {
  const token = await effectiveAdminToken()
  if (!env.shopify.storeDomain || !token) {
    return { ok: false, error: 'Missing Shopify credentials' }
  }

  // Get start of today in AEST (UTC+10)
  const now = new Date()
  const aest = new Date(now.toLocaleString('en-US', { timeZone: 'Australia/Brisbane' }))
  const todayStart = new Date(aest.getFullYear(), aest.getMonth(), aest.getDate())
  // Convert back to UTC for Shopify API
  const utcStart = new Date(todayStart.getTime() - (10 * 60 * 60 * 1000))

  let allOrders = []
  let url = `/orders.json?status=any&created_at_min=${utcStart.toISOString()}&limit=250`

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

  const dateStr = aest.toLocaleDateString('en-CA', { timeZone: 'Australia/Brisbane' })
  return { ok: true, revenue, shipping, orders: orderCount, items, date: dateStr }
}

/**
 * Fetch orders for a date range from Shopify REST API
 */
export async function getShopifyOrdersRange(fromDate, toDate) {
  const token = await effectiveAdminToken()
  if (!env.shopify.storeDomain || !token) {
    return { ok: false, error: 'Missing Shopify credentials' }
  }

  // Convert AEST dates to UTC
  const utcFrom = new Date(new Date(fromDate + 'T00:00:00+10:00').toISOString())
  const utcTo = new Date(new Date(toDate + 'T23:59:59+10:00').toISOString())

  let allOrders = []
  let url = `/orders.json?status=any&created_at_min=${utcFrom.toISOString()}&created_at_max=${utcTo.toISOString()}&limit=250`

  while (url) {
    const data = await shopifyFetch(url)
    allOrders = allOrders.concat(data.orders || [])
    url = null
  }

  const validOrders = allOrders.filter(o =>
    o.financial_status !== 'voided' && o.cancelled_at === null
  )

  let revenue = 0, shipping = 0, orderCount = 0
  for (const order of validOrders) {
    revenue += parseFloat(order.total_price || 0)
    shipping += (order.shipping_lines || []).reduce((sum, s) => sum + parseFloat(s.price || 0), 0)
    orderCount++
  }

  return { ok: true, revenue, shipping, orders: orderCount, from: fromDate, to: toDate }
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
