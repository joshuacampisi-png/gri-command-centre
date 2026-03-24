/**
 * Meta Ad Library Scraper
 * Scrapes the public Meta Ad Library for competitor Facebook/Instagram ads.
 * Stores ad images locally for persistent viewing.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { getCompetitors } from './competitor-config.js'
import { appendScan, getLatestScan } from './competitor-history.js'
import { dataFile, dataDir } from './data-dir.js'

const IMAGES_DIR = dataDir('meta-ads', 'images')
const CACHE_FILE = dataFile('meta-ads/meta-ads-cache.json')

/**
 * Search Meta Ad Library for a page/domain
 * Uses the public Ad Library search page API
 */
async function searchMetaAdLibrary(searchTerm) {
  const ads = []

  try {
    // Meta Ad Library public API endpoint
    const params = new URLSearchParams({
      ad_type: 'all',
      countries: 'AU',
      q: searchTerm,
      search_type: 'keyword_unordered',
      media_type: 'all',
    })

    const url = `https://www.facebook.com/ads/library/async/search_ads/?${params}`

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-AU,en;q=0.9',
      },
    })

    if (!res.ok) {
      console.log(`[MetaAds] HTTP ${res.status} for "${searchTerm}" — trying alternate approach`)
      return await searchMetaAdLibraryAlternate(searchTerm)
    }

    const text = await res.text()
    return parseMetaAdsResponse(text, searchTerm)
  } catch (e) {
    console.error(`[MetaAds] Search failed for "${searchTerm}":`, e.message)
    return await searchMetaAdLibraryAlternate(searchTerm)
  }
}

/**
 * Alternate: Use the Meta Ad Library API (graph API)
 * This endpoint is more reliable but requires page IDs
 */
async function searchMetaAdLibraryAlternate(searchTerm) {
  try {
    // Try the public search endpoint with different params
    const url = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=AU&q=${encodeURIComponent(searchTerm)}&search_type=keyword_unordered`

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    })

    const html = await res.text()
    return parseMetaAdsHTML(html, searchTerm)
  } catch (e) {
    console.error(`[MetaAds] Alternate search also failed for "${searchTerm}":`, e.message)
    return []
  }
}

/**
 * Parse Meta Ads response (JSON format)
 */
function parseMetaAdsResponse(text, searchTerm) {
  const ads = []

  try {
    // The response is often prefixed with "for (;;);" for security
    const cleaned = text.replace(/^for \(;;\);/, '')
    const data = JSON.parse(cleaned)

    const results = data?.payload?.results || data?.results || []
    for (const result of results) {
      ads.push({
        id: result.adArchiveID || result.id || `meta-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        pageName: result.pageName || result.page_name || searchTerm,
        pageId: result.pageID || result.page_id || null,
        adText: result.body?.markup?.__html || result.ad_creative_bodies?.[0] || '',
        headline: result.title || result.ad_creative_link_titles?.[0] || '',
        cta: result.ctaText || result.ad_creative_link_captions?.[0] || '',
        imageUrl: result.snapshot?.images?.[0]?.original_image_url || result.ad_snapshot_url || null,
        videoUrl: result.snapshot?.videos?.[0]?.video_hd_url || null,
        platforms: result.publisherPlatform || ['facebook'],
        status: 'active',
        startDate: result.startDate || result.ad_delivery_start_time || null,
        endDate: result.endDate || result.ad_delivery_stop_time || null,
        estimatedAudience: result.estimatedAudienceSize || null,
        spend: result.spend || null,
        impressions: result.impressions || null,
      })
    }
  } catch (e) {
    console.log(`[MetaAds] JSON parse failed, trying HTML parse`)
  }

  return ads
}

/**
 * Parse Meta Ads from HTML response
 */
