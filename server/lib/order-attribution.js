/**
 * order-attribution.js
 *
 * SINGLE SOURCE OF TRUTH for which platform gets credit for a Shopify order.
 *
 * Every other module that needs "Meta orders" / "Google orders" / "organic
 * orders" MUST go through classifyOrder() so we never double-count between
 * Meta pixel-attributed conversions and Google tag-attributed conversions.
 *
 * Approach: last-non-direct-click model based on first-party signals on the
 * Shopify order itself (gclid / fbclid / utm_source / utm_medium / referring
 * site). One order → exactly one platform. Spend stays sourced from each
 * ad-platform API; orders/revenue are owned by Shopify and Shopify alone.
 *
 * Returns:
 *   {
 *     platform: 'meta' | 'google_paid' | 'google_organic' | 'email' | 'tiktok'
 *               | 'bing' | 'direct' | 'referral' | 'pos' | 'other',
 *     confidence: 'high' | 'medium' | 'low',
 *     signals: { gclid, fbclid, utmSource, utmMedium, utmCampaign, utmContent, referringSite },
 *     reason: string,  // human-readable why we picked this platform
 *   }
 *
 * Precedence (highest signal wins, so an order with BOTH gclid and fbclid
 * is awarded to whichever click-id is in the LANDING url — that is the
 * actual last click that produced the session):
 *   1. Click IDs in landing_site (gclid → google_paid, fbclid → meta)
 *   2. UTM source+medium in landing_site
 *   3. Referring site (facebook.com → meta, google.com → google_organic, …)
 *   4. note_attributes UTMs (themes that store post-hoc UTMs)
 *   5. Shopify source_name (pos, draft_order)
 *   6. Fall through → direct
 */

function safeParseUrl(raw) {
  if (!raw) return null
  try {
    const url = raw.startsWith('http') ? raw : `https://example.com${raw.startsWith('/') ? raw : '/' + raw}`
    return new URL(url)
  } catch {
    return null
  }
}

