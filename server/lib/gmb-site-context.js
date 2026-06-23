/**
 * GMB site context fetcher.
 *
 * Pulls live content from genderrevealideas.com.au so GMB descriptions can be
 * grounded in current site data (real prices, real product names, real
 * features) instead of stale hand-written copy. The AI describer pipes the
 * returned pageContent into the prompt; if a fetch fails it falls back to a
 * non-grounded description.
 *
 * Plain regex HTML parsing — we deliberately avoid jsdom to keep the server
 * dependency footprint small. Shopify product pages always include a JSON-LD
 * Product block which gives us a clean structured source for name / price /
 * description; bullets are scraped from the first <ul> in the body as a
 * best-effort feature list.
 *
 * In-memory cache (30-min TTL, keyed by URL) so a burst of posts in the same
 * window doesn't hammer the storefront.
 */
import { dataFile } from './data-dir.js'

const CACHE_TTL_MS = 30 * 60 * 1000
const FETCH_TIMEOUT_MS = 10_000

const cache = new Map()

// Touch dataFile so the import is exercised (and we get a consistent log line
// alongside other server modules) without writing anything yet — leaves the
// door open for an on-disk cache later without changing the public API.
const CACHE_HINT_PATH = dataFile('gmb-site-context-cache.json')
void CACHE_HINT_PATH

function decodeEntities(str) {
  if (!str) return ''
  return String(str)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)))
}

function stripTags(html) {
  if (!html) return ''
  return decodeEntities(String(html).replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()
}

function extractFirst(html, regex) {
  const m = regex.exec(html)
  return m ? m[1] : null
}

function extractTitle(html) {
  const raw = extractFirst(html, /<title[^>]*>([\s\S]*?)<\/title>/i)
  return raw ? stripTags(raw) : null
}

function extractMetaDescription(html) {
  // Match either order of name/content attributes
  const a = /<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/i.exec(html)
  if (a) return decodeEntities(a[1]).trim()
  const b = /<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["'][^>]*>/i.exec(html)
  if (b) return decodeEntities(b[1]).trim()
  return null
}

function extractH1(html) {
  const raw = extractFirst(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i)
  return raw ? stripTags(raw) : null
}

function extractBullets(html, limit = 5) {
  const bullets = []
  const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi
  let m
  while ((m = liRegex.exec(html)) !== null && bullets.length < limit) {
    const text = stripTags(m[1])
    if (text && text.length > 2 && text.length < 400) bullets.push(text)
  }
  return bullets
}

function findProductJsonLd(html) {
  // Walk every JSON-LD block and return the first one whose @type matches Product
  const scriptRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m
  while ((m = scriptRegex.exec(html)) !== null) {
    const raw = m[1].trim()
    if (!raw) continue
    let parsed
    try {
      parsed = JSON.parse(raw)
    } catch {
      continue
    }
    const candidates = Array.isArray(parsed)
      ? parsed
      : parsed && Array.isArray(parsed['@graph'])
        ? parsed['@graph']
        : [parsed]
    for (const node of candidates) {
      if (!node || typeof node !== 'object') continue
      const type = node['@type']
      const matches = Array.isArray(type)
        ? type.some(t => String(t).toLowerCase() === 'product')
        : String(type || '').toLowerCase() === 'product'
      if (matches) return node
    }
  }
  return null
}

function readOffer(offers) {
  if (!offers) return { price: null, priceCurrency: null }
  const o = Array.isArray(offers) ? offers[0] : offers
  if (!o || typeof o !== 'object') return { price: null, priceCurrency: null }
  const price = o.price ?? o.lowPrice ?? null
  const priceCurrency = o.priceCurrency ?? o.priceSpecification?.priceCurrency ?? null
  return {
    price: price == null ? null : String(price),
    priceCurrency: priceCurrency == null ? null : String(priceCurrency),
  }
}

function parseHtml(html) {
  const title = extractTitle(html)
  const metaDescription = extractMetaDescription(html)
  const h1 = extractH1(html)
  const bullets = extractBullets(html, 5)

  const product = findProductJsonLd(html)
  const offer = readOffer(product?.offers)

  return {
    title,
    metaDescription,
    h1,
    productName: product?.name ? stripTags(String(product.name)) : null,
    productPrice: offer.price,
    priceCurrency: offer.priceCurrency,
    productDescription: product?.description ? stripTags(String(product.description)) : null,
    bullets,
  }
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'GRI-Command-Centre/1.0 (+gmb-site-context)',
        Accept: 'text/html,application/xhtml+xml',
      },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Fetch and parse a page from genderrevealideas.com.au (or any URL).
 * Cached for 30 minutes per URL. Returns the parsed structure described in
 * the file header. Throws on network / non-2xx — callers that want graceful
 * fallback should use fetchContextForImage.
 *
 * @param {string} url
 * @returns {Promise<{
 *   title: string|null,
 *   metaDescription: string|null,
 *   h1: string|null,
 *   productName: string|null,
 *   productPrice: string|null,
 *   productDescription: string|null,
 *   bullets: string[],
 *   priceCurrency: string|null,
 * }>}
 */
export async function fetchPageContent(url) {
  if (!url || typeof url !== 'string') throw new Error('fetchPageContent: url required')

  const now = Date.now()
  const hit = cache.get(url)
  if (hit && now - hit.at < CACHE_TTL_MS) return hit.value

  const html = await fetchWithTimeout(url, FETCH_TIMEOUT_MS)
  const value = parseHtml(html)
  cache.set(url, { at: now, value })
  return value
}

function normaliseKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '')
}

