/**
 * flywheel-webhook.js
 * Handles Shopify orders/paid webhook for the flywheel.
 * Extracts products, UTMs, AOV, joins to Meta ad creative, detects bundles.
 */
import { createHmac } from 'crypto'
import {
  upsertConversion, getConversionByOrderId, logFlywheelEvent
} from './flywheel-store.js'
import { categoriseProduct, detectBundle, calculateAovIntelligence } from './flywheel-engine.js'
import { getAds } from './flywheel-store.js'

// ── HMAC Verification ───────────────────────────────────────────────────────

export function verifyShopifyHmac(body, hmacHeader) {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET || process.env.SHOPIFY_API_SECRET || ''
  if (!secret) {
    console.warn('[Flywheel Webhook] No SHOPIFY_WEBHOOK_SECRET set, skipping HMAC verification')
    return true
  }
  const computed = createHmac('sha256', secret).update(body, 'utf8').digest('base64')
  return computed === hmacHeader
}

// ── Parse UTM params from URL ───────────────────────────────────────────────

function parseUtmParams(url) {
  if (!url) return {}
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://example.com${url}`)
    return {
      utmSource: parsed.searchParams.get('utm_source') || null,
      utmMedium: parsed.searchParams.get('utm_medium') || null,
      utmCampaign: parsed.searchParams.get('utm_campaign') || null,
      utmContent: parsed.searchParams.get('utm_content') || null, // This is often the Meta ad ID
      utmTerm: parsed.searchParams.get('utm_term') || null,
      fbclid: parsed.searchParams.get('fbclid') || null,
    }
  } catch {
    return {}
  }
}

// ── Map UTM content to ad creative angle ────────────────────────────────────

function resolveCreativeAngle(utmContent) {
  if (!utmContent) return null
  // UTM content often contains the ad ID or a creative label
  const ads = getAds()
  const matched = ads.find(a =>
    (a.metaAdId && a.metaAdId === utmContent) ||
    (a.id && a.id === utmContent) ||
    (a.name && a.name.toLowerCase().includes(utmContent.toLowerCase()))
  )
  return matched?.creativeAngle || null
}

// ── Process Shopify Order ───────────────────────────────────────────────────

export function processShopifyOrder(order) {
  try {
    const orderId = String(order.id || order.order_number)

    // Check for duplicate
    const existing = getConversionByOrderId(orderId)
    if (existing) {
      console.log(`[Flywheel] Order ${orderId} already processed, skipping`)
      return existing
    }

    // Extract products
    const products = (order.line_items || []).map(item => ({
      id: String(item.product_id || ''),
      title: item.title || item.name || '',
      price: parseFloat(item.price || 0),
      quantity: item.quantity || 1,
      category: categoriseProduct(item.title || item.name || ''),
      sku: item.sku || '',
      variantTitle: item.variant_title || '',
    }))

    // Calculate AOV
    const aov = parseFloat(order.total_price || order.subtotal_price || 0)

    // Parse UTMs from landing site or referring URL
    const landingSite = order.landing_site || order.landing_site_ref || ''
    const referringSite = order.referring_site || ''
    const utms = {
      ...parseUtmParams(landingSite),
      ...parseUtmParams(referringSite),
    }

    // Also check note_attributes for UTM data (some Shopify themes store it here)
    if (order.note_attributes) {
      for (const attr of order.note_attributes) {
        const key = (attr.name || '').toLowerCase()
        if (key === 'utm_source' && !utms.utmSource) utms.utmSource = attr.value
        if (key === 'utm_medium' && !utms.utmMedium) utms.utmMedium = attr.value
        if (key === 'utm_campaign' && !utms.utmCampaign) utms.utmCampaign = attr.value
        if (key === 'utm_content' && !utms.utmContent) utms.utmContent = attr.value
      }
    }

    // Detect bundle
    const bundleDetected = detectBundle(products)

    // Resolve creative angle from UTM content (Meta ad ID)
    const creativeAngle = resolveCreativeAngle(utms.utmContent)

    // Get customer location
    const shipping = order.shipping_address || order.billing_address || {}

    const conversion = upsertConversion({
      shopifyOrderId: orderId,
      adId: utms.utmContent || null, // Meta ad ID from UTM content
      metaAdSetId: null, // Will be resolved during meta-sync
      metaCampaignId: utms.utmCampaign || null,
      orderedAt: order.created_at || new Date().toISOString(),
      aov,
      products,
      bundleDetected,
      utmSource: utms.utmSource,
      utmMedium: utms.utmMedium,
      utmCampaign: utms.utmCampaign,
      utmContent: utms.utmContent,
      creativeAngle,
      customerCity: shipping.city || null,
      customerState: shipping.province || shipping.state || null,
      customerCountry: shipping.country_code || 'AU',
      orderName: order.name || `#${orderId}`,
      financialStatus: order.financial_status || 'paid',
    })

    // Log the flywheel event
    const productSummary = products.map(p => `${p.title} ($${p.price})`).join(', ')
    logFlywheelEvent('conversion', {
      orderId,
      aov,
      products: productSummary,
      bundle: bundleDetected,
      source: utms.utmSource || 'direct',
      creativeAngle: creativeAngle || 'unknown',
    })

    console.log(`[Flywheel] Processed order ${orderId}: AOV $${aov}, ${products.length} items, bundle=${bundleDetected}, source=${utms.utmSource || 'direct'}`)

    // Recalculate AOV intelligence asynchronously
    setTimeout(() => {
      try { calculateAovIntelligence() } catch (e) {
        console.error('[Flywheel] AOV recalc error:', e.message)
      }
    }, 1000)

    return conversion
  } catch (err) {
    console.error('[Flywheel] Error processing order:', err.message)
    logFlywheelEvent('error', `Failed to process order: ${err.message}`)
    return null
  }
}
