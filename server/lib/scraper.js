/**
 * Reference Image Scraper
 * ─────────────────────────────────────────────────────────────
 * Stage 1 of the blog image pipeline. Scrapes the brand's own
 * website for product images and the open web for lifestyle
 * reference images. Provides visual anchors for Fal.ai FLUX
 * image generation.
 * ─────────────────────────────────────────────────────────────
 */

import * as cheerio from 'cheerio'

const USER_AGENT = 'Mozilla/5.0 (compatible; WOGBot/1.0)'
const FETCH_TIMEOUT = 10000
const FILTER_PATTERNS = /logo|icon|svg|placeholder|blank|spacer|1x1|badge|payment|cart|arrow|close|menu/i

const BRAND_URLS = {
  gri: 'https://genderrevealideas.com.au',
}

// ── Helpers ──────────────────────────────────────────────────

function safeFetch(url, timeout = FETCH_TIMEOUT) {
  return fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(timeout),
  })
}

function isValidImageUrl(url) {
  if (!url || typeof url !== 'string') return false
  if (!url.startsWith('http')) return false
  if (FILTER_PATTERNS.test(url)) return false
  if (url.endsWith('.svg')) return false
  return true
}

function extractBestSrc(el, $) {
  // Prefer srcset highest resolution, then src, then data-src
  const srcset = $(el).attr('srcset')
  if (srcset) {
    const parts = srcset.split(',').map(s => s.trim()).filter(Boolean)
    // Get the last (highest res) entry
    const last = parts[parts.length - 1]
    const url = last.split(/\s+/)[0]
    if (isValidImageUrl(url)) return url
  }

  const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-srcset')
  if (src) {
    const url = src.split(',')[0].split(/\s+/)[0].trim()
    if (isValidImageUrl(url)) return url
  }

  return null
}

function dedup(arr) {
  return [...new Set(arr)]
}

// ── Brand Site Scraper ───────────────────────────────────────

/**
 * Scrape the brand's website for product images relevant to the keyword.
 * @param {string} keyword
 * @returns {Promise<{brand: string, keyword: string, siteUrl: string, productImages: string[], productNames: string[], productDescriptions: string[], productPageUrls: string[]}>}
 */
export async function scrapeBrandSite(keyword) {
  const brand = 'gri'
  const baseUrl = BRAND_URLS.gri
  const searchUrl = `${baseUrl}/search?q=${encodeURIComponent(keyword)}`
  const result = {
    brand,
    keyword,
    siteUrl: baseUrl,
    productImages: [],
    productNames: [],
    productDescriptions: [],
    productPageUrls: [],
  }

  try {
    console.log(`[scraper] Scraping ${searchUrl}`)
    const res = await safeFetch(searchUrl)
    if (!res.ok) throw new Error(`Search page returned ${res.status}`)

    const html = await res.text()
    const $ = cheerio.load(html)

    // Extract product images from search results
    const images = []
    $('img').each((_, el) => {
      const url = extractBestSrc(el, $)
      if (url && !images.includes(url)) images.push(url)
    })
    result.productImages = images.slice(0, 6)

    // Extract product names
    const names = []
    $('h2, h3, .product-title, .product-card__title, [class*="product-title"], [class*="card__heading"]').each((_, el) => {
      const text = $(el).text().trim()
      if (text && text.length > 3 && text.length < 200 && !names.includes(text)) names.push(text)
    })
    result.productNames = names.slice(0, 6)

    // Extract product page URLs
    const pageUrls = []
    $('a[href*="/products/"]').each((_, el) => {
      let href = $(el).attr('href')
      if (!href) return
      if (href.startsWith('/')) href = `${baseUrl}${href}`
      if (!pageUrls.includes(href)) pageUrls.push(href)
    })
    result.productPageUrls = pageUrls.slice(0, 6)

    // Scrape individual product pages (max 3) for more images + descriptions
    const pagePromises = pageUrls.slice(0, 3).map(async (pageUrl) => {
      try {
        const pRes = await safeFetch(pageUrl, 8000)
        if (!pRes.ok) return
        const pHtml = await pRes.text()
        const p$ = cheerio.load(pHtml)

        // Product images from page
        p$('img').each((_, el) => {
          const url = extractBestSrc(el, p$)
          if (url && !result.productImages.includes(url)) {
            result.productImages.push(url)
          }
        })

        // Product description
        const desc =
          p$('.product-description, .product__description, [class*="product-description"], meta[name="description"]').first().text()?.trim() ||
          p$('meta[name="description"]').attr('content')?.trim() || ''
        if (desc && desc.length > 10) {
          result.productDescriptions.push(desc.slice(0, 200))
        }
      } catch (e) {
        console.warn(`[scraper] Failed to scrape product page ${pageUrl}:`, e.message)
      }
    })

    await Promise.all(pagePromises)

    // Deduplicate and cap
    result.productImages = dedup(result.productImages).slice(0, 8)
    result.productDescriptions = dedup(result.productDescriptions).slice(0, 3)

    // If search returned nothing, try the homepage
    if (result.productImages.length === 0) {
      console.log('[scraper] No search results, trying homepage')
      try {
        const homeRes = await safeFetch(baseUrl, 8000)
        if (homeRes.ok) {
          const homeHtml = await homeRes.text()
          const h$ = cheerio.load(homeHtml)
          h$('img').each((_, el) => {
            const url = extractBestSrc(el, h$)
            if (url) result.productImages.push(url)
          })
          result.productImages = dedup(result.productImages).slice(0, 8)
        }
      } catch {}
    }

    console.log(`[scraper] Found ${result.productImages.length} product images, ${result.productNames.length} product names`)

  } catch (err) {
    console.error('[scraper] Brand site scrape failed:', err.message)
  }

  return result
}