/**
 * Pick the URL whose category/match field best fits the given hint.
 * urlMapping is the config array of entries like:
 *   { match: 'tnt', url: 'https://...', button: 'Shop TNT Cannon' }
 *
 * Match strategy (in order): exact category, substring either direction,
 * normalised (alphanumeric-only) equality. Returns the full entry or null.
 *
 * @param {string} categoryHint
 * @param {Array<{ match?: string, category?: string, url: string, button?: string }>} urlMapping
 * @returns {{ match?: string, category?: string, url: string, button?: string }|null}
 */
export function resolveUrlForCategory(categoryHint, urlMapping) {
  if (!Array.isArray(urlMapping) || urlMapping.length === 0) return null
  const hint = String(categoryHint || '').toLowerCase().trim()
  if (!hint) return urlMapping[0] || null

  const keyOf = entry => String(entry.match ?? entry.category ?? '').toLowerCase().trim()

  const exact = urlMapping.find(e => keyOf(e) === hint)
  if (exact) return exact

  const contains = urlMapping.find(e => {
    const k = keyOf(e)
    return k && (hint.includes(k) || k.includes(hint))
  })
  if (contains) return contains

  const nHint = normaliseKey(hint)
  const normalised = urlMapping.find(e => normaliseKey(keyOf(e)) === nHint)
  if (normalised) return normalised

  return null
}

function inferCategoryFromFilename(imageFilename) {
  const name = String(imageFilename || '').toLowerCase()
  if (!name) return 'default'
  if (name.includes('tnt')) return 'tnt'
  if (name.includes('smoke')) return 'smoke'
  if (name.includes('balloon')) return 'balloon'
  if (name.includes('cake')) return 'cake'
  if (name.includes('confetti')) return 'confetti'
  if (name.includes('powder')) return 'powder'
  if (name.includes('cannon')) return 'cannon'
  if (name.includes('basketball') || name.includes('ball')) return 'basketball'
  if (name.includes('blaster')) return 'blaster'
  if (name.includes('bundle')) return 'bundle'
  return 'default'
}

/**
 * One-stop helper for the GMB image describer.
 * Infers a category from the image filename, resolves it to a product URL
 * via the config's urlMapping, fetches the page, and returns the full
 * context bundle. On any failure returns the same shape with pageContent=null
 * and an `error` string so the describer can fall back cleanly.
 *
 * @param {{ imageFilename: string, urlMapping: Array<object> }} args
 * @returns {Promise<{
 *   url: string|null,
 *   category: string,
 *   button: string|null,
 *   pageContent: object|null,
 *   error?: string,
 * }>}
 */
export async function fetchContextForImage({ imageFilename, urlMapping }) {
  const category = inferCategoryFromFilename(imageFilename)
  const entry = resolveUrlForCategory(category, urlMapping)
  const url = entry?.url || null
  const button = entry?.button || null

  if (!url) {
    return { url: null, category, button, pageContent: null, error: 'no-url-mapping' }
  }

  try {
    const pageContent = await fetchPageContent(url)
    return { url, category, button, pageContent }
  } catch (err) {
    return {
      url,
      category,
      button,
      pageContent: null,
      error: err?.message || 'fetch-failed',
    }
  }
}

// Test hook — not part of the public API; useful for unit tests that need a
// clean slate between cases without waiting 30 minutes for the TTL.
export function _clearCache() {
  cache.clear()
}
