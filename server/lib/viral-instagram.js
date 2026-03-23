/**
 * Viral Instagram Scraper — Gender Reveal Reels
 *
 * Supports multiple RapidAPI providers with automatic fallback:
 *   1. instagram-scraper-20251 (Instagram Scraper 2025)
 *   2. instagram-scraper-api2  (Instagram Scraper API2 by yukils)
 *   3. instagram-scraper2      (Instagram Scraper by JoTucker)
 *
 * Each provider has its own endpoint format. If one returns quota exceeded
 * or errors, the next is tried automatically.
 *
 * VIRALITY SCORING (research-backed):
 *   - Saves & shares weighted 100x (strongest algorithm signal)
 *   - Comments weighted 50x (high-intent engagement)
 *   - Likes weighted 5x (weaker signal)
 *   - Views are baseline (1x)
 *   - Engagement rate > 5% = trending multiplier
 *   - Recency bonus: < 24h = 2x
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

const DATA_DIR = join(process.cwd(), 'data')
const CACHE_FILE = join(DATA_DIR, 'viral-instagram-cache.json')
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })

// Clear stale cache on startup
try {
  if (existsSync(CACHE_FILE)) {
    const old = JSON.parse(readFileSync(CACHE_FILE, 'utf8'))
    const firstVideo = old.videos?.[0]
    if (firstVideo && !firstVideo.thumbnail) {
      writeFileSync(CACHE_FILE, '{}')
      console.log('[ViralIG] Cleared stale cache — missing thumbnail data')
    }
  }
} catch { /* ignore */ }

const CACHE_TTL = 6 * 60 * 60 * 1000 // 6 hours — keeps API usage minimal (~4 calls/day)
// Single hashtag only — covers most content and saves 2 API calls per refresh
const HASHTAGS = ['genderreveal']

// Exclude own accounts
const OWN_ACCOUNTS = new Set(['gender.reveal.ideass'])

// ── API Providers (tried in order) ──────────────────────────────────────────
const PROVIDERS = [
  {
    name: 'Instagram Scraper 2025',
    host: 'instagram-scraper-20251.p.rapidapi.com',
    hashtagUrl: (h) => `https://instagram-scraper-20251.p.rapidapi.com/hashtagposts/?keyword=${h}`,
    postUrl: (code) => `https://instagram-scraper-20251.p.rapidapi.com/post_info/?shortcode=${code}`,
  },
  {
    name: 'Instagram Scraper API2',
    host: 'instagram-scraper-api2.p.rapidapi.com',
    hashtagUrl: (h) => `https://instagram-scraper-api2.p.rapidapi.com/v1/hashtag?hashtag=${h}`,
    postUrl: (code) => `https://instagram-scraper-api2.p.rapidapi.com/v1/post_info?code_or_id_or_url=${code}`,
  },
  {
    name: 'Instagram Scraper JoTucker',
    host: 'instagram-scraper2.p.rapidapi.com',
    hashtagUrl: (h) => `https://instagram-scraper2.p.rapidapi.com/ig/hashtag/?hashtag=${h}`,
    postUrl: (code) => `https://instagram-scraper2.p.rapidapi.com/ig/post_info/?shortcode=${code}`,
  },
]

// Allow overriding which provider to use via env var
const PROVIDER_INDEX = parseInt(process.env.IG_PROVIDER_INDEX || '0', 10)

function readCache() {
  try {
    if (!existsSync(CACHE_FILE)) return null
    const data = JSON.parse(readFileSync(CACHE_FILE, 'utf8'))
    if (Date.now() - new Date(data.fetchedAt).getTime() < CACHE_TTL) return data
    return null
  } catch { return null }
}

function writeCache(videos) {
  const data = { fetchedAt: new Date().toISOString(), videos }
  writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2))
}

/**
 * Get top 5 viral gender reveal Instagram reels.
 */
