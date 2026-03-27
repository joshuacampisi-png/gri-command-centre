/**
 * GRI Product Image Registry
 * ─────────────────────────────────────────────────────────────
 * Fetches and caches real product images from Shopify Admin API.
 * These are the actual CDN URLs for GRI products — publicly
 * accessible, high resolution, and exactly what the products
 * look like.
 *
 * Used as reference images for Nano Banana Pro image generation.
 * No scraping. No guessing. Real product photos.
 * ─────────────────────────────────────────────────────────────
 */

// Product keyword mapping — which products are relevant to which keywords
const PRODUCT_KEYWORD_MAP = {
  'mega blaster':     ['mega', 'blaster', 'extinguisher', 'powder cannon', 'fire extinguisher'],
  'mini blaster':     ['mini', 'small', 'mini blaster'],
  'smoke bomb':       ['smoke', 'smoke bomb', 'smoke grenade', 'coloured smoke', 'colored smoke'],
  'bio cannon':       ['cannon', 'bio cannon', 'confetti cannon', 'confetti', 'bio-cannon'],
  'basketball':       ['basketball', 'ball', 'sport'],
}

// In-memory cache of Shopify product images (populated on first request)
let _imageCache = null
let _cacheTime = 0
const CACHE_TTL = 1000 * 60 * 60 // 1 hour

/**
 * Fetch ALL product images from Shopify Admin API.
 * Returns a map: { productHandle: { title, images: [cdnUrl, ...] } }
 */
async function fetchAllProductImages() {
  const store = process.env.SHOPIFY_STORE_DOMAIN || 'bdd19a-3.myshopify.com'
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN
  if (!token) {
    console.warn('[product-images] No Shopify token, cannot fetch product images')
    return {}
  }

  try {
    // Fetch all products WITH images
    const url = `https://${store}/admin/api/2026-01/products.json?limit=50&fields=id,title,handle,images,product_type,tags`
    const res = await fetch(url, {
      headers: { 'X-Shopify-Access-Token': token },
      signal: AbortSignal.timeout(10000),
    })

    if (!res.ok) {
      console.error(`[product-images] Shopify API returned ${res.status}`)
      return {}
    }

    const data = await res.json()
    const products = data.products || []

    const imageMap = {}
    for (const p of products) {
      const images = (p.images || [])
        .map(img => img.src)
        .filter(Boolean)

      if (images.length > 0) {
        imageMap[p.handle] = {
          title: p.title,
          handle: p.handle,
          images,
        }
      }
    }

    console.log(`[product-images] Cached ${Object.keys(imageMap).length} products with images from Shopify`)
    return imageMap
  } catch (e) {
    console.error('[product-images] Failed to fetch from Shopify:', e.message)
    return {}
  }
}

/**
 * Get the cached image map (fetches from Shopify if needed)
 */
async function getImageCache() {
  const now = Date.now()
  if (_imageCache && (now - _cacheTime) < CACHE_TTL) {
    return _imageCache
  }

  _imageCache = await fetchAllProductImages()
  _cacheTime = now
  return _imageCache
}

/**
 * Find the best matching product images for a given keyword.
 * Returns an array of Shopify CDN URLs (up to maxImages).
 *
 * @param {string} keyword - The blog keyword
 * @param {number} maxImages - Maximum images to return (default 6)
 * @returns {Promise<{images: string[], matchedProducts: string[]}>}
 */
