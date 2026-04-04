import { env } from '../lib/env.js'
import { getShopifyClientCredentialsToken } from '../lib/shopify-client-credentials.js'
import { loadShopifyOAuthState } from '../lib/shopify-oauth-store.js'

const SHOPIFY_API_VERSION = '2025-01'

function adminUrl(path = '') {
  return `https://${env.shopify.storeDomain}/admin/api/${SHOPIFY_API_VERSION}${path}`
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

async function shopifyFetchWithHeaders(pathOrUrl, options = {}) {
  const token = await effectiveAdminToken()
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : adminUrl(pathOrUrl)
  const response = await fetch(url, {
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
  return { data, headers: response.headers }
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
 * Fetch all orders for a single month chunk using Link-header pagination
 */
async function fetchOrdersChunk(fromISO, toISO) {
  let orders = []
  let nextUrl = `/orders.json?status=any&created_at_min=${fromISO}&created_at_max=${toISO}&limit=250`

  for (let page = 0; page < 50 && nextUrl; page++) {
    const result = await shopifyFetchWithHeaders(nextUrl)
    const batch = result.data.orders || []
    if (batch.length === 0) break
    orders = orders.concat(batch)

    nextUrl = null
    const linkHeader = result.headers?.get?.('link') || result.headers?.link || ''
    const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/)
    if (nextMatch) nextUrl = nextMatch[1]
    if (batch.length < 250 && !nextUrl) break
  }
  return orders
}

/**
 * Fetch orders for a date range from Shopify REST API — chunked by month for reliability
 */
export async function getShopifyOrdersRange(fromDate, toDate, { includeOrderDetails = false } = {}) {
  const token = await effectiveAdminToken()
  if (!env.shopify.storeDomain || !token) {
    return { ok: false, error: 'Missing Shopify credentials' }
  }

  // Split into monthly chunks to avoid Shopify pagination bugs on large date ranges
  const chunks = []
  const [fromY, fromM] = fromDate.split('-').map(Number)
  const [toY, toM] = toDate.split('-').map(Number)

  let y = fromY, m = fromM
  while (y < toY || (y === toY && m <= toM)) {
    const mm = String(m).padStart(2, '0')
    const lastDay = new Date(y, m, 0).getDate()
    const chunkFrom = (y === fromY && m === fromM) ? fromDate : `${y}-${mm}-01`
    const chunkTo = (y === toY && m === toM) ? toDate : `${y}-${mm}-${lastDay}`
    const fromISO = new Date(chunkFrom + 'T00:00:00+10:00').toISOString()
    const toISO = new Date(chunkTo + 'T23:59:59+10:00').toISOString()
    chunks.push({ fromISO, toISO, label: `${y}-${mm}` })
    m++
    if (m > 12) { m = 1; y++ }
  }

  let allOrders = []
  for (const chunk of chunks) {
    const batch = await fetchOrdersChunk(chunk.fromISO, chunk.toISO)
    console.log(`[YTD] ${chunk.label}: ${batch.length} orders`)
    allOrders = allOrders.concat(batch)
  }

  // Deduplicate by order ID in case of overlap
  const seen = new Set()
  allOrders = allOrders.filter(o => {
    if (seen.has(o.id)) return false
    seen.add(o.id)
    return true
  })

  console.log(`[YTD] Total: ${allOrders.length} orders for ${fromDate} to ${toDate}`)

  const validOrders = allOrders.filter(o =>
    o.financial_status !== 'voided' && o.cancelled_at === null
  )

  let revenue = 0, shipping = 0, orderCount = 0, protectionCount = 0, protectionRevenue = 0, productRevenue = 0
  for (const order of validOrders) {
    // Use total_price minus any refunds to match Shopify's "Total sales" metric
    const total = parseFloat(order.total_price || 0)
    const refunded = (order.refunds || []).reduce((sum, r) => {
      return sum + (r.transactions || []).reduce((ts, t) => ts + parseFloat(t.amount || 0), 0)
    }, 0)
    const netTotal = total - refunded
    const subtotal = parseFloat(order.subtotal_price || 0)
    const ship = (order.shipping_lines || []).reduce((sum, s) => sum + parseFloat(s.price || 0), 0)
    revenue += netTotal
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

  const result = { ok: true, revenue, productRevenue, shipping, orders: orderCount, protectionCount, protectionRevenue, from: fromDate, to: toDate }

  if (includeOrderDetails) {
    result.orderDetails = validOrders.map(o => ({
      id: o.id,
      email: (o.contact_email || o.email || '').toLowerCase().trim(),
      aov: parseFloat(o.total_price) || 0,
      createdAt: o.created_at,
      name: o.name,
    }))
  }

  return result
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
