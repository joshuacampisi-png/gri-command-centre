/**
 * Viral Instagram Scraper — Gender Reveal Reels
 * Uses RapidAPI Instagram Scraper to find trending gender reveal content.
 * Caches results for 1 hour to avoid excessive API calls.
 * Falls back to Playwright hashtag scrape if no API key.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

const DATA_DIR = join(process.cwd(), 'data')
const CACHE_FILE = join(DATA_DIR, 'viral-instagram-cache.json')
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })

const CACHE_TTL = 60 * 60 * 1000 // 1 hour
const HASHTAGS = ['genderreveal', 'genderrevealparty', 'genderrevealideas']

function readCache() {
  try {
    if (!existsSync(CACHE_FILE)) return null
    const data = JSON.parse(readFileSync(CACHE_FILE, 'utf8'))
    if (Date.now() - new Date(data.fetchedAt).getTime() < CACHE_TTL) return data
    return null // expired
  } catch { return null }
}

function writeCache(videos) {
  const data = { fetchedAt: new Date().toISOString(), videos }
  writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2))
}

/**
 * Get top 5 viral gender reveal Instagram reels from last 24h
 */
export async function getViralInstagramReels() {
  // Check cache first
  const cached = readCache()
  if (cached) return { ok: true, videos: cached.videos, cached: true }

  const apiKey = process.env.RAPIDAPI_KEY
  if (apiKey) {
    try {
      const videos = await fetchFromRapidAPI(apiKey)
      if (videos.length > 0) {
        writeCache(videos)
        return { ok: true, videos, cached: false }
      }
    } catch (e) {
      console.error('[ViralIG] RapidAPI failed:', e.message)
    }
  }

  // Fallback: try Playwright scrape
  try {
    const videos = await scrapeWithPlaywright()
    if (videos.length > 0) {
      writeCache(videos)
      return { ok: true, videos, cached: false }
    }
  } catch (e) {
    console.error('[ViralIG] Playwright scrape failed:', e.message)
  }

  return { ok: false, videos: [], error: 'No API key and scraping failed' }
}

/**
 * RapidAPI Instagram Scraper — hashtag top posts
 */
async function fetchFromRapidAPI(apiKey) {
  const allVideos = []

  for (const hashtag of HASHTAGS) {
    try {
      const res = await fetch(`https://instagram-scraper-api2.p.rapidapi.com/v1/hashtag?hashtag=${hashtag}`, {
        headers: {
          'X-RapidAPI-Key': apiKey,
          'X-RapidAPI-Host': 'instagram-scraper-api2.p.rapidapi.com'
        },
        signal: AbortSignal.timeout(15000),
      })

      if (!res.ok) {
        console.warn(`[ViralIG] RapidAPI ${hashtag}: HTTP ${res.status}`)
        continue
      }

      const data = await res.json()
      const posts = data.data?.items || data.items || []

      for (const post of posts) {
        // Only video/reel content
        if (post.media_type !== 2 && !post.video_url) continue

        const views = post.play_count || post.video_view_count || 0
        const likes = post.like_count || 0
        const comments = post.comment_count || 0
        const ts = post.taken_at ? new Date(post.taken_at * 1000) : null

        // Only last 24h
        if (ts && Date.now() - ts.getTime() > 24 * 60 * 60 * 1000) continue

        // Virality score: weighted combo of views, likes, comments
        const virality = views + (likes * 10) + (comments * 50)

        allVideos.push({
          id: post.code || post.id,
          url: `https://www.instagram.com/reel/${post.code || post.shortcode}/`,
          caption: (post.caption?.text || '').slice(0, 120),
          creator: post.user?.username ? `@${post.user.username}` : 'Unknown',
          views,
          likes,
          comments,
          virality,
          createdAt: ts?.toISOString() || new Date().toISOString(),
          hashtag,
        })
      }

      // Rate limit between hashtag calls
      await new Promise(r => setTimeout(r, 500))
    } catch (e) {
      console.warn(`[ViralIG] RapidAPI ${hashtag} error:`, e.message)
    }
  }

  // Deduplicate by post ID, sort by virality, take top 5
  const seen = new Set()
  return allVideos
    .filter(v => { if (seen.has(v.id)) return false; seen.add(v.id); return true })
    .sort((a, b) => b.virality - a.virality)
    .slice(0, 5)
    .map(v => ({
      ...v,
      viralityLabel: formatVirality(v),
    }))
}

/**
 * Playwright fallback — scrape Instagram hashtag explore page
 */
async function scrapeWithPlaywright() {
  try {
    const { chromium } = await import('playwright')
    const browser = await chromium.launch({ headless: true })
    const videos = []

    try {
      const page = await browser.newPage()
      await page.goto(`https://www.instagram.com/explore/tags/genderreveal/`, {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      })

      // Wait for content to load
      await page.waitForTimeout(3000)

      // Extract reel links from the page
      const links = await page.$$eval('a[href*="/reel/"]', els =>
        els.slice(0, 10).map(el => ({
          url: el.href,
          id: el.href.match(/\/reel\/([^/]+)/)?.[1] || '',
        }))
      )

      for (const link of links) {
        if (link.id) {
          videos.push({
            id: link.id,
            url: link.url,
            caption: 'Gender reveal reel',
            creator: 'Instagram',
            views: 0,
            likes: 0,
            comments: 0,
            virality: 0,
            createdAt: new Date().toISOString(),
            hashtag: 'genderreveal',
            viralityLabel: 'Trending',
          })
        }
      }
    } finally {
      await browser.close()
    }

    return videos.slice(0, 5)
  } catch (e) {
    console.error('[ViralIG] Playwright error:', e.message)
    return []
  }
}

function formatVirality(v) {
  const total = v.views + v.likes
  if (total >= 1000000) return `${(total / 1000000).toFixed(1)}M`
  if (total >= 1000) return `${(total / 1000).toFixed(0)}K`
  return String(total)
}
