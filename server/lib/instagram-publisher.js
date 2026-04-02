/**
 * instagram-publisher.js
 * Meta Graph API Content Publishing wrapper for Instagram Business account.
 *
 * Supports: single image, carousel (up to 10 images), and Reels (video).
 * Reels use resumable upload (sends bytes directly to Meta — no public URL needed).
 */

import { existsSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import { dataDir as _mediaDataDir } from './data-dir.js'

const BASE = 'https://graph.facebook.com/v20.0'

// Hardcoded GRI credentials — @gender.reveal.ideass via Gender Reveal Ideas page
const HARDCODED_PAGE_TOKEN = 'EAANF5wouQWYBRPaZBwnaG2NwORy7eZAggDxSiVuGYCx4ZAaaxnsSUm2KzQAeCvMmgmCgv0qfOFo03K6wkupFq5b1OZBDa9M3gUq3pMjD9P371lxtcxvPDHDZBqyZBPwUpu6ZADqq70EQpFrdbi1xkmxNRd0eFJmW5ZAhzZC7brYjsiiOvJzEo4ilxi24ohXEcC9lKNIsYtQB3BsKNq82U3W8K'
const HARDCODED_IG_ID = '17841448049372007'

export function igToken() {
  return process.env.META_PAGE_ACCESS_TOKEN || HARDCODED_PAGE_TOKEN
}

export function igAccountId() {
  return process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID || HARDCODED_IG_ID
}

export function isInstagramConfigured() {
  return Boolean(igToken() && igAccountId())
}

// ── Low-level Graph API helpers ─────────────────────────────────────────────

export async function igGet(path, params = {}) {
  const url = new URL(`${BASE}${path}`)
  url.searchParams.set('access_token', igToken())
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url.toString())
  const data = await res.json()
  if (data.error) throw new Error(`Instagram API: ${data.error.message}`)
  return data
}

export async function igPost(path, body = {}) {
  const url = `${BASE}${path}`
  const form = new URLSearchParams({ access_token: igToken(), ...body })
  const res = await fetch(url, { method: 'POST', body: form })
  const data = await res.json()
  if (data.error) throw new Error(`Instagram API: ${data.error.message}`)
  return data
}

// ── Media status polling (for Reels/video) ──────────────────────────────────

async function waitForMediaReady(containerId, maxWaitMs = 5 * 60 * 1000) {
  const start = Date.now()
  const pollInterval = 5000 // 5 seconds

  while (Date.now() - start < maxWaitMs) {
    const status = await igGet(`/${containerId}`, { fields: 'status_code,status' })
    console.log(`[IG Publisher] Container ${containerId} status: ${status.status_code}`)

    if (status.status_code === 'FINISHED') return true
    if (status.status_code === 'ERROR') {
      throw new Error(`Media processing failed: ${status.status || 'Unknown error'}`)
    }
    // IN_PROGRESS — wait and retry
    await new Promise(r => setTimeout(r, pollInterval))
  }
  throw new Error('Media processing timed out after 5 minutes')
}

// ── Publish: Single Image ───────────────────────────────────────────────────

export async function publishImage(imageUrl, caption) {
  const accountId = igAccountId()
  console.log(`[IG Publisher] Creating image container: ${imageUrl.slice(0, 80)}...`)

  // Step 1: Create media container
  const container = await igPost(`/${accountId}/media`, {
    image_url: imageUrl,
    caption,
  })

  // Step 2: Publish
  const result = await igPost(`/${accountId}/media_publish`, {
    creation_id: container.id,
  })

  console.log(`[IG Publisher] Image published: ${result.id}`)
  return { igPostId: result.id, permalink: await getPermalink(result.id) }
}

// ── Publish: Carousel ───────────────────────────────────────────────────────

export async function publishCarousel(mediaUrls, caption) {
  const accountId = igAccountId()
  console.log(`[IG Publisher] Creating carousel with ${mediaUrls.length} items`)

  if (mediaUrls.length < 2 || mediaUrls.length > 10) {
    throw new Error('Carousel requires 2-10 media items')
  }

  // Step 1: Create individual item containers (no caption on items)
  const childIds = []
  for (const url of mediaUrls) {
    const isVideo = /\.(mp4|mov)$/i.test(url)
    const params = isVideo
      ? { video_url: url, media_type: 'VIDEO', is_carousel_item: 'true' }
      : { image_url: url, is_carousel_item: 'true' }

    const child = await igPost(`/${accountId}/media`, params)
    childIds.push(child.id)

    // If video, wait for processing
    if (isVideo) await waitForMediaReady(child.id)
  }

  // Step 2: Create carousel container
  const carousel = await igPost(`/${accountId}/media`, {
    media_type: 'CAROUSEL',
    caption,
    children: childIds.join(','),
  })

  // Step 3: Publish
  const result = await igPost(`/${accountId}/media_publish`, {
    creation_id: carousel.id,
  })

  console.log(`[IG Publisher] Carousel published: ${result.id}`)
  return { igPostId: result.id, permalink: await getPermalink(result.id) }
}