function readSignals(order) {
  const landing = order.landing_site || order.landing_site_ref || ''
  const referring = order.referring_site || ''
  const sourceName = (order.source_name || '').toLowerCase()
  const noteAttrs = Array.isArray(order.note_attributes) ? order.note_attributes : []

  const u = safeParseUrl(landing)
  const r = safeParseUrl(referring && referring.startsWith('http') ? referring : `https://${referring}`)

  // Click IDs (highest fidelity — they only land if the user actually clicked
  // the matching ad platform's tracked link).
  let gclid = u?.searchParams.get('gclid') || null
  let gbraid = u?.searchParams.get('gbraid') || null
  let wbraid = u?.searchParams.get('wbraid') || null
  let fbclid = u?.searchParams.get('fbclid') || null
  let msclkid = u?.searchParams.get('msclkid') || null
  let ttclid = u?.searchParams.get('ttclid') || null

  // UTMs from landing
  let utmSource = u?.searchParams.get('utm_source') || null
  let utmMedium = u?.searchParams.get('utm_medium') || null
  let utmCampaign = u?.searchParams.get('utm_campaign') || null
  let utmContent = u?.searchParams.get('utm_content') || null
  let utmTerm = u?.searchParams.get('utm_term') || null

  // Fallback: same params from referring URL
  if (!fbclid && r) fbclid = r.searchParams.get('fbclid') || null
  if (!gclid && r) gclid = r.searchParams.get('gclid') || null

  // note_attributes (themes that capture cookies into the order)
  for (const a of noteAttrs) {
    const k = (a.name || '').toLowerCase()
    if (k === 'utm_source' && !utmSource) utmSource = a.value
    if (k === 'utm_medium' && !utmMedium) utmMedium = a.value
    if (k === 'utm_campaign' && !utmCampaign) utmCampaign = a.value
    if (k === 'utm_content' && !utmContent) utmContent = a.value
    if (k === 'utm_term' && !utmTerm) utmTerm = a.value
    if (k === 'gclid' && !gclid) gclid = a.value
    if (k === 'fbclid' && !fbclid) fbclid = a.value
  }

  return {
    landingSite: landing,
    referringSite: referring,
    sourceName,
    gclid, gbraid, wbraid, fbclid, msclkid, ttclid,
    utmSource: (utmSource || '').toLowerCase() || null,
    utmMedium: (utmMedium || '').toLowerCase() || null,
    utmCampaign: utmCampaign || null,
    utmContent: utmContent || null,
    utmTerm: utmTerm || null,
    referringHost: r?.hostname?.toLowerCase() || (referring || '').replace(/^https?:\/\//, '').split('/')[0].toLowerCase() || null,
  }
}

const META_UTM_SOURCES = new Set(['facebook', 'fb', 'ig', 'instagram', 'meta', 'fb_ads', 'meta_ads', 'facebook_ads', 'instagram_ads'])
const GOOGLE_UTM_SOURCES = new Set(['google', 'google_ads', 'googleads', 'youtube'])
const EMAIL_UTM_SOURCES = new Set(['klaviyo', 'email', 'mailchimp', 'omnisend'])
const META_HOST_PATTERNS = ['facebook.com', 'instagram.com', 'fb.com', 'l.facebook', 'l.instagram', 'lm.facebook', 'm.facebook']
const TIKTOK_HOST_PATTERNS = ['tiktok.com', 't.co/tiktok']

export function classifyOrder(order) {
  const signals = readSignals(order)

  // 1. Click IDs (highest confidence)
  if (signals.gclid || signals.gbraid || signals.wbraid) {
    return { platform: 'google_paid', confidence: 'high', signals, reason: 'gclid/gbraid/wbraid on landing URL' }
  }
  if (signals.fbclid) {
    return { platform: 'meta', confidence: 'high', signals, reason: 'fbclid on landing URL' }
  }
  if (signals.msclkid) {
    return { platform: 'bing', confidence: 'high', signals, reason: 'msclkid on landing URL' }
  }
  if (signals.ttclid) {
    return { platform: 'tiktok', confidence: 'high', signals, reason: 'ttclid on landing URL' }
  }

  // 2. UTM source + medium
  const src = signals.utmSource
  const med = signals.utmMedium

  if (src && META_UTM_SOURCES.has(src)) {
    return { platform: 'meta', confidence: 'high', signals, reason: `utm_source=${src}` }
  }
  if (src && GOOGLE_UTM_SOURCES.has(src)) {
    const paid = med && (med === 'cpc' || med === 'ppc' || med === 'paid' || med.includes('cpc'))
    return paid
      ? { platform: 'google_paid', confidence: 'high', signals, reason: `utm_source=google + paid medium (${med})` }
      : { platform: 'google_organic', confidence: 'medium', signals, reason: `utm_source=google, medium=${med || 'unset'}` }
  }
  if (src && EMAIL_UTM_SOURCES.has(src)) {
    return { platform: 'email', confidence: 'high', signals, reason: `utm_source=${src}` }
  }
  if (src === 'tiktok' || src === 'tiktok_ads') {
    return { platform: 'tiktok', confidence: 'high', signals, reason: `utm_source=${src}` }
  }
  if (src === 'bing' || src === 'microsoft') {
    return { platform: 'bing', confidence: 'high', signals, reason: `utm_source=${src}` }
  }
  // Generic medium=email
  if (med === 'email') {
    return { platform: 'email', confidence: 'medium', signals, reason: 'utm_medium=email' }
  }
  // Generic cpc/ppc with unknown source → treat as paid search
  if (med === 'cpc' || med === 'ppc') {
    return { platform: 'google_paid', confidence: 'low', signals, reason: `utm_medium=${med}, source unknown` }
  }

  // 3. Referring host
  const host = signals.referringHost
  if (host) {
    if (META_HOST_PATTERNS.some(p => host.includes(p))) {
      return { platform: 'meta', confidence: 'medium', signals, reason: `referring host = ${host}` }
    }
    if (TIKTOK_HOST_PATTERNS.some(p => host.includes(p))) {
      return { platform: 'tiktok', confidence: 'medium', signals, reason: `referring host = ${host}` }
    }
    if (host.includes('google.')) {
      return { platform: 'google_organic', confidence: 'medium', signals, reason: `referring host = ${host}` }
    }
    if (host.includes('bing.')) {
      return { platform: 'bing', confidence: 'medium', signals, reason: `referring host = ${host}` }
    }
    if (host.includes('klaviyo') || host.includes('mailchimp') || host.includes('omnisend')) {
      return { platform: 'email', confidence: 'medium', signals, reason: `referring host = ${host}` }
    }
  }

  // 4. Shopify channel hints
  if (signals.sourceName === 'pos') {
    return { platform: 'pos', confidence: 'high', signals, reason: 'source_name=pos' }
  }
  if (signals.sourceName === 'shopify_draft_order') {
    return { platform: 'other', confidence: 'high', signals, reason: 'source_name=shopify_draft_order' }
  }

  // 5. Has a referring host we didn't recognise → referral
  if (host) {
    return { platform: 'referral', confidence: 'low', signals, reason: `unrecognised referring host = ${host}` }
  }

  // 6. Nothing → direct
  return { platform: 'direct', confidence: 'medium', signals, reason: 'no click-id / UTM / referrer' }
}

/**
 * Classify a batch of Shopify orders and aggregate per platform.
 * Returns { byPlatform: { [platform]: { orders, revenue, newCustomers, newRevenue } }, total }
 */
export function aggregateByPlatform(orders, { isNewCustomer } = {}) {
  const byPlatform = {}
  let total = { orders: 0, revenue: 0, newCustomers: 0, newRevenue: 0 }

  for (const o of orders) {
    const { platform } = classifyOrder(o)
    const rev = parseFloat(o.total_price || o.subtotal_price || 0) || 0
    const isNew = isNewCustomer ? !!isNewCustomer(o) : false

    if (!byPlatform[platform]) byPlatform[platform] = { orders: 0, revenue: 0, newCustomers: 0, newRevenue: 0 }
    byPlatform[platform].orders += 1
    byPlatform[platform].revenue += rev
    if (isNew) {
      byPlatform[platform].newCustomers += 1
      byPlatform[platform].newRevenue += rev
    }

    total.orders += 1
    total.revenue += rev
    if (isNew) { total.newCustomers += 1; total.newRevenue += rev }
  }

  // Round to 2dp for readable output
  for (const p of Object.keys(byPlatform)) {
    byPlatform[p].revenue = Math.round(byPlatform[p].revenue * 100) / 100
    byPlatform[p].newRevenue = Math.round(byPlatform[p].newRevenue * 100) / 100
  }
  total.revenue = Math.round(total.revenue * 100) / 100
  total.newRevenue = Math.round(total.newRevenue * 100) / 100

  return { byPlatform, total }
}

/**
 * Convenience: lump platforms into the 3 buckets the Flywheel cards display.
 * 'meta'          → 'meta'
 * 'google_paid'   → 'google'
 * everything else (google_organic, email, direct, referral, pos, tiktok,
 *                  bing, other) → 'organic'
 */
export function rollupToFlywheelBuckets(byPlatform) {
  const buckets = {
    meta:    { orders: 0, revenue: 0, newCustomers: 0, newRevenue: 0 },
    google:  { orders: 0, revenue: 0, newCustomers: 0, newRevenue: 0 },
    organic: { orders: 0, revenue: 0, newCustomers: 0, newRevenue: 0 },
  }
  for (const [platform, v] of Object.entries(byPlatform)) {
    const target = platform === 'meta' ? 'meta'
                 : platform === 'google_paid' ? 'google'
                 : 'organic'
    buckets[target].orders += v.orders
    buckets[target].revenue += v.revenue
    buckets[target].newCustomers += v.newCustomers
    buckets[target].newRevenue += v.newRevenue
  }
  for (const k of Object.keys(buckets)) {
    buckets[k].revenue = Math.round(buckets[k].revenue * 100) / 100
    buckets[k].newRevenue = Math.round(buckets[k].newRevenue * 100) / 100
  }
  return buckets
}
