/**
 * Fal.ai Image Generation Client
 * ─────────────────────────────────────────────────────────────
 * Two modes:
 * 1. Image-to-Image (when reference product photo available):
 *    Uses FLUX General img2img — takes the real product photo
 *    and varies the scene/background/lighting while keeping
 *    the product nearly identical. Strength 0.3 = product stays,
 *    scene changes.
 * 2. Text-to-Image (fallback, no reference):
 *    Uses FLUX 1.1 Pro Ultra for pure text generation.
 * ─────────────────────────────────────────────────────────────
 */

const FAL_BASE_URL = 'https://queue.fal.run'

// Image-to-image: product stays, scene varies
const IMG2IMG_MODEL = 'fal-ai/flux-general/image-to-image'
// Text-to-image fallback
const TXT2IMG_MODEL = 'fal-ai/flux-pro/v1.1-ultra'

// Strength controls how much the original image is preserved
// 0.0 = exact copy, 1.0 = completely new image
// 0.25-0.35 = product shape/colour/branding preserved, background varies
const IMG2IMG_STRENGTH = 0.30

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
      const responseUrl = data.response_url
      if (!responseUrl) throw new Error('Completed but no response_url')

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
  }

  throw new Error('Fal.ai image generation timed out after 120 seconds')
}

/**
 * Fetch first valid reference image URL.
 * Returns null if all fetches fail.
 */
async function resolveReferenceImage(referenceImageUrls) {
  if (!referenceImageUrls || referenceImageUrls.length === 0) return null

  for (const url of referenceImageUrls.slice(0, 4)) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WOGBot/1.0)' },
        signal: AbortSignal.timeout(8000),
      })
      if (res.ok) {
        const ct = res.headers.get('content-type') || ''
        if (ct.startsWith('image/')) {
          console.log(`[Fal.ai] Reference image validated: ${url.slice(0, 80)}...`)
          return url
        }
      }
    } catch {}
  }

  console.log('[Fal.ai] No valid reference images found, falling back to text-to-image')
  return null
}

/**
 * Map aspect ratio string to Fal.ai image_size enum
 */
function mapAspectRatio(aspectRatio) {
  const map = {
    '16:9': 'landscape_16_9',
    '9:16': 'portrait_16_9',
    '4:3': 'landscape_4_3',
    '3:4': 'portrait_4_3',
    '1:1': 'square_hd',
  }
  return map[aspectRatio] || 'landscape_16_9'
}

/**
 * Submit to Fal.ai queue and poll for result
 */
async function submitAndPoll(modelId, body) {
  const headers = getAuthHeaders()

  const submitRes = await fetch(`${FAL_BASE_URL}/${modelId}`, {
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

  // Check for instant response
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

  const pollUrl = statusUrl || `${FAL_BASE_URL}/${modelId}/requests/${requestId}/status`
  const imageUrl = await pollForResult(pollUrl)
  console.log(`[Fal.ai] Done: ${imageUrl.slice(0, 80)}...`)

  return { imageUrl, requestId }
}

/**
 * Generate a single image via Fal.ai
 *
 * If referenceImageUrls provided → Image-to-Image mode
 *   Takes the real product photo and varies the scene around it.
 *   Product shape, colour, branding preserved. Scene changes.
 *
 * If no reference → Text-to-Image fallback
 *   Pure prompt-based generation via FLUX 1.1 Pro Ultra.
 *
 * @param {object} options
 * @param {string} options.prompt - Scene description prompt
 * @param {string} options.aspectRatio - '16:9' | '9:16' | '1:1'
 * @param {string[]} [options.referenceImageUrls] - Real product photo URLs
 * @returns {Promise<{imageUrl: string, requestId: string}>}
 */
export async function generateImage({ prompt, aspectRatio, referenceImageUrls }) {
  if (!prompt) throw new Error('prompt required')
  if (!aspectRatio) throw new Error('aspectRatio required')

  const refImageUrl = await resolveReferenceImage(referenceImageUrls)

  if (refImageUrl) {
    // ── IMAGE-TO-IMAGE MODE ──────────────────────────────────
    // Real product photo as base. Low strength = product preserved.
    // Prompt describes the scene variation.
    console.log(`[Fal.ai] IMG2IMG mode (strength ${IMG2IMG_STRENGTH}): "${prompt.slice(0, 60)}..."`)

    return submitAndPoll(IMG2IMG_MODEL, {
      prompt,
      image_url: refImageUrl,
      strength: IMG2IMG_STRENGTH,
      image_size: mapAspectRatio(aspectRatio),
      num_images: 1,
      num_inference_steps: 28,
      guidance_scale: 3.5,
      output_format: 'jpeg',
    })
  }

  // ── TEXT-TO-IMAGE FALLBACK ────────────────────────────────
  console.log(`[Fal.ai] TXT2IMG fallback: "${prompt.slice(0, 60)}..."`)

  return submitAndPoll(TXT2IMG_MODEL, {
    prompt,
    aspect_ratio: aspectRatio,
    num_images: 1,
    output_format: 'jpeg',
    safety_tolerance: '2',
    raw: false,
  })
}
