/**
 * shopify-bestsellers.js
 * ─────────────────────────────────────────────────────────────
 * Fetches the top 100 best-selling active products from Shopify
 * based on the last 60 days of paid orders.
 *
 * Used by the blog autopublish pipeline so every article links
 * to products that are actually selling RIGHT NOW — not stale
 * inventory or archived SKUs.
 *
 * Strategy: paginate orders (last 60d), aggregate line-items by
 * productId, sort by units sold desc, then enrich the top N with
 * GraphQL product detail (handle, status, price, hero image).
 * Active-only is enforced via product.status === 'ACTIVE'.
 *
 * Results are cached to disk for 6h so repeat calls in the same
 * day are free.
 * ─────────────────────────────────────────────────────────────
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { dirname } from 'path'
import { dataFile } from './data-dir.js'

const CACHE_FILE = dataFile('blog-autopublish/bestsellers-cache.json')
const CACHE_TTL_MS = 6 * 60 * 60 * 1000 // 6h

const SHOPIFY_STORE = () => process.env.SHOPIFY_STORE_DOMAIN || 'bdd19a-3.myshopify.com'
const SHOPIFY_TOKEN = () => process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || ''

/**
 * @returns {Promise<Array<{
 *   productId: string,
 *   title: string,
 *   handle: string,
 *   url: string,
 *   price: string,
 *   compareAtPrice: string|null,
 *   imageUrl: string|null,
 *   unitsSold60d: number,
 *   revenue60d: number,
 *   status: 'ACTIVE'|'DRAFT'|'ARCHIVED',
 *   productType: string,
 *   vendor: string,
 * }>>}
 */
export async function getTopBestSellers(limit = 100, windowDays = 60, { forceRefresh = false } = {}) {
  if (!forceRefresh) {
    const cached = loadCache(limit, windowDays)
    if (cached) {
      console.log(`[BestSellers] Using cached list (${cached.length} products, age ${cached._ageMin} min)`)
      return cached
    }
  }

  const token = SHOPIFY_TOKEN()
  const store = SHOPIFY_STORE()
  if (!token || !store) {
    console.warn('[BestSellers] Missing SHOPIFY_ADMIN_ACCESS_TOKEN or SHOPIFY_STORE_DOMAIN')
    return []
  }

  console.log(`[BestSellers] Fetching top ${limit} products from last ${windowDays} days`)

  // ── 1. Pull orders for the window ───────────────────────────
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString()
  const orders = await fetchAllOrdersSince(store, token, since)
  console.log(`[BestSellers] Fetched ${orders.length} orders since ${since.slice(0, 10)}`)

  // ── 2. Aggregate line items by productId ────────────────────
  const agg = {}
  for (const order of orders) {
    // Skip cancelled / refunded / voided
    if (order.cancelled_at) continue
    if (order.financial_status === 'voided') continue
    for (const line of order.line_items || []) {
      const pid = line.product_id
      if (!pid) continue
      const qty = Number(line.quantity) || 0
      const revenue = (Number(line.price) || 0) * qty
      if (!agg[pid]) agg[pid] = { productId: pid, title: line.title, units: 0, revenue: 0 }
      agg[pid].units += qty
      agg[pid].revenue += revenue
    }
  }

  const ranked = Object.values(agg)
    .sort((a, b) => b.units - a.units)
    .slice(0, Math.max(limit, 20))

  if (ranked.length === 0) {
    console.warn('[BestSellers] No product sales found in window')
    return []
  }

  // ── 3. Enrich with product detail via GraphQL ───────────────
  const enriched = await enrichProducts(store, token, ranked)
  const activeOnly = enriched
    .filter(p => p.status === 'ACTIVE')
    .filter(p => !isUtilityProduct(p))
    .slice(0, limit)

  saveCache(activeOnly, limit, windowDays)
  console.log(`[BestSellers] Returning ${activeOnly.length} ACTIVE best-sellers`)
  return activeOnly
}

// ────────────────────────────────────────────────────────────
// Paginate orders via REST (GraphQL orders pagination is more
// complex and slower for this use case — we only need line items)
// ────────────────────────────────────────────────────────────

async function fetchAllOrdersSince(store, token, sinceISO) {
  const all = []
  let url = `https://${store}/admin/api/2024-01/orders.json?status=any&created_at_min=${sinceISO}&limit=250&fields=id,cancelled_at,financial_status,line_items`

  let pages = 0
  while (url && pages < 50) { // safety cap: 50 pages * 250 = 12.5k orders
    pages++
    const res = await fetch(url, {
      headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
    })
    if (!res.ok) {
      console.error(`[BestSellers] Order fetch ${res.status}`)
      break
    }
    const data = await res.json()
    all.push(...(data.orders || []))

    const link = res.headers.get('Link') || ''
    const next = link.match(/<([^>]+)>;\s*rel="next"/)
    url = next ? next[1] : null
  }
  return all
}

