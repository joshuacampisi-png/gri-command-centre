/**
 * youtube-transcripts.js
 * ─────────────────────────────────────────────────────────────
 * Fetches transcripts from the Gender Reveal Ideas YouTube channel
 * and ranks them by topical relevance to a keyword. Used by the
 * blog autopublish pipeline so articles quote Michael and the team
 * directly, not fabricated voices.
 *
 * Strategy:
 * 1. Scrape the channel's /videos page (no API key needed) to get
 *    the current video list with titles + IDs.
 * 2. For each candidate video, fetch the auto-generated transcript
 *    from YouTube's public timedtext endpoint.
 * 3. Score videos by title + transcript token overlap vs the keyword.
 * 4. Return the top matches with their transcripts cached to disk.
 *
 * NO official YouTube Data API key is required — the channel-page
 * scrape is public.
 *
 * KNOWN LIMITATION: YouTube throttles direct timedtext fetches from
 * server IPs. When captions can't be fetched, we return an empty
 * transcript and the pipeline skips quote extraction cleanly —
 * fabricated quotes are explicitly blocked downstream so an empty
 * quote list is safer than a guessed one.
 * ─────────────────────────────────────────────────────────────
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { dirname } from 'path'
import { dataFile } from './data-dir.js'

const CHANNEL_HANDLE = process.env.GRI_YOUTUBE_HANDLE || '@GenderRevealIdeasAustralia'
const CHANNEL_URL = `https://www.youtube.com/${CHANNEL_HANDLE}/videos`

const VIDEO_LIST_CACHE = dataFile('blog-autopublish/youtube-videos.json')
const TRANSCRIPT_CACHE_DIR = dataFile('blog-autopublish/transcripts')
const LIST_TTL_MS = 24 * 60 * 60 * 1000 // 24h
const TRANSCRIPT_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30d

/**
 * Top-level: return up to `max` transcript objects ranked by
 * relevance to `keyword`.
 *
 * @returns {Promise<Array<{
 *   videoId: string,
 *   title: string,
 *   url: string,
 *   transcript: string,
 *   relevance: number
 * }>>}
 */
export async function getRelevantTranscripts(keyword, max = 5) {
  const videos = await listChannelVideos()
  if (videos.length === 0) {
    console.warn('[YouTubeTranscripts] Channel video list empty')
    return []
  }

  const tokens = keyword.toLowerCase().split(/\s+/).filter(t => t.length > 2)
  // Initial title-only ranking to avoid fetching all transcripts
  const scoredByTitle = videos.map(v => ({
    ...v,
    _titleScore: scoreOverlap(v.title.toLowerCase(), tokens),
  }))
  scoredByTitle.sort((a, b) => b._titleScore - a._titleScore)

  // Pull transcripts for the top 10 title matches (or first 10 if none score)
  const candidates = scoredByTitle.slice(0, 10)

  const enriched = []
  for (const v of candidates) {
    const transcript = await fetchTranscriptCached(v.videoId)
    if (!transcript || transcript.length < 80) continue
    const combined = `${v.title} ${transcript}`.toLowerCase()
    const relevance = scoreOverlap(combined, tokens)
    enriched.push({
      videoId: v.videoId,
      title: v.title,
      url: `https://www.youtube.com/watch?v=${v.videoId}`,
      transcript,
      relevance,
    })
  }

  enriched.sort((a, b) => b.relevance - a.relevance)
  return enriched.slice(0, max)
}

// ────────────────────────────────────────────────────────────
// Channel video list scrape
// ────────────────────────────────────────────────────────────

async function listChannelVideos() {
  // Cache hit?
  try {
    if (existsSync(VIDEO_LIST_CACHE)) {
      const raw = JSON.parse(readFileSync(VIDEO_LIST_CACHE, 'utf-8'))
      const age = Date.now() - new Date(raw.fetchedAt).getTime()
      if (age < LIST_TTL_MS && Array.isArray(raw.videos) && raw.videos.length > 0) {
        return raw.videos
      }
    }
  } catch {}

  try {
    const res = await fetch(CHANNEL_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        'Accept-Language': 'en-AU,en;q=0.9',
      },
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) {
      console.warn(`[YouTubeTranscripts] Channel page ${res.status}`)
      return []
    }
    const html = await res.text()

    // Pull the ytInitialData JSON blob that powers the channel grid
    const marker = 'var ytInitialData = '
    const start = html.indexOf(marker)
    if (start === -1) return []
    const jsonStart = start + marker.length
    const end = html.indexOf('};', jsonStart)
    if (end === -1) return []
    const blob = html.slice(jsonStart, end + 1)

    let data
    try { data = JSON.parse(blob) } catch { return [] }

    const videos = extractVideosFromInitialData(data)
    mkdirSync(dirname(VIDEO_LIST_CACHE), { recursive: true })
    writeFileSync(VIDEO_LIST_CACHE, JSON.stringify({
      fetchedAt: new Date().toISOString(),
      videos,
    }, null, 2))
    console.log(`[YouTubeTranscripts] Scraped ${videos.length} videos from ${CHANNEL_HANDLE}`)
    return videos
  } catch (e) {
    console.error('[YouTubeTranscripts] Channel scrape failed:', e.message)
    return []
  }
}

