/**
 * Viral Instagram Scraper — Gender Reveal Reels
 * Uses RapidAPI "Instagram Scraper 2025" to find trending gender reveal content.
 * Endpoint: /hashtagposts/?keyword=genderreveal
 * Caches results for 1 hour to avoid excessive API calls.
 *
 * VIRALITY SCORING (research-backed, 2025/2026):
 *   - Saves & shares are the #1 algorithm signal (weighted 100x)
 *   - Comments weighted 50x (high-intent engagement)
 *   - Likes weighted 5x (weak signal per Instagram 2026 algo)
 *   - Views are baseline (1x)
 *   - Engagement rate > 5% = strong trending signal
 *   - Recency bonus: content < 24h old gets 2x multiplier
 *   - 500K+ views with high engagement = viral tier
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

const DATA_DIR = join(process.cwd(), 'data')
const CACHE_FILE = join(DATA_DIR, 'viral-instagram-cache.json')
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })

const CACHE_TTL = 60 * 60 * 1000 // 1 hour
const API_HOST = 'instagram-scraper-20251.p.rapidapi.com'
const HASHTAGS = ['genderreveal', 'genderrevealparty', 'genderrevealideas']

// Exclude our own accounts — no point showing our own content
const OWN_ACCOUNTS = new Set(['gender.reveal.ideass'])

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
 * Get top 5 viral gender reveal Instagram reels.
 * Prioritises last 24h content, falls back to 7 days if nothing recent.
 */
export async function getViralInstagramReels() {
  const cached = readCache()
  if (cached) return { ok: true, videos: cached.videos, cached: true }

  const apiKey = process.env.RAPIDAPI_KEY
  if (!apiKey) {
    return { ok: false, videos: [], error: 'No RAPIDAPI_KEY configured' }
  }

  try {
    const videos = await fetchFromRapidAPI(apiKey)
    if (videos.length > 0) {
      writeCache(videos)
      return { ok: true, videos, cached: false }
    }
    return { ok: false, videos: [], error: 'No viral reels found for gender reveal hashtags' }
  } catch (e) {
    console.error('[ViralIG] RapidAPI failed:', e.message)
    return { ok: false, videos: [], error: e.message }
  }
}

/**
 * Calculate virality score using Instagram's 2026 algorithm priorities.
 *
 * Algorithm ranking signals (in order of weight):
 *   1. Saves & Shares — strongest signal, means user found it valuable enough to keep/send
 *   2. Comments — high-intent interaction, sparks conversation
 *   3. Likes — weakest engagement signal (downgraded in 2025 algo update)
 *   4. Views — baseline reach metric
 *
 * Engagement rate = (likes + comments + saves + shares) / views
 *   > 5% = strong trending potential
 *   > 10% = viral-tier engagement
 *   1.23% = average Reel engagement (benchmark)
 *
 * Recency: content < 24h gets a 2x boost (first-hour engagement
 * determines 80% of viral potential per research)
 */
function calculateViralityScore(post) {
  const views    = post.views || 0
  const likes    = post.likes || 0
  const comments = post.comments || 0
  const saves    = post.saves || 0
  const shares   = post.shares || 0
  const ageMs    = post.ageMs || Infinity

  // Weighted engagement score
  // Saves/shares most important (100x), comments (50x), likes (5x), views (1x)
  let score = views
    + (likes * 5)
    + (comments * 50)
    + (saves * 100)
    + (shares * 100)

  // Engagement rate multiplier
  if (views > 0) {
    const engagementRate = (likes + comments + saves + shares) / views
    if (engagementRate > 0.10) score *= 3.0      // 10%+ = viral-tier
    else if (engagementRate > 0.05) score *= 2.0  // 5%+  = strong trending
    else if (engagementRate > 0.03) score *= 1.5  // 3%+  = above average
  }

  // Recency bonus: < 24h = 2x, < 48h = 1.5x
  const ONE_DAY = 24 * 60 * 60 * 1000
  if (ageMs < ONE_DAY) score *= 2.0
  else if (ageMs < 2 * ONE_DAY) score *= 1.5

  // High absolute views bonus (500K+ = viral reach)
  if (views >= 1000000) score *= 2.0
  else if (views >= 500000) score *= 1.5
  else if (views >= 100000) score *= 1.2

  return Math.round(score)
}

/**
 * Classify the viral status of a reel
 */
function getViralLabel(score, views, engagementRate) {
  if (score >= 5000000 || views >= 1000000) return 'VIRAL'
  if (score >= 1000000 || views >= 500000) return 'Blowing Up'
  if (score >= 500000 || engagementRate > 0.05) return 'Trending'
  if (score >= 100000) return 'Rising'
  return 'New'
}

/**
 * RapidAPI Instagram Scraper 2025 — hashtag posts
 * GET /hashtagposts/?keyword={hashtag}
 */
