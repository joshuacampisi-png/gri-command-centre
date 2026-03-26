/**
 * Higgsfield Image Generation Client
 * ─────────────────────────────────────────────────────────────
 * Submits image generation requests to Higgsfield Nano Banana Pro
 * and polls for completion. Supports desktop (16:9) and mobile
 * (9:16) variants at 2K resolution.
 * ─────────────────────────────────────────────────────────────
 */

const HF_BASE_URL = 'https://platform.higgsfield.ai'

const MODELS = {
  nanoBananaPro: '/v1/text2image/nano-banana-pro',
  nanoBanana2:   '/v1/text2image/nano-banana-2',
}

function getAuthToken() {
  const key    = process.env.HIGGSFIELD_API_KEY
  const secret = process.env.HIGGSFIELD_API_SECRET
  if (!key || !secret) throw new Error('HIGGSFIELD_API_KEY and HIGGSFIELD_API_SECRET required in .env')
  return `Key ${key}:${secret}`
}

export function hasHiggsfieldConfig() {
  return Boolean(process.env.HIGGSFIELD_API_KEY && process.env.HIGGSFIELD_API_SECRET)
}

async function pollForResult(requestId, authToken, maxAttempts = 40) {
  const statusUrl = `${HF_BASE_URL}/v1/requests/${requestId}/status`

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 2000))

    const res = await fetch(statusUrl, {
      headers: {
        'Authorization': authToken,
        'Content-Type': 'application/json',
      },
    })

    if (!res.ok) {
      if (attempt < 3) continue
      throw new Error(`Status check failed: ${res.status}`)
    }

    const data = await res.json()
    const status = (data.status || '').toLowerCase()

    if (status === 'completed') {
      const url =
        data.results?.[0]?.url ||
        data.output?.[0] ||
        data.images?.[0]?.url ||
        data.result?.url ||
        data.url

      if (!url) throw new Error('Completed but no image URL in response')
      return url
    }

    if (status === 'failed' || status === 'cancelled' || status === 'nsfw') {
      throw new Error(`Generation ended with status: ${status}`)
    }
  }

  throw new Error('Image generation timed out after 80 seconds')
}

/**
 * Generate a single image via Higgsfield
 * @param {string} prompt - Image generation prompt
 * @param {string} aspectRatio - '16:9' | '9:16' | '1:1' | '4:3' | '3:4' | '4:5'
 * @param {string} resolution - '1K' | '2K' | '4K'
 * @param {string} model - 'nanoBananaPro' | 'nanoBanana2'
 * @returns {Promise<{imageUrl: string, requestId: string}>}
 */
export async function generateImage({ prompt, aspectRatio, resolution = '2K', model = 'nanoBananaPro' }) {
  if (!prompt) throw new Error('prompt required')
  if (!aspectRatio) throw new Error('aspectRatio required')

  const authToken = getAuthToken()
  const endpoint = `${HF_BASE_URL}${MODELS[model] || MODELS.nanoBananaPro}`

  console.log(`[Higgsfield] Submitting ${aspectRatio} image: "${prompt.slice(0, 60)}..."`)

  const submitRes = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': authToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prompt, aspect_ratio: aspectRatio, resolution }),
  })

  if (!submitRes.ok) {
    const text = await submitRes.text()
    throw new Error(`Higgsfield submit failed (${submitRes.status}): ${text}`)
  }

  const submitData = await submitRes.json()
  const requestId = submitData.request_id || submitData.id || submitData.task_id

  if (!requestId) throw new Error('No request ID returned from Higgsfield')

  console.log(`[Higgsfield] Polling request ${requestId}...`)
  const imageUrl = await pollForResult(requestId, authToken)
  console.log(`[Higgsfield] Done: ${imageUrl.slice(0, 80)}...`)

  return { imageUrl, requestId }
}
