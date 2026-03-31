/**
 * instagram-publisher.js
 * Meta Graph API Content Publishing wrapper for Instagram Business account.
 *
 * Supports: single image, carousel (up to 10 images), and Reels (video).
 * Uses the two-step flow: create media container → publish container.
 */

const BASE = 'https://graph.facebook.com/v20.0'

function igToken() {
  return process.env.META_PAGE_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN || ''
}

function igAccountId() {
  return process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID || ''
}

export function isInstagramConfigured() {
  return Boolean(igToken() && igAccountId())
}

// ── Low-level Graph API helpers ─────────────────────────────────────────────

async function igGet(path, params = {}) {
  const url = new URL(`${BASE}${path}`)
  url.searchParams.set('access_token', igToken())
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url.toString())
  const data = await res.json()
  if (data.error) throw new Error(`Instagram API: ${data.error.message}`)
  return data
}

async function igPost(path, body = {}) {
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
  console.log(`[IG Publisher] Creating Reel container: ${videoUrl.slice(0, 80)}...`)

  // Step 1: Create video container
  const params = {
    video_url: videoUrl,
    caption,
    media_type: 'REELS',
  }
  if (coverUrl) params.cover_url = coverUrl

  const container = await igPost(`/${accountId}/media`, params)

  // Step 2: Wait for video processing
  await waitForMediaReady(container.id)

  // Step 3: Publish
  const result = await igPost(`/${accountId}/media_publish`, {
    creation_id: container.id,
  })

  console.log(`[IG Publisher] Reel published: ${result.id}`)
  return { igPostId: result.id, permalink: await getPermalink(result.id) }
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