// ────────────────────────────────────────────────────────────
// Enrich the ranked list with handle, price, status, hero image
// via a single batched GraphQL query
// ────────────────────────────────────────────────────────────

async function enrichProducts(store, token, ranked) {
  const gids = ranked.map(r => `gid://shopify/Product/${r.productId}`)

  const query = `
    query BestSellerDetails($ids: [ID!]!) {
      nodes(ids: $ids) {
        ... on Product {
          id
          title
          handle
          status
          productType
          vendor
          onlineStoreUrl
          featuredImage { url altText }
          priceRangeV2 { minVariantPrice { amount currencyCode } }
          compareAtPriceRange { minVariantCompareAtPrice { amount } }
        }
      }
    }
  `

  const res = await fetch(`https://${store}/admin/api/2025-01/graphql.json`, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { ids: gids } }),
  })

  if (!res.ok) {
    console.error(`[BestSellers] GraphQL enrich ${res.status}`)
    return []
  }

  const json = await res.json()
  const nodes = json.data?.nodes || []

  return ranked.map((r, i) => {
    const n = nodes[i]
    if (!n || !n.id) return null
    const numericId = n.id.split('/').pop()
    return {
      productId: numericId,
      title: n.title,
      handle: n.handle,
      url: n.onlineStoreUrl || `https://genderrevealideas.com.au/products/${n.handle}`,
      price: n.priceRangeV2?.minVariantPrice?.amount || null,
      compareAtPrice: n.compareAtPriceRange?.minVariantCompareAtPrice?.amount || null,
      imageUrl: n.featuredImage?.url || null,
      imageAlt: n.featuredImage?.altText || n.title,
      unitsSold60d: r.units,
      revenue60d: Math.round(r.revenue * 100) / 100,
      status: n.status,
      productType: n.productType || '',
      vendor: n.vendor || '',
    }
  }).filter(Boolean)
}

// Exclude non-article-worthy utility products (shipping protection,
// free gift packs, internal SKUs) from the recommendation list.
function isUtilityProduct(p) {
  const title = (p.title || '').toLowerCase()
  const type = (p.productType || '').toLowerCase()
  if (!p.price || Number(p.price) <= 0) return true
  if (title.startsWith('[free]')) return true
  if (title.includes('shipping protection')) return true
  if (title.includes('gift card')) return true
  if (type.includes('shipping')) return true
  if (type.includes('service')) return true
  return false
}

// ────────────────────────────────────────────────────────────
// Cache helpers
// ────────────────────────────────────────────────────────────

function loadCache(limit, windowDays) {
  try {
    if (!existsSync(CACHE_FILE)) return null
    const raw = JSON.parse(readFileSync(CACHE_FILE, 'utf-8'))
    if (!raw?.fetchedAt) return null
    if (raw.limit !== limit || raw.windowDays !== windowDays) return null
    const age = Date.now() - new Date(raw.fetchedAt).getTime()
    if (age > CACHE_TTL_MS) return null
    raw.products._ageMin = Math.round(age / 60000)
    return raw.products
  } catch { return null }
}

function saveCache(products, limit, windowDays) {
  try {
    mkdirSync(dirname(CACHE_FILE), { recursive: true })
    writeFileSync(CACHE_FILE, JSON.stringify({
      fetchedAt: new Date().toISOString(),
      limit,
      windowDays,
      products,
    }, null, 2))
  } catch (e) {
    console.warn('[BestSellers] Failed to save cache:', e.message)
  }
}

/**
 * Filter best-sellers to products semantically relevant to a keyword.
 * Uses simple token overlap — good enough for cannon/blaster/smoke etc.
 */
export function filterRelevantToKeyword(products, keyword, max = 12) {
  const tokens = keyword.toLowerCase().split(/\s+/).filter(t => t.length > 2)
  if (tokens.length === 0) return products.slice(0, max)

  const scored = products.map(p => {
    const hay = `${p.title} ${p.productType} ${p.handle}`.toLowerCase()
    const score = tokens.reduce((s, t) => s + (hay.includes(t) ? 1 : 0), 0)
    return { ...p, _relevance: score }
  })

  scored.sort((a, b) => b._relevance - a._relevance || b.unitsSold60d - a.unitsSold60d)
  const relevant = scored.filter(p => p._relevance > 0).slice(0, max)
  if (relevant.length >= 3) return relevant
  // Fallback: return top best-sellers even if no keyword match
  return scored.slice(0, max)
}