export async function getProductImagesForKeyword(keyword, maxImages = 6) {
  const cache = await getImageCache()
  const handles = Object.keys(cache)

  if (handles.length === 0) {
    return { images: [], matchedProducts: [] }
  }

  const kw = keyword.toLowerCase()
  const images = []
  const matchedProducts = []

  // Score each product by keyword relevance
  const scored = handles.map(handle => {
    const product = cache[handle]
    const title = product.title.toLowerCase()
    let score = 0

    // Direct keyword match in title
    if (title.includes(kw)) score += 10
    // Individual words from keyword in title
    const kwWords = kw.split(/\s+/)
    for (const word of kwWords) {
      if (word.length > 2 && title.includes(word)) score += 3
      if (handle.includes(word)) score += 2
    }

    // Check against the keyword map
    for (const [productType, keywords] of Object.entries(PRODUCT_KEYWORD_MAP)) {
      const typeMatch = keywords.some(k => kw.includes(k))
      const productMatch = title.includes(productType) || handle.includes(productType.replace(/\s+/g, '-'))
      if (typeMatch && productMatch) score += 15
      if (typeMatch) score += 3
    }

    // Gender reveal generic keyword — all products get a base score
    if (kw.includes('gender reveal')) score += 1

    return { handle, product, score }
  })

  // Sort by score descending, take top matches
  scored.sort((a, b) => b.score - a.score)

  for (const { product, score } of scored) {
    if (score <= 0) continue
    if (images.length >= maxImages) break

    matchedProducts.push(product.title)
    // Take up to 3 images per product
    for (const img of product.images.slice(0, 3)) {
      if (images.length >= maxImages) break
      images.push(img)
    }
  }

  // If no keyword match, include the first product's images as fallback
  if (images.length === 0 && handles.length > 0) {
    const first = cache[handles[0]]
    matchedProducts.push(first.title)
    images.push(...first.images.slice(0, 3))
  }

  console.log(`[product-images] Keyword "${keyword}" matched ${matchedProducts.length} products, returning ${images.length} images`)

  return { images, matchedProducts }
}

/**
 * Tier 2: Web search for product images when Shopify has no match.
 * Searches Google Images (via Custom Search API) or falls back to
 * scraping the brand's own website search.
 *
 * @param {string} keyword
 * @param {number} maxImages
 * @returns {Promise<string[]>}
 */
export async function searchWebForProductImages(keyword, maxImages = 4) {
  const images = []

  // Try Google Custom Search API first
  const googleKey = process.env.GOOGLE_SEARCH_API_KEY
  const googleCx = process.env.GOOGLE_SEARCH_CX
  if (googleKey && googleCx) {
    try {
      const query = `genderrevealideas.com.au ${keyword} product`
      const gUrl = `https://www.googleapis.com/customsearch/v1?key=${googleKey}&cx=${googleCx}&q=${encodeURIComponent(query)}&searchType=image&num=${maxImages}&imgSize=large&safe=active`
      const res = await fetch(gUrl, { signal: AbortSignal.timeout(8000) })
      if (res.ok) {
        const data = await res.json()
        const urls = (data.items || [])
          .map(item => item.link)
          .filter(url => url && url.startsWith('http') && !url.endsWith('.svg'))
          .slice(0, maxImages)
        if (urls.length > 0) {
          console.log(`[product-images] Tier 2 Google search found ${urls.length} images for "${keyword}"`)
          return urls
        }
      }
    } catch (e) {
      console.warn('[product-images] Google image search failed:', e.message)
    }
  }

  // Fallback: try searching the brand's own site
  try {
    const searchUrl = `https://genderrevealideas.com.au/search?q=${encodeURIComponent(keyword)}&type=product`
    const res = await fetch(searchUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WOGBot/1.0)' },
      signal: AbortSignal.timeout(8000),
    })
    if (res.ok) {
      const html = await res.text()
      // Extract Shopify CDN image URLs from the HTML
      const cdnPattern = /https:\/\/cdn\.shopify\.com\/s\/files\/[^"'\s]+\.(?:jpg|jpeg|png|webp)/gi
      const matches = html.match(cdnPattern) || []
      const unique = [...new Set(matches)]
        .filter(url => !url.includes('logo') && !url.includes('icon') && !url.includes('1x1'))
        .slice(0, maxImages)
      if (unique.length > 0) {
        console.log(`[product-images] Tier 2 site search found ${unique.length} CDN images for "${keyword}"`)
        return unique
      }
    }
  } catch (e) {
    console.warn('[product-images] Site search fallback failed:', e.message)
  }

  console.log(`[product-images] Tier 2 web search found no images for "${keyword}"`)
  return []
}

/**
 * Force-refresh the image cache (useful after product updates)
 */
export async function refreshImageCache() {
  _imageCache = null
  _cacheTime = 0
  return getImageCache()
}
