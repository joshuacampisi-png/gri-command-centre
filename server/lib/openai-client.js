import fs from 'node:fs/promises'
import path from 'node:path'
import OpenAI from 'openai'

// GPT-4o pricing (USD per 1M tokens) — 2025 rates, update when OpenAI revises
// https://openai.com/api/pricing/
const GPT4O_INPUT_USD_PER_1M = 2.50
const GPT4O_OUTPUT_USD_PER_1M = 10.00

let _client = null

export function isOpenAIConfigured() {
  const key = process.env.OPENAI_API_KEY
  return typeof key === 'string' && key.trim().length > 0
}

export function getOpenAIClient() {
  if (!isOpenAIConfigured()) {
    throw new Error('OPENAI_API_KEY not set in .env — add it from https://platform.openai.com/api-keys')
  }
  if (!_client) {
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
  return _client
}

function mimeFromPath(filePath) {
  const ext = path.extname(filePath).toLowerCase().replace('.', '')
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'png') return 'image/png'
  if (ext === 'gif') return 'image/gif'
  if (ext === 'webp') return 'image/webp'
  return 'application/octet-stream'
}

function computeCostUsd({ model, usage }) {
  if (!usage) return 0
  const promptTokens = usage.prompt_tokens || 0
  const completionTokens = usage.completion_tokens || 0
  if (model && model.startsWith('gpt-4o')) {
    const inputCost = (promptTokens / 1_000_000) * GPT4O_INPUT_USD_PER_1M
    const outputCost = (completionTokens / 1_000_000) * GPT4O_OUTPUT_USD_PER_1M
    return Number((inputCost + outputCost).toFixed(6))
  }
  return 0
}

export async function callOpenAIVision({ imagePath, prompt, model = 'gpt-4o', maxTokens = 800 }) {
  if (!imagePath) throw new Error('callOpenAIVision: imagePath is required')
  if (!prompt) throw new Error('callOpenAIVision: prompt is required')

  const client = getOpenAIClient()

  let dataUrl
  try {
    const buf = await fs.readFile(imagePath)
    const b64 = buf.toString('base64')
    const mime = mimeFromPath(imagePath)
    dataUrl = `data:${mime};base64,${b64}`
  } catch (err) {
    throw new Error(`callOpenAIVision: failed to read image at ${imagePath} — ${err.message}`)
  }

  try {
    const response = await client.chat.completions.create({
      model,
      max_tokens: maxTokens,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: dataUrl } }
          ]
        }
      ]
    })

    const text = response.choices?.[0]?.message?.content ?? ''
    const usage = response.usage ?? null
    const costUsd = computeCostUsd({ model, usage })

    return { text, model, usage, costUsd }
  } catch (err) {
    const message = err?.response?.data?.error?.message || err?.message || String(err)
    throw new Error(`OpenAI vision call failed: ${message}`)
  }
}