// ── Web Reference Scraper ────────────────────────────────────

/**
 * Scrape the open web for lifestyle reference images.
 * Falls back to Unsplash if Google Search API keys are not set.
 * @param {string} keyword
 * @returns {Promise<{keyword: string, referenceImages: string[], searchQuery: string}>}
 */
export async function scrapeWebReferences(keyword) {
  const searchQuery = `${keyword} gender reveal party australia real photo`
  const result = {
    keyword,
    referenceImages: [],
    searchQuery,
  }

  // Try Google Custom Search API if configured
  const googleKey = process.env.GOOGLE_SEARCH_API_KEY
  const googleCx = process.env.GOOGLE_SEARCH_CX
  if (googleKey && googleCx) {
    try {
      const gUrl = `https://www.googleapis.com/customsearch/v1?key=${googleKey}&cx=${googleCx}&q=${encodeURIComponent(searchQuery)}&searchType=image&num=5&imgSize=large`
      const gRes = await safeFetch(gUrl, 8000)
      if (gRes.ok) {
        const gData = await gRes.json()
        const urls = (gData.items || [])
          .map(item => item.link)
          .filter(isValidImageUrl)
          .slice(0, 5)
        result.referenceImages = urls
        console.log(`[scraper] Google image search returned ${urls.length} references`)
        return result
      }
    } catch (e) {
      console.warn('[scraper] Google Custom Search failed:', e.message)
    }
  }

  // Fallback: scrape Unsplash
  try {
    const slug = keyword.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    const unsplashUrl = `https://unsplash.com/s/photos/${slug}`
    console.log(`[scraper] Scraping Unsplash: ${unsplashUrl}`)

    const uRes = await safeFetch(unsplashUrl, 8000)
    if (!uRes.ok) throw new Error(`Unsplash returned ${uRes.status}`)

    const uHtml = await uRes.text()
    const $ = cheerio.load(uHtml)

    const urls = []
    $('img[src*="images.unsplash.com"]').each((_, el) => {
      let src = $(el).attr('src') || ''
      // Prefer high-res version
      if (src.includes('?')) {
        src = src.replace(/w=\d+/, 'w=1280')
      }
      if (isValidImageUrl(src) && !urls.includes(src)) urls.push(src)
    })

    result.referenceImages = urls.slice(0, 5)
    console.log(`[scraper] Unsplash returned ${result.referenceImages.length} references`)
  } catch (e) {
    console.warn('[scraper] Unsplash scrape failed:', e.message)
  }

  return result
}