// ── Publish: Reel ───────────────────────────────────────────────────────────

export async function publishReel(videoUrl, caption, coverUrl) {
  const accountId = igAccountId()
  console.log(`[IG Publisher] Creating Reel: ${videoUrl.slice(0, 80)}...`)

  // Try resumable upload first (reads file from disk — works on Railway)
  // Falls back to URL-based upload if file not on disk
  const localPath = resolveLocalPath(videoUrl)
  if (localPath) {
    return _publishReelResumable(accountId, localPath, caption, coverUrl)
  }

  // Fallback: URL-based (requires Meta to fetch from public URL)
  console.log(`[IG Publisher] Using URL-based upload (no local file found)`)
  const params = { video_url: videoUrl, caption, media_type: 'REELS' }
  if (coverUrl) params.cover_url = coverUrl
  const container = await igPost(`/${accountId}/media`, params)
  await waitForMediaReady(container.id)
  const result = await igPost(`/${accountId}/media_publish`, { creation_id: container.id })
  console.log(`[IG Publisher] Reel published: ${result.id}`)
  return { igPostId: result.id, permalink: await getPermalink(result.id) }
}

// Resumable upload — sends video bytes directly to Meta (no public URL needed)
async function _publishReelResumable(accountId, filePath, caption, coverUrl) {
  const fileSize = statSync(filePath).size
  console.log(`[IG Publisher] Resumable upload: ${filePath} (${(fileSize / 1048576).toFixed(1)}MB)`)

  // Step 1: Init resumable upload
  const initForm = new URLSearchParams({
    access_token: igToken(),
    media_type: 'REELS',
    upload_type: 'resumable',
  })
  if (caption) initForm.set('caption', caption)

  const initRes = await fetch(`${BASE}/${accountId}/media`, { method: 'POST', body: initForm })
  const initData = await initRes.json()
  if (initData.error) throw new Error(`Resumable init failed: ${initData.error.message}`)

  const containerId = initData.id
  const uploadUri = initData.uri
  console.log(`[IG Publisher] Upload URI: ${uploadUri}, container: ${containerId}`)

  // Step 2: Upload video bytes
  const videoData = readFileSync(filePath)
  const uploadRes = await fetch(uploadUri, {
    method: 'POST',
    headers: {
      'Authorization': `OAuth ${igToken()}`,
      'offset': '0',
      'file_size': String(fileSize),
      'Content-Type': 'application/octet-stream',
    },
    body: videoData,
  })
  const uploadResult = await uploadRes.json()
  if (!uploadResult.success) throw new Error(`Video upload failed: ${JSON.stringify(uploadResult)}`)
  console.log(`[IG Publisher] Upload complete`)

  // Step 3: Wait for processing
  await waitForMediaReady(containerId)

  // Step 4: Publish
  const result = await igPost(`/${accountId}/media_publish`, { creation_id: containerId })
  console.log(`[IG Publisher] Reel published: ${result.id}`)
  return { igPostId: result.id, permalink: await getPermalink(result.id) }
}

// Resolve a media URL to a local file path (for resumable uploads)
function resolveLocalPath(url) {
  try {
    // URL like /instagram-media/abc.mp4 or https://domain/instagram-media/abc.mp4
    const match = url.match(/\/instagram-media\/(.+)$/)
    if (!match) return null
    const filename = match[1]
    // Try data dir first (Railway volume)
    const volPath = join(_mediaDataDir('instagram-media'), filename)
    if (existsSync(volPath)) return volPath
    // Try public dir
    const pubPath = join(process.cwd(), 'public', 'instagram-media', filename)
    if (existsSync(pubPath)) return pubPath
    console.log(`[IG Publisher] Local file not found: tried ${volPath} and ${pubPath}`)
    return null
  } catch (e) {
    console.warn(`[IG Publisher] resolveLocalPath error:`, e.message)
    return null
  }
}

// ── Get permalink for a published post ──────────────────────────────────────

async function getPermalink(mediaId) {
  try {
    const data = await igGet(`/${mediaId}`, { fields: 'permalink' })
    return data.permalink || null
  } catch {
    return null
  }
}
