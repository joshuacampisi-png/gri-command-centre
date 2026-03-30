process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

import { appendFile } from 'node:fs/promises'
import { env } from './env.js'
import { workflowCreateTask } from '../workflows/core.js'
import { detectCompanyFromText, extractFirstUrl, extractUrls } from './telegram-intake.js'
import { handleApproval } from './approval-queue.js'
import { persistRemoteMedia } from './task-media.js'

const TELEGRAM_API = 'https://api.telegram.org'
const LOG_PATH = '/tmp/centralhubworkbot.log'
let offset = 0
let running = false

// Allowed users (Josh + Beatriz)
const ALLOWED_USER_IDS = [
  8040702286,  // Josh
  5113119463   // Beatriz
]

async function logEvent(event, data = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), event, ...data }) + '\n'
  try {
    await appendFile(LOG_PATH, line, 'utf8')
  } catch {}
}

function endpoint(method) {
  return `${TELEGRAM_API}/bot${env.telegram.botToken}/${method}`
}

async function telegramCall(method, payload = {}) {
  const response = await fetch(endpoint(method), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  const data = await response.json().catch(() => null)
  if (!response.ok || !data?.ok) {
    throw new Error(data?.description || `Telegram API error on ${method}`)
  }
  return data.result
}

function messageText(message = {}) {
  return String(message.text || message.caption || '').trim()
}

function isTask(text = '') {
  const lower = text.toLowerCase()
  return lower.startsWith('/task') || lower.startsWith('#task') || lower.startsWith('task:')
}

function normalizeTaskText(text = '') {
  return String(text)
    .replace(/^\/task\s*/i, '')
    .replace(/^#task\s*/i, '')
    .replace(/^task:\s*/i, '')
    .trim()
}

function safeUser(user = {}) {
  return {
    id: user.id || null,
    username: user.username || '',
    first_name: user.first_name || '',
    last_name: user.last_name || ''
  }
}

async function mediaReferencesFromMessage(message = {}) {
  const refs = []
  const fileIds = []

  if (Array.isArray(message.photo) && message.photo.length) {
    fileIds.push(message.photo[message.photo.length - 1].file_id)
  }
  if (message.document?.file_id) {
    fileIds.push(message.document.file_id)
  }

  for (const fileId of fileIds) {
    const file = await telegramCall('getFile', { file_id: fileId })
    if (file?.file_path) {
      const remoteUrl = `${TELEGRAM_API}/file/bot${env.telegram.botToken}/${file.file_path}`
      const persistedUrl = await persistRemoteMedia(remoteUrl, file.file_path)
      refs.push(persistedUrl)
    }
  }

  return refs
}

async function sendConfirmation(chatId, replyToMessageId, company, notionUrl) {
  const text = `Task lodged for ${company}\n${notionUrl}`
  await telegramCall('sendMessage', {
    chat_id: chatId,
    text,
    reply_parameters: replyToMessageId ? { message_id: replyToMessageId } : undefined,
    link_preview_options: { is_disabled: true }
  })
}

async function sendFailure(chatId, replyToMessageId, message) {
  await telegramCall('sendMessage', {
    chat_id: chatId,
    text: message,
    reply_parameters: replyToMessageId ? { message_id: replyToMessageId } : undefined,
    link_preview_options: { is_disabled: true }
  })
}

async function handleMessage(message) {
  const text = messageText(message)
  const matched = isTask(text)

  await logEvent('message_received', {
    chat: { id: message.chat?.id, type: message.chat?.type || '', title: message.chat?.title || '' },
    from: safeUser(message.from),
    message_id: message.message_id,
    text,
    matched
  })

  // Check user allowlist
  const userId = message.from?.id
  if (!ALLOWED_USER_IDS.includes(userId)) {
    await logEvent('user_not_allowed', {
      userId,
      username: message.from?.username,
      chatId: message.chat?.id
    })
    await sendFailure(message.chat.id, message.message_id, 'Sorry, you are not authorized to use this bot.')
    return
  }

  // Handle approval commands
  if (text.startsWith('/approve ') || text.startsWith('/reject ') || text.startsWith('/defer ')) {
    const parts = text.split(' ')
    const action = parts[0].substring(1) // remove /
    const taskId = parts[1]
    
    if (taskId) {
      const result = await handleApproval(taskId, action, message.from?.id)
      return
    } else {
      await sendFailure(message.chat.id, message.message_id, 'Please provide a task ID: /approve <taskId>')
      return
    }
  }

  if (!matched) return

  const normalized = normalizeTaskText(text)
  const company = detectCompanyFromText(normalized)
  if (!company) {
    await logEvent('task_rejected_missing_company', {
      chatId: message.chat?.id,
      message_id: message.message_id,
      normalized
    })
    await sendFailure(message.chat.id, message.message_id, 'Task not lodged. Start with /task and include Lionzen, GBU, or GRI.')
    return
  }

  const urls = extractUrls(normalized)
  const creativeLink = extractFirstUrl(normalized)
  const title = normalized.replace(/https?:\/\/\S+/gi, '').trim() || `New ${company} task`
  const mediaReferences = await mediaReferencesFromMessage(message)

  const result = await workflowCreateTask({
    company,
    title,
    creativeLink,
    referenceLinks: urls,
    mediaReferences,
    description: normalized,
    owner: 'ops-manager',
    source: 'telegram-bot',
    fn: 'Ops',
    priority: 'Medium',
    status: 'Backlog'
  })

  await logEvent('task_lodged', {
    chatId: message.chat?.id,
    message_id: message.message_id,
    company,
    title,
    notionUrl: result.notionUrl,
    from: safeUser(message.from)
  })

  await sendConfirmation(message.chat.id, message.message_id, company, result.notionUrl)
}

async function pollLoop() {
  while (running) {
    try {
      const updates = await telegramCall('getUpdates', {
        offset,
        timeout: 30,
        allowed_updates: ['message']
      })

      for (const update of updates) {
        offset = update.update_id + 1
        if (update.message) {
          try {
            await handleMessage(update.message)
          } catch (error) {
            const err = String(error?.message || error)
            console.error('[telegram-polling-bot] handleMessage failed:', err)
            await logEvent('task_error', {
              chatId: update.message.chat?.id,
              message_id: update.message.message_id,
              error: err,
              from: safeUser(update.message.from),
              text: messageText(update.message)
            })
            try {
              await sendFailure(update.message.chat.id, update.message.message_id, 'Task not lodged. Please try again in a moment.')
            } catch {}
          }
        }
      }
    } catch (error) {
      const err = String(error?.message || error)
      // 409 = another consumer called getUpdates (debug curl etc.) — just retry quickly
      if (err.includes('409') || err.includes('Conflict')) {
        console.warn('[telegram-polling-bot] 409 conflict — retrying in 2s')
        await new Promise(resolve => setTimeout(resolve, 2000))
      } else {
        console.error('[telegram-polling-bot] poll failed:', err)
        await logEvent('poll_error', { error: err })
        await new Promise(resolve => setTimeout(resolve, 3000))
      }
    }
  }
}

export async function startTelegramPollingBot() {
  if (!env.telegram.botToken || running) return
  running = true
  await logEvent('bot_starting', {})

  // Clear any webhook (OpenClaw may have set one) and drop pending to avoid stale messages
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await telegramCall('deleteWebhook', { drop_pending_updates: true })
      await logEvent('delete_webhook_ok', {})
      break
    } catch (error) {
      const err = String(error?.message || error)
      console.error(`[telegram-polling-bot] deleteWebhook attempt ${attempt}/3 failed:`, err)
      await logEvent('delete_webhook_failed', { error: err, attempt })
      if (attempt < 3) await new Promise(r => setTimeout(r, 2000))
    }
  }

  console.log('[telegram-polling-bot] ✅ Started — Claude Code owns Telegram bot')
  await logEvent('bot_started', {})
  pollLoop()
}
