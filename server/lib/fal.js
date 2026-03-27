/**
 * Fal.ai Image Generation Client
 * ─────────────────────────────────────────────────────────────
 * Generates images via Fal.ai FLUX 1.1 Pro Ultra.
 * Supports desktop (16:9) and mobile (9:16) variants at
 * native 2K resolution. Replaces Higgsfield integration.
 * ─────────────────────────────────────────────────────────────
 */

const FAL_BASE_URL = 'https://queue.fal.run'
const FAL_STATUS_URL = 'https://queue.fal.run'

// FLUX 1.1 Pro Ultra — native 2K, strong photorealism, $0.06/image
const MODEL_ID = 'fal-ai/flux-pro/v1.1-ultra'

export function hasFalConfig() {
  return Boolean(process.env.FAL_KEY)
}

function getAuthHeaders() {
  const key = process.env.FAL_KEY
  if (!key) throw new Error('FAL_KEY required in environment variables')
  return {
    'Authorization': `Key ${key}`,
    'Content-Type': 'application/json',
  }
}

/**
 * Poll for image generation result
 */
async function pollForResult(statusUrl, maxAttempts = 60) {
  const headers = getAuthHeaders()

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 2000))

    const res = await fetch(statusUrl, { headers })

    if (!res.ok) {
      if (attempt < 3) continue
      throw new Error(`Fal.ai status check failed: ${res.status}`)
    }

    const data = await res.json()
    const status = (data.status || '').toUpperCase()

    if (status === 'COMPLETED') {
      // Response URL is in the response_url field
      const responseUrl = data.response_url
      if (!responseUrl) throw new Error('Completed but no response_url')

      // Fetch the actual result
      const resultRes = await fetch(responseUrl, { headers })
      if (!resultRes.ok) throw new Error(`Failed to fetch result: ${resultRes.status}`)

      const result = await resultRes.json()
      const imageUrl = result.images?.[0]?.url
      if (!imageUrl) throw new Error('Completed but no image URL in response')
      return imageUrl
    }

    if (status === 'FAILED') {
      throw new Error(`Fal.ai generation failed: ${data.error || 'unknown error'}`)
    }

    // IN_QUEUE or IN_PROGRESS — keep polling
  }

  throw new Error('Fal.ai image generation timed out after 120 seconds')
}

/**
 * Fetch first valid reference image URL and return it for conditioning.
 * Returns null if all fetches fail.
 */
async function resolveReferenceImage(referenceImageUrls) {
  if (!referenceImageUrls || referenceImageUrls.length === 0) return null

  // Try each URL until one works
  for (const url of referenceImageUrls.slice(0, 4)) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WOGBot/1.0)' },
        signal: AbortSignal.timeout(8000),
      })
      if (res.ok) {
        // Verify it's actually an image
        const ct = res.headers.get('content-type') || ''
        if (ct.startsWith('image/')) {
          console.log(`[Fal.ai] Using reference image: ${url.slice(0, 80)}...`)
          return url
        }
      }
    } catch {}
  }

  console.log('[Fal.ai] No valid reference images found, proceeding without')
  return null
}

/**
 * Generate a single image via Fal.ai FLUX 1.1 Pro Ultra
 * @param {object} options
 * @param {string} options.prompt - Image generation prompt
 * @param {string} options.aspectRatio - '16:9' | '9:16' | '1:1' | '4:3' | '3:4'
 * @param {string[]} [options.referenceImageUrls] - Reference image URLs for conditioning
 * @returns {Promise<{imageUrl: string, requestId: string}>}
 */
export async function generateImage({ prompt, aspectRatio, referenceImageUrls }) {
  if (!prompt) throw new Error('prompt required')
  if (!aspectRatio) throw new Error('aspectRatio required')

  const headers = getAuthHeaders()

  // Resolve a reference image for conditioning (if provided)
  const refImageUrl = await resolveReferenceImage(referenceImageUrls)
  const refCount = referenceImageUrls?.length || 0

  console.log(`[Fal.ai] Submitting ${aspectRatio} image (${refCount} refs): "${prompt.slice(0, 60)}..."`)

  // Build request body — add image_url for reference conditioning
  const body = {
    prompt,
    aspect_ratio: aspectRatio,
    num_images: 1,
    output_format: 'jpeg',
    safety_tolerance: '2',
    raw: false,
  }

  if (refImageUrl) {
    body.image_url = refImageUrl
    body.image_prompt_strength = 0.45 // strong conditioning — product shape, colour, proportions preserved from reference
  }

  // Submit to queue
  const submitRes = await fetch(`${FAL_BASE_URL}/${MODEL_ID}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  if (!submitRes.ok) {
    const text = await submitRes.text()
    throw new Error(`Fal.ai submit failed (${submitRes.status}): ${text}`)
  }

  const submitData = await submitRes.json()
  const requestId = submitData.request_id
  const statusUrl = submitData.status_url

  if (!requestId) throw new Error('No request ID returned from Fal.ai')

  console.log(`[Fal.ai] Queued request ${requestId}, polling...`)

  // If we got a response_url directly (sync response), try fetching result immediately
  if (submitData.response_url && submitData.status === 'COMPLETED') {
    const resultRes = await fetch(submitData.response_url, { headers })
    if (resultRes.ok) {
      const result = await resultRes.json()
      const imageUrl = result.images?.[0]?.url
      if (imageUrl) {
        console.log(`[Fal.ai] Done (instant): ${imageUrl.slice(0, 80)}...`)
        return { imageUrl, requestId }
      }
    }
  }

  // Poll for result
  const pollUrl = statusUrl || `${FAL_STATUS_URL}/${MODEL_ID}/requests/${requestId}/status`
  const imageUrl = await pollForResult(pollUrl)
  console.log(`[Fal.ai] Done: ${imageUrl.slice(0, 80)}...`)

  return { imageUrl, requestId }
}
