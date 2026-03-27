/**
 * Fal.ai Image Generation — Nano Banana Pro
 * ─────────────────────────────────────────────────────────────
 * All image generation uses Google Nano Banana Pro via Fal.ai.
 *
 * Two modes:
 * 1. Edit mode (reference images available):
 *    Uses /edit endpoint with image_urls array.
 *    Passes real product photos so the generated image
 *    features the actual product. $0.15/image.
 *
 * 2. Text-to-image (no reference):
 *    Pure prompt generation via Nano Banana Pro.
 *    $0.15/image.
 *
 * Both at 2K resolution, native aspect ratio support.
 * ─────────────────────────────────────────────────────────────
 */

const FAL_BASE_URL = 'https://queue.fal.run'

// Nano Banana Pro (Google Gemini 3 Pro Image)
const NANO_BANANA_PRO = 'fal-ai/nano-banana-pro'
// Edit endpoint for image-to-image with reference photos
const NANO_BANANA_EDIT = 'fal-ai/nano-banana-pro/edit'

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
async function pollForResult(statusUrl, maxAttempts = 90) {
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

  throw new Error('Nano Banana Pro generation timed out after 180 seconds')
}

/**
 * Validate reference image URLs — return array of valid ones.
 * Checks each URL is reachable and serves an image content type.
 */
async function resolveReferenceImages(referenceImageUrls) {
  if (!referenceImageUrls || referenceImageUrls.length === 0) return []

  const valid = []
  // Nano Banana Pro supports up to 14 reference images
  for (const url of referenceImageUrls.slice(0, 6)) {
    try {
      const res = await fetch(url, {
        method: 'HEAD',
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WOGBot/1.0)' },
        signal: AbortSignal.timeout(6000),
      })
      if (res.ok) {
        const ct = res.headers.get('content-type') || ''
        if (ct.startsWith('image/')) {
          valid.push(url)
          console.log(`[Nano Banana Pro] Reference OK: ${url.slice(0, 80)}...`)
        }
      }
    } catch {}
  }

  if (valid.length === 0) {
    console.log('[Nano Banana Pro] No valid reference images found, using text-to-image')
  }

  return valid
}

/**
 * Submit to Fal.ai queue and poll for result
 */
async function submitAndPoll(modelId, body) {
  const headers = getAuthHeaders()

  console.log(`[Nano Banana Pro] Submitting to ${modelId}...`)

  const submitRes = await fetch(`${FAL_BASE_URL}/${modelId}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  if (!submitRes.ok) {
    const text = await submitRes.text()
    throw new Error(`Nano Banana Pro submit failed (${submitRes.status}): ${text}`)
  }

  const submitData = await submitRes.json()
  const requestId = submitData.request_id
  const statusUrl = submitData.status_url

  if (!requestId) throw new Error('No request ID returned from Fal.ai')

  console.log(`[Nano Banana Pro] Queued request ${requestId}, polling...`)

  // Check for instant response
  if (submitData.response_url && submitData.status === 'COMPLETED') {
    const resultRes = await fetch(submitData.response_url, { headers })
    if (resultRes.ok) {
      const result = await resultRes.json()
      const imageUrl = result.images?.[0]?.url
      if (imageUrl) {
        console.log(`[Nano Banana Pro] Done (instant): ${imageUrl.slice(0, 80)}...`)
        return { imageUrl, requestId }
      }
    }
  }

  const pollUrl = statusUrl || `${FAL_BASE_URL}/${modelId}/requests/${requestId}/status`
  const imageUrl = await pollForResult(pollUrl)
  console.log(`[Nano Banana Pro] Done: ${imageUrl.slice(0, 80)}...`)

  return { imageUrl, requestId }
}

/**
 * Generate a single image via Nano Banana Pro
 *
 * If referenceImageUrls provided → Edit mode
 *   Uses /edit endpoint with image_urls array.
 *   The real product photos are passed as reference images.
 *   Prompt describes the scene and context.
 *   The model uses the reference photos to accurately
 *   represent the product in the generated scene.
 *
 * If no reference → Text-to-Image
 *   Pure prompt generation via Nano Banana Pro.
 *
 * @param {object} options
 * @param {string} options.prompt - Image generation prompt
 * @param {string} options.aspectRatio - '16:9' | '9:16' | '1:1' etc
 * @param {string[]} [options.referenceImageUrls] - Real product photo URLs
 * @returns {Promise<{imageUrl: string, requestId: string}>}
 */
export async function generateImage({ prompt, aspectRatio, referenceImageUrls }) {
  if (!prompt) throw new Error('prompt required')
  if (!aspectRatio) throw new Error('aspectRatio required')

  const validRefs = await resolveReferenceImages(referenceImageUrls)

  if (validRefs.length > 0) {
    // ── EDIT MODE — REFERENCE IMAGES ──────────────────────────
    // Real product photos passed via image_urls.
    // Nano Banana Pro uses them as visual references
    // to accurately represent the product in the scene.
    console.log(`[Nano Banana Pro] EDIT mode with ${validRefs.length} reference image(s): "${prompt.slice(0, 60)}..."`)

    return submitAndPoll(NANO_BANANA_EDIT, {
      prompt,
      image_urls: validRefs,
      num_images: 1,
      aspect_ratio: aspectRatio,
      resolution: '2K',
      output_format: 'jpeg',
      safety_tolerance: '4',
    })
  }

  // ── TEXT-TO-IMAGE ──────────────────────────────────────────
  console.log(`[Nano Banana Pro] TEXT mode: "${prompt.slice(0, 60)}..."`)

  return submitAndPoll(NANO_BANANA_PRO, {
    prompt,
    num_images: 1,
    aspect_ratio: aspectRatio,
    resolution: '2K',
    output_format: 'jpeg',
    safety_tolerance: '4',
  })
}
