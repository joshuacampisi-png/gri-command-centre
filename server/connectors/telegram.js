import { env } from '../lib/env.js'

const TELEGRAM_API = 'https://api.telegram.org'

function telegramEndpoint(method) {
  if (!env.telegram.botToken) throw new Error('Telegram bot token is not configured')
  return `${TELEGRAM_API}/bot${env.telegram.botToken}/${method}`
}

async function telegramCall(method, payload = {}) {
  const response = await fetch(telegramEndpoint(method), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  const data = await response.json()
  if (!response.ok || !data?.ok) {
    throw new Error(data?.description || `Telegram API error on ${method}`)
  }
  return data.result
}

export async function sendTelegramMessage({ chatId, text, replyToMessageId }) {
  if (!env.telegram.botToken) return { ok: false, reason: 'Telegram bot not configured' }
  const payload = {
    chat_id: chatId,
    text,
    reply_parameters: replyToMessageId ? { message_id: replyToMessageId } : undefined,
    link_preview_options: { is_disabled: true }
  }
  const result = await telegramCall('sendMessage', payload)
  return { ok: true, result }
}

export async function setTelegramWebhook(url = env.telegram.webhookUrl) {
  if (!url) throw new Error('Telegram webhook URL is not configured')
  const result = await telegramCall('setWebhook', {
    url,
    secret_token: env.telegram.webhookSecret || undefined,
    allowed_updates: ['message']
  })
  return { ok: true, result }
}

export async function getTelegramWebhookInfo() {
  if (!env.telegram.botToken) return { ok: false, reason: 'Telegram bot not configured' }
  const result = await telegramCall('getWebhookInfo')
  return { ok: true, result }
}

export async function getTelegramFile(fileId) {
  if (!env.telegram.botToken || !fileId) return null
  const result = await telegramCall('getFile', { file_id: fileId })
  return result
}

export function buildTelegramFileUrl(filePath = '') {
  if (!env.telegram.botToken || !filePath) return ''
  return `${TELEGRAM_API}/file/bot${env.telegram.botToken}/${filePath}`
}