export async function getViralInstagramReels(forceRefresh = false) {
  if (!forceRefresh) {
    const cached = readCache()
    if (cached) return { ok: true, videos: cached.videos, cached: true }
  }

  const apiKey = process.env.RAPIDAPI_KEY
  if (!apiKey) {
    return { ok: false, videos: [], error: 'No RAPIDAPI_KEY configured' }
  }

  // Try providers in order starting from configured index
  const errors = []
  for (let attempt = 0; attempt < PROVIDERS.length; attempt++) {
    const idx = (PROVIDER_INDEX + attempt) % PROVIDERS.length
    const provider = PROVIDERS[idx]
    try {
      console.log(`[ViralIG] Trying provider: ${provider.name}`)
      const videos = await fetchFromProvider(apiKey, provider)
      if (videos.length > 0) {
        writeCache(videos)
        return { ok: true, videos, cached: false, provider: provider.name }
      }
      errors.push(`${provider.name}: no videos found`)
    } catch (e) {
      const isQuota = e.message?.includes('exceeded') || e.message?.includes('quota') || e.message?.includes('not subscribed')
      errors.push(`${provider.name}: ${e.message}`)
      if (isQuota) {
        console.warn(`[ViralIG] ${provider.name} quota/subscription issue, trying next...`)
        continue
      }
      console.error(`[ViralIG] ${provider.name} error:`, e.message)
    }
  }

  return { ok: false, videos: [], error: `All providers failed: ${errors.join('; ')}` }
}

// ── Virality Scoring ────────────────────────────────────────────────────────

function calculateViralityScore(post) {
  const { views = 0, likes = 0, comments = 0, saves = 0, shares = 0, ageMs = Infinity } = post

  let score = views + (likes * 5) + (comments * 50) + (saves * 100) + (shares * 100)

  // Engagement rate multiplier
  if (views > 0) {
    const er = (likes + comments + saves + shares) / views
    if (er > 0.10) score *= 3.0
    else if (er > 0.05) score *= 2.0
    else if (er > 0.03) score *= 1.5
  }

  // Recency bonus
  const ONE_DAY = 24 * 60 * 60 * 1000
  if (ageMs < ONE_DAY) score *= 2.0
  else if (ageMs < 2 * ONE_DAY) score *= 1.5

  // Absolute views bonus
  if (views >= 1000000) score *= 2.0
  else if (views >= 500000) score *= 1.5
  else if (views >= 100000) score *= 1.2

  return Math.round(score)
}

function getViralLabel(score, views, engagementRate) {
  if (score >= 5000000 || views >= 1000000) return 'VIRAL'
  if (score >= 1000000 || views >= 500000) return 'Blowing Up'
  if (score >= 500000 || engagementRate > 0.05) return 'Trending'
  if (score >= 100000) return 'Rising'
  return 'New'
}

// ── Provider Fetch ──────────────────────────────────────────────────────────

async function fetchFromProvider(apiKey, provider) {
  const allVideos = []

  for (const hashtag of HASHTAGS) {
    try {
      const url = provider.hashtagUrl(hashtag)
      const res = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          'X-RapidAPI-Key': apiKey,
          'X-RapidAPI-Host': provider.host,
        },
        signal: AbortSignal.timeout(15000),
      })

      if (!res.ok) {
        const body = await res.text().catch(() => '')
        if (body.includes('exceeded') || body.includes('quota') || body.includes('not subscribed')) {
          throw new Error(`Quota exceeded or not subscribed (HTTP ${res.status})`)
        }
        console.warn(`[ViralIG] ${provider.name} ${hashtag}: HTTP ${res.status}`)
        continue
      }

      const data = await res.json()

      // Check for quota error in JSON body
      if (data.message && (data.message.includes('exceeded') || data.message.includes('not subscribed'))) {
        throw new Error(data.message)
      }

      // Handle different response shapes across providers
      const posts = data.data?.items || data.data?.medias || data.items || data.medias
        || data.data?.edge_hashtag_to_media?.edges?.map(e => e.node)
        || (Array.isArray(data.data) ? data.data : [])
      const postList = Array.isArray(posts) ? posts : []

      console.log(`[ViralIG] ${provider.name} #${hashtag}: ${postList.length} posts`)

      for (const post of postList) {
        const parsed = parsePost(post, hashtag)
        if (parsed) allVideos.push(parsed)
      }

      await new Promise(r => setTimeout(r, 500))
    } catch (e) {
      // Re-throw quota errors to trigger provider fallback
      if (e.message?.includes('exceeded') || e.message?.includes('quota') || e.message?.includes('not subscribed')) {
        throw e
      }
      console.warn(`[ViralIG] ${provider.name} #${hashtag} error:`, e.message)
    }
  }

  // Deduplicate
  const seen = new Set()
  const unique = allVideos.filter(v => {
    if (seen.has(v.id)) return false
    seen.add(v.id)
    return true
  })

  // Prefer last-24h content, fill with older
  const recent = unique.filter(v => v.ageHours <= 24).sort((a, b) => b.virality - a.virality)
  const older = unique.filter(v => v.ageHours > 24).sort((a, b) => b.virality - a.virality)

  return [...recent, ...older].slice(0, 5)
}

