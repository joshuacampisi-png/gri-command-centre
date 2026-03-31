/**
 * shopify-sales.js
 * Shared utility for fetching real Shopify order data with source attribution.
 * Used by ads strategist, daily/weekly reports, and morning briefings.
 *
 * This gives the FULL picture — not just Meta-attributed purchases,
 * but ALL orders including Google Ads, organic, direct, email, etc.
 */

const SHOPIFY_STORE = () => process.env.SHOPIFY_STORE_DOMAIN || 'bdd19a-3.myshopify.com'
const SHOPIFY_TOKEN = () => process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || ''

/**
 * Fetch Shopify orders for a given date range (AEST-aware).
 * @param {'yesterday'|'today'|'last_7d'} period
 * @returns {Promise<object|null>}
 */
export async function fetchShopifyOrders(period = 'yesterday') {
  try {
    const token = SHOPIFY_TOKEN()
    const store = SHOPIFY_STORE()
    if (!token || !store) {
      console.warn('[ShopifySales] Missing SHOPIFY_ADMIN_ACCESS_TOKEN or SHOPIFY_STORE_DOMAIN')
      return null
    }

    const { startISO, endISO } = getDateRange(period)
    console.log(`[ShopifySales] Fetching orders (${period}): ${startISO} to ${endISO}`)

    // Paginate through all orders
    let allOrders = []
    let url = `https://${store}/admin/api/2024-01/orders.json?status=any&created_at_min=${startISO}&created_at_max=${endISO}&limit=250`

    while (url) {
      const response = await fetch(url, {
        headers: {
          'X-Shopify-Access-Token': token,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        console.error('[ShopifySales] Shopify API error:', response.status)
        return null
      }

      const data = await response.json()
      allOrders = allOrders.concat(data.orders || [])

      // Check for next page via Link header
      const linkHeader = response.headers.get('Link') || ''
      const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/)
      url = nextMatch ? nextMatch[1] : null
    }

    return processOrders(allOrders, period)
  } catch (e) {
    console.error('[ShopifySales] Error:', e.message)
    return null
  }
}

/**
 * Process raw Shopify orders into structured sales data with source attribution.
 */
function processOrders(orders, period) {
  // Filter out cancelled/refunded orders for accurate count
  const validOrders = orders.filter(o =>
    o.financial_status !== 'refunded' &&
    o.financial_status !== 'voided' &&
    o.cancelled_at === null
  )

  const totalRevenue = validOrders.reduce((sum, o) => sum + parseFloat(o.total_price || 0), 0)
  const totalOrders = validOrders.length

  // Source attribution breakdown
  const sourceBreakdown = {}
  const channelBreakdown = { meta: 0, google: 0, organic: 0, direct: 0, email: 0, other: 0 }

  for (const order of validOrders) {
    const source = classifyOrderSource(order)
    if (!sourceBreakdown[source.label]) {
      sourceBreakdown[source.label] = { orders: 0, revenue: 0 }
    }
    sourceBreakdown[source.label].orders++
    sourceBreakdown[source.label].revenue += parseFloat(order.total_price || 0)
    channelBreakdown[source.channel]++
  }

  // Product breakdown
  const productSales = {}
  for (const order of validOrders) {
    for (const item of order.line_items || []) {
      const title = item.title || 'Unknown'
      if (!productSales[title]) {
        productSales[title] = { name: title, quantity: 0, revenue: 0 }
      }
      productSales[title].quantity += item.quantity
      productSales[title].revenue += parseFloat(item.price) * item.quantity
    }
  }

  const topProducts = Object.values(productSales)
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 5)

  // Location breakdown
  const locationSales = {}
  for (const order of validOrders) {
    const state = order.shipping_address?.province || order.billing_address?.province || null
    const city = order.shipping_address?.city || order.billing_address?.city || null
    const key = state || city || 'Unknown'
    if (!locationSales[key]) locationSales[key] = { orders: 0, revenue: 0 }
    locationSales[key].orders++
    locationSales[key].revenue += parseFloat(order.total_price || 0)
  }

  const topLocations = Object.entries(locationSales)
    .sort((a, b) => b[1].orders - a[1].orders)
    .slice(0, 5)
    .map(([location, data]) => ({ location, ...data }))

  // Average order value
  const aov = totalOrders > 0 ? totalRevenue / totalOrders : 0

  return {
    period,
    totalOrders,
    totalRevenue,
    aov,
    sourceBreakdown,
    channelBreakdown,
    topProducts,
    topLocations,
    orders: validOrders.map(o => ({
      id: o.id,
      name: o.name,
      totalPrice: parseFloat(o.total_price || 0),
      source: classifyOrderSource(o),
      createdAt: o.created_at,
      financialStatus: o.financial_status
    }))
  }
}

/**
 * Classify an order's traffic source from Shopify's attribution fields.
 * Shopify provides: source_name, referring_site, landing_site, source_url
 */
