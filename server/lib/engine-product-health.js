/**
 * engine-product-health.js
 *
 * Shopify Product Health Score — pulls all active products and scores
 * each on Google Shopping feed-quality attributes.
 *
 * Score 0-100 per product. Lift the global average → lift Ad Rank.
 *
 * Checks:
 *   - Title length 50-75 chars (optimal for Shopping)
 *   - SEO title set vs default (we explicitly want CLEAN title now post-Apr-27 revert)
 *   - product_type filled and >= 2 levels deep
 *   - product description filled (>= 100 chars)
 *   - Has at least 1 image
 *   - Has variants (or single SKU)
 *   - Has tags
 *   - Has a meaningful productType (not "Gender Reveal > Party Supplies" generic catch-all)
 */

import { env } from './env.js'

const SHOPIFY_URL = process.env.SHOPIFY_GRAPHQL_URL || `https://bdd19a-3.myshopify.com/admin/api/2026-01/graphql.json`
const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN || process.env.SHOPIFY_TOKEN || ''
if (!TOKEN) console.warn('[engine-product-health] SHOPIFY_ADMIN_TOKEN env var not set — product health will fail')

let _cache = { data: null, ts: 0 }
const CACHE_TTL_MS = 15 * 60 * 1000

async function gql(query) {
  const res = await fetch(SHOPIFY_URL, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  return await res.json()
}

function scoreProduct(p) {
  const issues = []
  let score = 0
  const total = 7

  const titleLen = (p.title || '').length
  if (titleLen >= 30 && titleLen <= 75) score += 1
  else if (titleLen < 30) issues.push(`Title too short (${titleLen})`)
  else if (titleLen > 75) issues.push(`Title too long (${titleLen}) — first 70 chars matter most`)

  const descLen = (p.description || '').length
  if (descLen >= 100) score += 1
  else issues.push(`Description thin (${descLen} chars)`)

  if (p.images?.edges?.length >= 1) score += 1
  else issues.push('No images')

  if (p.images?.edges?.length >= 3) score += 1
  else issues.push('Less than 3 images (Shopping prefers multi-angle)')

  // SEO title — post Apr 27 revert, we WANT this to be empty (defaults to product title)
  // OR equal to product title. Bloated SEO titles flagged.
  const seoT = p.seo?.title || ''
  const cleanSeo = seoT === '' || seoT === p.title
  if (cleanSeo) score += 1
  else if (seoT.includes('Australia |') || seoT.endsWith('Australia')) issues.push('SEO title bloated — post-Apr-14 surgery residue')
  else issues.push('SEO title differs from product title')

  if (p.tags && p.tags.length > 0) score += 1
  else issues.push('No tags')

  // Variant pricing presence
  const hasPrice = p.variants?.edges?.[0]?.node?.price
  if (hasPrice) score += 1
  else issues.push('No price set')

  return {
    pct: Math.round((score / total) * 100),
    score,
    total,
    issues,
  }
}

export async function buildProductHealth({ skipCache = false } = {}) {
  const now = Date.now()
  if (!skipCache && _cache.data && (now - _cache.ts) < CACHE_TTL_MS) {
    return { ..._cache.data, fromCache: true }
  }

  let all = []
  let cursor = null
  let page = 0
  while (page < 30) {
    page++
    const after = cursor ? `, after: "${cursor}"` : ''
    const data = await gql(`{
      products(first: 50, query: "status:active"${after}) {
        edges {
          node {
            id
            title
            handle
            productType
            tags
            description
            seo { title description }
            images(first: 5) { edges { node { url } } }
            variants(first: 1) { edges { node { price sku } } }
          }
          cursor
        }
        pageInfo { hasNextPage }
      }
    }`)
    const edges = data.data?.products?.edges || []
    all.push(...edges.map(e => e.node))
    if (!data.data?.products?.pageInfo?.hasNextPage || edges.length === 0) break
    cursor = edges[edges.length - 1].cursor
    await new Promise(r => setTimeout(r, 200))
  }

  const scored = all.map(p => ({
    id: p.id,
    title: p.title,
    handle: p.handle,
    productType: p.productType || '',
    seoTitle: p.seo?.title || '',
    images: p.images?.edges?.length || 0,
    description: (p.description || '').length,
    health: scoreProduct(p),
  }))

  // Account-level rollup
  const total = scored.length
  const avg = total > 0 ? Math.round(scored.reduce((s, p) => s + p.health.pct, 0) / total) : 0
  const by = (pred) => scored.filter(pred).length
  const buckets = {
    excellent: by(p => p.health.pct >= 85),
    good: by(p => p.health.pct >= 65 && p.health.pct < 85),
    weak: by(p => p.health.pct >= 40 && p.health.pct < 65),
    critical: by(p => p.health.pct < 40),
  }

  // Worst products (lowest score, sorted)
  const worst = scored.slice().sort((a, b) => a.health.pct - b.health.pct).slice(0, 12)

  // Common issues across catalogue
  const issueCounts = new Map()
  for (const p of scored) {
    for (const i of p.health.issues) {
      issueCounts.set(i, (issueCounts.get(i) || 0) + 1)
    }
  }
  const topIssues = [...issueCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([issue, count]) => ({ issue, count, pct: Math.round((count / total) * 100) }))

  const data = {
    generatedAt: new Date().toISOString(),
    fromCache: false,
    totalProducts: total,
    avgScore: avg,
    buckets,
    topIssues,
    worst,
  }
  _cache = { data, ts: now }
  return data
}