/**
 * Parse a single post from any provider into our standard format.
 * Returns null if the post should be skipped.
 */
function parsePost(post, hashtag) {
  // Only video/reel content
  const isVideo = post.media_type === 2 || post.is_video || post.video_url || post.type === 'video'
    || post.product_type === 'clips' // Instagram's internal type for reels
  if (!isVideo) return null

  const code = post.code || post.shortcode || post.short_code || ''
  if (!code) return null

  // Skip own accounts
  const username = post.user?.username || post.owner?.username || ''
  if (OWN_ACCOUNTS.has(username)) return null

  const views    = post.play_count || post.video_view_count || post.view_count || 0
  const likes    = post.like_count || post.likes?.count || 0
  const comments = post.comment_count || post.comments?.count || 0
  const saves    = post.save_count || post.saved_count || 0
  const shares   = post.share_count || post.reshare_count || 0

  const ts = post.taken_at
    ? new Date((typeof post.taken_at === 'number' && post.taken_at < 2000000000) ? post.taken_at * 1000 : post.taken_at)
    : null

  const ageMs = ts ? Date.now() - ts.getTime() : Infinity
  if (ageMs > 7 * 24 * 60 * 60 * 1000) return null // max 7 days

  // Thumbnail
  const thumbnail = post.thumbnail_url
    || post.display_url
    || post.image_versions2?.candidates?.[0]?.url
    || post.carousel_media?.[0]?.image_versions2?.candidates?.[0]?.url
    || post.thumbnail_src
    || post.cover_frame_url
    || ''

  // Video URL
  const videoUrl = post.video_url
    || post.video_versions?.[0]?.url
    || post.clips?.video_url
    || ''

  // Hashtags
  const fullCaption = typeof post.caption === 'string' ? post.caption : (post.caption?.text || '')
  const captionHashtags = Array.isArray(post.caption?.hashtags) ? post.caption.hashtags : []
  const hashtags = captionHashtags.length > 0
    ? captionHashtags.slice(0, 8)
    : (fullCaption.match(/#[\w\u00C0-\u024F]+/g) || []).slice(0, 8)

  const engagementRate = views > 0 ? (likes + comments + saves + shares) / views : 0
  const virality = calculateViralityScore({ views, likes, comments, saves, shares, ageMs })

  return {
    id: code,
    url: `https://www.instagram.com/reel/${code}/`,
    caption: fullCaption.slice(0, 120),
    hashtags,
    thumbnail,
    videoUrl,
    creator: username ? `@${username}` : 'Unknown',
    views, likes, comments, saves, shares,
    virality,
    engagementRate: Math.round(engagementRate * 1000) / 10,
    createdAt: ts?.toISOString() || new Date().toISOString(),
    ageHours: Math.round(ageMs / (60 * 60 * 1000)),
    hashtag,
    viralLabel: getViralLabel(virality, views, engagementRate),
  }
}

/**
 * Download a reel video by shortcode.
 */
export async function downloadReelVideo(shortcode) {
  // 1. Check cache
  const cached = readCache()
  if (cached) {
    const match = cached.videos.find(v => v.id === shortcode)
    if (match?.videoUrl) return { ok: true, videoUrl: match.videoUrl }
  }

  // 2. Try API to fetch post details
  const apiKey = process.env.RAPIDAPI_KEY
  if (!apiKey) return { ok: false, error: 'No RAPIDAPI_KEY configured' }

  for (let attempt = 0; attempt < PROVIDERS.length; attempt++) {
    const idx = (PROVIDER_INDEX + attempt) % PROVIDERS.length
    const provider = PROVIDERS[idx]
    try {
      const res = await fetch(provider.postUrl(shortcode), {
        headers: {
          'Content-Type': 'application/json',
          'X-RapidAPI-Key': apiKey,
          'X-RapidAPI-Host': provider.host,
        },
        signal: AbortSignal.timeout(15000),
      })
      if (!res.ok) continue
      const data = await res.json()
      if (data.message?.includes('exceeded') || data.message?.includes('not subscribed')) continue

      const post = data.data || data
      const videoUrl = post.video_url || post.video_versions?.[0]?.url || post.clips?.video_url || post.media?.video_url || ''
      if (videoUrl) return { ok: true, videoUrl }
    } catch { continue }
  }

  return { ok: false, error: 'Could not find video URL for this reel' }
}