function extractVideosFromInitialData(data) {
  // Walk the tree looking for videoRenderer nodes
  const results = []
  const seen = new Set()
  function walk(node) {
    if (!node || typeof node !== 'object') return
    if (node.videoRenderer) {
      const v = node.videoRenderer
      const id = v.videoId
      if (id && !seen.has(id)) {
        const title = v.title?.runs?.[0]?.text || v.title?.simpleText || ''
        results.push({ videoId: id, title })
        seen.add(id)
      }
    }
    if (Array.isArray(node)) for (const child of node) walk(child)
    else for (const k of Object.keys(node)) walk(node[k])
  }
  walk(data)
  return results
}

// ────────────────────────────────────────────────────────────
// Transcript fetch via public timedtext endpoint
// ────────────────────────────────────────────────────────────

async function fetchTranscriptCached(videoId) {
  const path = `${TRANSCRIPT_CACHE_DIR}/${videoId}.txt`
  try {
    if (existsSync(path)) {
      // Check mtime
      const stat = readFileSync(path, 'utf-8')
      // Simple mtime check via file header: we prepend a timestamp line
      const firstLine = stat.split('\n', 1)[0]
      const ts = Number(firstLine.replace('# ', '')) || 0
      if (Date.now() - ts < TRANSCRIPT_TTL_MS) {
        return stat.split('\n').slice(1).join('\n').trim()
      }
    }
  } catch {}

  const transcript = await fetchTranscript(videoId)
  try {
    mkdirSync(TRANSCRIPT_CACHE_DIR, { recursive: true })
    writeFileSync(path, `# ${Date.now()}\n${transcript || ''}`)
  } catch {}
  return transcript
}

async function fetchTranscript(videoId) {
  // Step 1: fetch the watch page to find the captions baseUrl
  try {
    const watchRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        'Accept-Language': 'en-AU,en;q=0.9',
      },
      signal: AbortSignal.timeout(20000),
    })
    if (!watchRes.ok) return ''
    const html = await watchRes.text()

    // Pull captionTracks from the player response
    const captionMatch = html.match(/"captionTracks":(\[[^\]]+\])/)
    if (!captionMatch) return ''

    let tracks
    try { tracks = JSON.parse(captionMatch[1]) } catch { return '' }

    // Prefer English (en-AU, en, en-US)
    const preferred = tracks.find(t => (t.languageCode || '').startsWith('en')) || tracks[0]
    if (!preferred?.baseUrl) return ''

    const baseUrl = preferred.baseUrl.replace(/\\u0026/g, '&')
    const capRes = await fetch(baseUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(15000),
    })
    if (!capRes.ok) return ''
    const xml = await capRes.text()

    // Strip XML and decode entities — timedtext returns <text start="..." dur="...">line</text>
    const lines = []
    const re = /<text[^>]*>([\s\S]*?)<\/text>/g
    let m
    while ((m = re.exec(xml)) !== null) {
      const line = m[1]
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
        .replace(/\s+/g, ' ')
        .trim()
      if (line) lines.push(line)
    }
    return lines.join(' ').trim()
  } catch (e) {
    console.warn(`[YouTubeTranscripts] Transcript fetch failed for ${videoId}:`, e.message)
    return ''
  }
}

// ────────────────────────────────────────────────────────────
// Utility
// ────────────────────────────────────────────────────────────

function scoreOverlap(text, tokens) {
  let score = 0
  for (const t of tokens) {
    const count = (text.match(new RegExp(`\\b${escapeRegex(t)}\\b`, 'g')) || []).length
    score += count
  }
  return score
}

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }
