/**
 * link-validator.js
 * ─────────────────────────────────────────────────────────────
 * Validates every <a href="..."> in an article body before publish.
 *
 * What it does:
 * 1. Extracts all internal + external URLs from the HTML
 * 2. HEAD-checks every URL (GET fallback if HEAD returns 405)
 * 3. For genderrevealideas.com.au product/collection URLs that 404,
 *    attempts to auto-fix the slug by fuzzy-matching against the
 *    live Shopify product/collection list
 * 4. Reports any remaining dead links and returns a repaired body
 *    or a blocking error
 *
 * BLOCK RULE: if any internal URL is still dead after repair,
 * the pipeline MUST NOT publish.
 * ─────────────────────────────────────────────────────────────
 */

const SHOPIFY_STORE = () => process.env.SHOPIFY_STORE_DOMAIN || 'bdd19a-3.myshopify.com'
const SHOPIFY_TOKEN = () => process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || ''

// Known safe brand hostnames
const BRAND_HOSTS = ['genderrevealideas.com.au', 'www.genderrevealideas.com.au']

/**
 * @returns {Promise<{
 *   ok: boolean,
 *   body: string,
 *   deadLinks: Array<{url: string, status: number}>,
 *   repairs: Array<{from: string, to: string}>,
 *   totalChecked: number
 * }>}
 */
export async function validateAndRepairLinks(body, { allowExternal = false } = {}) {
  const urls = extractUrls(body)
  console.log(`[LinkValidator] Found ${urls.length} links to validate`)
  if (urls.length === 0) return { ok: true, body, deadLinks: [], repairs: [], totalChecked: 0 }

  // Live Shopify handle catalog for fuzzy repair
  const handleCatalog = await loadHandleCatalog()

  const deadLinks = []
  const repairs = []
  let repairedBody = body

  for (const url of urls) {
    const status = await checkUrl(url)
    if (status.ok) continue

    // Attempt auto-repair for internal brand URLs
    if (isBrandUrl(url)) {
      const repaired = await repairBrandUrl(url, handleCatalog)
      if (repaired && repaired !== url) {
        const repairStatus = await checkUrl(repaired)
        if (repairStatus.ok) {
          console.log(`[LinkValidator] Repaired: ${url} -> ${repaired}`)
          repairedBody = replaceUrl(repairedBody, url, repaired)
          repairs.push({ from: url, to: repaired })
          continue
        }
      }
    }

    deadLinks.push({ url, status: status.code })
    console.warn(`[LinkValidator] DEAD: ${url} (${status.code})`)
  }

  // Block policy: any dead internal link fails the run.
  const deadInternal = deadLinks.filter(d => isBrandUrl(d.url))
  const deadExternal = deadLinks.filter(d => !isBrandUrl(d.url))

  if (deadInternal.length > 0) {
    return {
      ok: false,
      body: repairedBody,
      deadLinks,
      repairs,
      totalChecked: urls.length,
    }
  }

  // External dead links: only block if explicitly not allowed
  if (!allowExternal && deadExternal.length > 0) {
    return {
      ok: false,
      body: repairedBody,
      deadLinks,
      repairs,
      totalChecked: urls.length,
    }
  }

  return { ok: true, body: repairedBody, deadLinks, repairs, totalChecked: urls.length }
}

// ────────────────────────────────────────────────────────────
// URL extraction
// ────────────────────────────────────────────────────────────

function extractUrls(body) {
  const hrefs = new Set()
  const re = /<a[^>]+href="([^"]+)"/gi
  let m
  while ((m = re.exec(body)) !== null) {
    let url = m[1]
    if (!url) continue
    if (url.startsWith('#')) continue // anchors
    if (url.startsWith('mailto:')) continue
    if (url.startsWith('tel:')) continue
    if (url.startsWith('/')) url = `https://${BRAND_HOSTS[0]}${url}`
    hrefs.add(url)
  }
  return [...hrefs]
}