function parseMetaAdsHTML(html, searchTerm) {
  const ads = []

  // Extract ad data from embedded JSON in the HTML
  const jsonMatches = html.match(/"adArchiveID":"(\d+)"/g) || []

  if (jsonMatches.length === 0) {
    console.log(`[MetaAds] No ads found in HTML for "${searchTerm}"`)
    return ads
  }

  // Extract structured data from script tags
  const scriptMatches = html.match(/<script[^>]*>({.*?"adArchiveID".*?})<\/script>/gs) || []

  for (const match of scriptMatches) {
    try {
      const data = JSON.parse(match.replace(/<\/?script[^>]*>/g, ''))
      if (data.adArchiveID) {
        ads.push({
          id: data.adArchiveID,
          pageName: data.pageName || searchTerm,
          pageId: data.pageID || null,
          adText: data.body?.markup?.__html || '',
          headline: data.title || '',
          cta: data.ctaText || '',
          imageUrl: data.snapshot?.images?.[0]?.original_image_url || null,
          videoUrl: null,
          platforms: data.publisherPlatform || ['facebook'],
          status: 'active',
          startDate: data.startDate || null,
          endDate: null,
          estimatedAudience: null,
          spend: null,
          impressions: null,
        })
      }
    } catch {}
  }

  return ads
}

/**
 * Download and store ad image locally
 */
async function downloadAdImage(imageUrl, adId) {
  if (!imageUrl) return null

  const ext = imageUrl.includes('.png') ? 'png' : 'jpg'
  const filename = `${adId}.${ext}`
  const filepath = join(IMAGES_DIR, filename)

  if (existsSync(filepath)) return `/api/competitors/meta-ad-image/${filename}`

  try {
    const res = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    })

    if (!res.ok) return null

    const buffer = Buffer.from(await res.arrayBuffer())
    writeFileSync(filepath, buffer)

    return `/api/competitors/meta-ad-image/${filename}`
  } catch (e) {
    console.error(`[MetaAds] Image download failed for ${adId}:`, e.message)
    return null
  }
}

/**
 * Run a full Meta Ad Library scan for all competitors
 */
export async function runMetaAdsScan() {
  console.log('[MetaAds] Starting Meta Ad Library scan...')

  const competitors = getCompetitors()
  const results = {}

  for (const [id, comp] of Object.entries(competitors)) {
    if (comp.isOwn) continue // Skip our own store for Meta ads (or include if you want)

    console.log(`[MetaAds] Scanning: ${comp.name} (${comp.domain})`)

    // Search by brand name and domain
    const searchTerms = [comp.name]
    let allAds = []

    for (const term of searchTerms) {
      const ads = await searchMetaAdLibrary(term)
      allAds = [...allAds, ...ads]
      await new Promise(r => setTimeout(r, 2000)) // Rate limit
    }

    // Deduplicate by ad ID
    const uniqueAds = [...new Map(allAds.map(ad => [ad.id, ad])).values()]

    // Download images for each ad
    for (const ad of uniqueAds) {
      if (ad.imageUrl) {
        const localPath = await downloadAdImage(ad.imageUrl, ad.id)
        ad.localImagePath = localPath
      }
    }

    results[id] = {
      name: comp.name,
      domain: comp.domain,
      color: comp.color,
      ads: uniqueAds,
      totalActiveAds: uniqueAds.filter(a => a.status === 'active').length,
      lastScanned: new Date().toISOString(),
    }

    console.log(`[MetaAds] Found ${uniqueAds.length} ads for ${comp.name}`)
  }

  // Also scan for our own brand to see our presence
  const gri = competitors.gri
  if (gri) {
    console.log(`[MetaAds] Scanning own brand: ${gri.name}`)
    const griAds = await searchMetaAdLibrary(gri.name)
    for (const ad of griAds) {
      if (ad.imageUrl) {
        ad.localImagePath = await downloadAdImage(ad.imageUrl, ad.id)
      }
    }
    results.gri = {
      name: gri.name,
      domain: gri.domain,
      color: gri.color,
      ads: griAds,
      totalActiveAds: griAds.filter(a => a.status === 'active').length,
      lastScanned: new Date().toISOString(),
    }
  }

  const scanData = {
    competitors: results,
    totalAdsFound: Object.values(results).reduce((sum, r) => sum + r.ads.length, 0),
  }

  // Save to history
  appendScan('meta', scanData)

  // Also save to quick-access cache
  writeFileSync(CACHE_FILE, JSON.stringify(scanData, null, 2))

  console.log(`[MetaAds] Scan complete. Total ads found: ${scanData.totalAdsFound}`)
  return scanData
}

/**
 * Get cached latest Meta ads data
 */
export function getLatestMetaAdsData() {
  return getLatestScan('meta')
}

/**
 * Get image file path for serving
 */
export function getAdImagePath(filename) {
  return join(IMAGES_DIR, filename)
}