function classifyOrderSource(order) {
  const sourceName = (order.source_name || '').toLowerCase()
  const referringSite = (order.referring_site || '').toLowerCase()
  const landingSite = (order.landing_site || '').toLowerCase()

  // Meta / Facebook / Instagram
  if (
    referringSite.includes('facebook') ||
    referringSite.includes('instagram') ||
    referringSite.includes('fb.') ||
    referringSite.includes('fbclid') ||
    landingSite.includes('fbclid') ||
    landingSite.includes('utm_source=facebook') ||
    landingSite.includes('utm_source=ig') ||
    landingSite.includes('utm_source=meta')
  ) {
    return { channel: 'meta', label: 'Meta Ads (Facebook/Instagram)' }
  }

  // Google Ads (paid)
  if (
    referringSite.includes('googleads') ||
    landingSite.includes('gclid') ||
    landingSite.includes('utm_source=google') && landingSite.includes('utm_medium=cpc') ||
    landingSite.includes('utm_medium=ppc')
  ) {
    return { channel: 'google', label: 'Google Ads' }
  }

  // Google organic
  if (
    referringSite.includes('google') ||
    landingSite.includes('utm_source=google') && !landingSite.includes('cpc')
  ) {
    return { channel: 'organic', label: 'Google Organic' }
  }

  // Email / Klaviyo
  if (
    referringSite.includes('klaviyo') ||
    landingSite.includes('utm_source=klaviyo') ||
    landingSite.includes('utm_medium=email') ||
    referringSite.includes('email')
  ) {
    return { channel: 'email', label: 'Email (Klaviyo)' }
  }

  // Bing / Microsoft
  if (referringSite.includes('bing') || landingSite.includes('msclkid')) {
    return { channel: 'other', label: 'Bing' }
  }

  // TikTok
  if (
    referringSite.includes('tiktok') ||
    landingSite.includes('utm_source=tiktok')
  ) {
    return { channel: 'other', label: 'TikTok' }
  }

  // Direct (no referrer)
  if (!referringSite && !landingSite) {
    return { channel: 'direct', label: 'Direct' }
  }

  // Shopify POS or other Shopify sources
  if (sourceName === 'pos' || sourceName === 'shopify_draft_order') {
    return { channel: 'other', label: 'Shopify POS/Manual' }
  }

  // Other referrers
  if (referringSite) {
    return { channel: 'other', label: `Referral (${new URL('https://' + referringSite).hostname})` }
  }

  return { channel: 'other', label: 'Other' }
}

/**
 * Calculate AEST date ranges for Shopify API queries.
 */
function getDateRange(period) {
  const aestOffset = 10 * 60 * 60 * 1000
  const now = new Date()
  const aestNow = new Date(now.getTime() + aestOffset)

  let start, end

  if (period === 'yesterday') {
    start = new Date(aestNow)
    start.setDate(start.getDate() - 1)
    start.setHours(0, 0, 0, 0)
    end = new Date(start)
    end.setHours(23, 59, 59, 999)
  } else if (period === 'today') {
    start = new Date(aestNow)
    start.setHours(0, 0, 0, 0)
    end = new Date(aestNow)
  } else if (period === 'last_7d') {
    end = new Date(aestNow)
    end.setDate(end.getDate() - 1)
    end.setHours(23, 59, 59, 999)
    start = new Date(end)
    start.setDate(start.getDate() - 6)
    start.setHours(0, 0, 0, 0)
  } else if (period === 'last_14d') {
    end = new Date(aestNow)
    end.setDate(end.getDate() - 1)
    end.setHours(23, 59, 59, 999)
    start = new Date(end)
    start.setDate(start.getDate() - 13)
    start.setHours(0, 0, 0, 0)
  } else {
    // Default to yesterday
    start = new Date(aestNow)
    start.setDate(start.getDate() - 1)
    start.setHours(0, 0, 0, 0)
    end = new Date(start)
    end.setHours(23, 59, 59, 999)
  }

  // Convert back from AEST to UTC for Shopify API
  return {
    startISO: new Date(start.getTime() - aestOffset).toISOString(),
    endISO: new Date(end.getTime() - aestOffset).toISOString()
  }
}

/**
 * Format Shopify sales data as a text summary for Claude prompts.
 */
export function formatShopifySalesForPrompt(shopifyData) {
  if (!shopifyData) return 'SHOPIFY DATA: Unavailable (API not configured or error)'

  let text = `=== ACTUAL SHOPIFY ORDERS (${shopifyData.period}) ===\n`
  text += `Total Orders: ${shopifyData.totalOrders}\n`
  text += `Total Revenue: $${shopifyData.totalRevenue.toFixed(2)} AUD\n`
  text += `Average Order Value: $${shopifyData.aov.toFixed(2)} AUD\n\n`

  text += `SOURCE ATTRIBUTION BREAKDOWN:\n`
  const sorted = Object.entries(shopifyData.sourceBreakdown)
    .sort((a, b) => b[1].orders - a[1].orders)
  for (const [source, data] of sorted) {
    const pct = shopifyData.totalOrders > 0
      ? ((data.orders / shopifyData.totalOrders) * 100).toFixed(0)
      : 0
    text += `  ${source}: ${data.orders} orders ($${data.revenue.toFixed(2)}) — ${pct}%\n`
  }

  text += `\nCHANNEL SUMMARY:\n`
  const ch = shopifyData.channelBreakdown
  text += `  Meta (Facebook/Instagram): ${ch.meta} orders\n`
  text += `  Google Ads: ${ch.google} orders\n`
  text += `  Organic Search: ${ch.organic} orders\n`
  text += `  Direct: ${ch.direct} orders\n`
  text += `  Email: ${ch.email} orders\n`
  text += `  Other: ${ch.other} orders\n`

  if (shopifyData.topProducts?.length) {
    text += `\nTOP PRODUCTS:\n`
    for (const p of shopifyData.topProducts) {
      text += `  ${p.name}: ${p.quantity} units ($${p.revenue.toFixed(2)})\n`
    }
  }

  if (shopifyData.topLocations?.length) {
    text += `\nTOP LOCATIONS:\n`
    for (const l of shopifyData.topLocations) {
      text += `  ${l.location}: ${l.orders} orders ($${l.revenue.toFixed(2)})\n`
    }
  }

  return text
}