function replaceUrl(body, from, to) {
  const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return body.replace(new RegExp(`href="${escaped}"`, 'g'), `href="${to}"`)
}

function isBrandUrl(url) {
  try { return BRAND_HOSTS.includes(new URL(url).host) }
  catch { return false }
}

// ────────────────────────────────────────────────────────────
// HEAD check with GET fallback
// ────────────────────────────────────────────────────────────

async function checkUrl(url) {
  try {
    const head = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GRI-blog-link-check/1.0)' },
    })
    if (head.ok) return { ok: true, code: head.status }
    if (head.status === 405 || head.status === 501) {
      // HEAD not allowed; fall through to GET
    } else if (head.status >= 400) {
      // Try GET in case the server serves soft-404 differently
    } else {
      return { ok: false, code: head.status }
    }
  } catch {}

  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GRI-blog-link-check/1.0)' },
    })
    return { ok: res.ok, code: res.status }
  } catch (e) {
    return { ok: false, code: 0 }
  }
}

// ────────────────────────────────────────────────────────────
// Handle catalog for fuzzy repair of brand URLs
// ────────────────────────────────────────────────────────────

let catalogMemo = null

async function loadHandleCatalog() {
  if (catalogMemo && Date.now() - catalogMemo.at < 60 * 60 * 1000) return catalogMemo.data

  const token = SHOPIFY_TOKEN()
  const store = SHOPIFY_STORE()
  if (!token || !store) return { products: [], collections: [] }

  const query = `
    query HandleCatalog {
      products(first: 250, query: "status:active") {
        edges { node { handle title } }
      }
      collections(first: 100) {
        edges { node { handle title } }
      }
    }
  `

  try {
    const res = await fetch(`https://${store}/admin/api/2025-01/graphql.json`, {
      method: 'POST',
      headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    })
    if (!res.ok) return { products: [], collections: [] }
    const json = await res.json()
    const products = (json.data?.products?.edges || []).map(e => e.node)
    const collections = (json.data?.collections?.edges || []).map(e => e.node)
    catalogMemo = { at: Date.now(), data: { products, collections } }
    return catalogMemo.data
  } catch (e) {
    console.warn('[LinkValidator] Handle catalog load failed:', e.message)
    return { products: [], collections: [] }
  }
}

async function repairBrandUrl(url, catalog) {
  let parsed
  try { parsed = new URL(url) } catch { return null }

  const path = parsed.pathname

  // Only try to repair product / collection URLs
  const productMatch = path.match(/^\/products\/([^/?#]+)/)
  const collectionMatch = path.match(/^\/collections\/([^/?#]+)/)

  if (productMatch) {
    const badSlug = productMatch[1]
    const best = fuzzyBestHandle(badSlug, catalog.products)
    if (best) return `https://${BRAND_HOSTS[0]}/products/${best.handle}`
  } else if (collectionMatch) {
    const badSlug = collectionMatch[1]
    const best = fuzzyBestHandle(badSlug, catalog.collections)
    if (best) return `https://${BRAND_HOSTS[0]}/collections/${best.handle}`
  }
  return null
}

function fuzzyBestHandle(badSlug, options) {
  if (!options || options.length === 0) return null
  const bad = badSlug.toLowerCase()
  let best = null
  let bestScore = 0
  for (const opt of options) {
    const good = opt.handle.toLowerCase()
    // Exact match short-circuit
    if (good === bad) return opt
    const score = similarity(bad, good)
    if (score > bestScore) {
      bestScore = score
      best = opt
    }
  }
  return bestScore >= 0.6 ? best : null
}

// Simple similarity: longest common substring ratio on token level
function similarity(a, b) {
  const ta = new Set(a.split('-'))
  const tb = new Set(b.split('-'))
  let common = 0
  for (const t of ta) if (tb.has(t)) common++
  const denom = Math.max(ta.size, tb.size)
  if (denom === 0) return 0
  return common / denom
}