async function fetchFromRapidAPI(apiKey) {
  const allVideos = []

  for (const hashtag of HASHTAGS) {
    try {
      const res = await fetch(`https://${API_HOST}/hashtagposts/?keyword=${hashtag}`, {
        headers: {
          'Content-Type': 'application/json',
          'X-RapidAPI-Key': apiKey,
          'X-RapidAPI-Host': API_HOST
        },
        signal: AbortSignal.timeout(15000),
      })

      if (!res.ok) {
        console.warn(`[ViralIG] RapidAPI ${hashtag}: HTTP ${res.status}`)
        continue
      }

      const data = await res.json()

      // Handle different response shapes
      const posts = data.data?.items || data.data?.medias || data.items || data.medias || data.data || []
      const postList = Array.isArray(posts) ? posts : []

      for (const post of postList) {
        // Only video/reel content
        const isVideo = post.media_type === 2 || post.is_video || post.video_url || post.type === 'video'
        if (!isVideo) continue

        const code = post.code || post.shortcode || post.short_code || ''
        if (!code) continue

        // Skip our own accounts
        const username = post.user?.username || post.owner?.username || ''
        if (OWN_ACCOUNTS.has(username)) continue

        const views    = post.play_count || post.video_view_count || post.view_count || 0
        const likes    = post.like_count || post.likes?.count || 0
        const comments = post.comment_count || post.comments?.count || 0
        const saves    = post.save_count || post.saved_count || 0
        const shares   = post.share_count || post.reshare_count || 0
        const ts = post.taken_at
          ? new Date((typeof post.taken_at === 'number' && post.taken_at < 2000000000) ? post.taken_at * 1000 : post.taken_at)
          : null

        // Max 7 days old (we prefer 24h but widen to ensure results)
        const ageMs = ts ? Date.now() - ts.getTime() : Infinity
        if (ageMs > 7 * 24 * 60 * 60 * 1000) continue

        // Thumbnail: try multiple fields the API might return
        const thumbnail = post.thumbnail_url
          || post.display_url
          || post.image_versions2?.candidates?.[0]?.url
          || post.carousel_media?.[0]?.image_versions2?.candidates?.[0]?.url
          || post.thumbnail_src
          || post.cover_frame_url
          || ''

        // Video URL for direct download
        const videoUrl = post.video_url
          || post.video_versions?.[0]?.url
          || post.clips?.video_url
          || ''

        // Extract hashtags — prefer API's parsed array, fallback to regex from caption text
        const fullCaption = post.caption?.text || post.caption || ''
        const captionHashtags = Array.isArray(post.caption?.hashtags) ? post.caption.hashtags : []
        const hashtags = captionHashtags.length > 0
          ? captionHashtags.slice(0, 8)
          : (fullCaption.match(/#[\w\u00C0-\u024F]+/g) || []).slice(0, 8)

        const engagementRate = views > 0 ? (likes + comments + saves + shares) / views : 0
        const virality = calculateViralityScore({ views, likes, comments, saves, shares, ageMs })

        allVideos.push({
          id: code,
          url: `https://www.instagram.com/reel/${code}/`,
          caption: fullCaption.slice(0, 120),
          hashtags,
          thumbnail,
          videoUrl,
          creator: username ? `@${username}` : 'Unknown',
          views,
          likes,
          comments,
          saves,
          shares,
          virality,
          engagementRate: Math.round(engagementRate * 1000) / 10, // e.g. 5.2%
          createdAt: ts?.toISOString() || new Date().toISOString(),
          ageHours: Math.round(ageMs / (60 * 60 * 1000)),
          hashtag,
          viralLabel: getViralLabel(virality, views, engagementRate),
        })
      }

      // Rate limit between hashtag calls
      await new Promise(r => setTimeout(r, 500))
    } catch (e) {
      console.warn(`[ViralIG] RapidAPI ${hashtag} error:`, e.message)
    }
  }

  // Deduplicate by post ID
  const seen = new Set()
  const unique = allVideos.filter(v => {
    if (seen.has(v.id)) return false
    seen.add(v.id)
    return true
  })

  // Prefer last-24h content; if fewer than 5, fill with older
  const ONE_DAY = 24 * 60 * 60 * 1000
  const recent = unique.filter(v => v.ageHours <= 24).sort((a, b) => b.virality - a.virality)
  const older  = unique.filter(v => v.ageHours > 24).sort((a, b) => b.virality - a.virality)

  const top = [...recent, ...older].slice(0, 5)

  return top.map(v => ({
    ...v,
    viralityLabel: formatVirality(v),
  }))
}

function formatVirality(v) {
  if (v.views >= 1000000) return `${(v.views / 1000000).toFixed(1)}M views`
  if (v.views >= 1000) return `${(v.views / 1000).toFixed(0)}K views`
  if (v.views > 0) return `${v.views} views`
  return v.viralLabel || 'New'
}

/**
 * Download a reel video by shortcode.
 * 1. Check cache for stored videoUrl (from hashtag scrape)
 * 2. Fall back to API post_info endpoint
 */
export async function downloadReelVideo(shortcode) {
  // 1. Check if we already have the video URL cached from the hashtag scrape
  const cached = readCache()
  if (cached) {
    const match = cached.videos.find(v => v.id === shortcode)
    if (match?.videoUrl) return { ok: true, videoUrl: match.videoUrl }
  }

  // 2. Try API to fetch post details
  const apiKey = process.env.RAPIDAPI_KEY
  if (!apiKey) return { ok: false, error: 'No RAPIDAPI_KEY configured' }

  // Try multiple possible endpoint patterns
  const endpoints = [
    `/post_info/?shortcode=${shortcode}`,
    `/media_info/?shortcode=${shortcode}`,
    `/postinfo/?shortcode=${shortcode}`,
  ]

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(`https://${API_HOST}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          'X-RapidAPI-Key': apiKey,
          'X-RapidAPI-Host': API_HOST
        },
        signal: AbortSignal.timeout(15000),
      })

      if (!res.ok) continue

      const data = await res.json()
      const post = data.data || data

      const videoUrl = post.video_url
        || post.video_versions?.[0]?.url
        || post.clips?.video_url
        || post.media?.video_url
        || ''

      if (videoUrl) return { ok: true, videoUrl }
    } catch {
      continue
    }
  }

  return { ok: false, error: 'Could not find video URL for this reel' }
}
