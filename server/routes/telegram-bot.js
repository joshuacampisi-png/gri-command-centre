import { Router } from 'express'
import { workflowCreateTask } from '../workflows/core.js'
import { buildMissingCompanyReply, buildStaffConfirmation, detectCompanyFromText, extractFirstUrl, extractUrls } from '../lib/telegram-intake.js'
import { detectTaskType, makeTaskTitle } from '../lib/task-template.js'
import { env } from '../lib/env.js'
import { buildTelegramFileUrl, getTelegramFile, getTelegramWebhookInfo, sendTelegramMessage, setTelegramWebhook } from '../connectors/telegram.js'

const router = Router()

function textFromMessage(message = {}) {
  return message.text || message.caption || ''
}

function shouldTreatAsTask(message = {}, text = '') {
  const chatType = message.chat?.type || ''
  const lower = String(text).toLowerCase()
  if (lower.startsWith('/task')) return true
  if (lower.startsWith('#task')) return true
  if (lower.startsWith('task:')) return true
  if (chatType === 'private') return true
  return false
}

async function mediaReferencesFromMessage(message = {}) {
  const refs = []

  if (Array.isArray(message.photo) && message.photo.length) {
    const largest = message.photo[message.photo.length - 1]
    const file = await getTelegramFile(largest.file_id)
    const url = buildTelegramFileUrl(file?.file_path)
    if (url) refs.push(url)
  }

  if (message.document?.file_id) {
    const file = await getTelegramFile(message.document.file_id)
    const url = buildTelegramFileUrl(file?.file_path)
    if (url) refs.push(url)
  }

  return refs
}

function normalizeTaskText(text = '') {
  return String(text)
    .replace(/^\/task\s*/i, '')
    .replace(/^#task\s*/i, '')
    .replace(/^task:\s*/i, '')
    .trim()
}

router.get('/status', async (_req, res) => {
  try {
    const info = await getTelegramWebhookInfo()
    res.json({ ok: true, configured: Boolean(env.telegram.botToken), webhook: info })
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error?.message || error) })
  }
})

router.post('/set-webhook', async (req, res) => {
  try {
    const result = await setTelegramWebhook(req.body?.url)
    res.json(result)
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error?.message || error) })
  }
})

router.post('/webhook', async (req, res) => {
  try {
    const expected = env.telegram.webhookSecret
    const provided = req.get('x-telegram-bot-api-secret-token') || ''
    if (expected && provided !== expected) {
      return res.status(401).json({ ok: false, error: 'Invalid webhook secret' })
    }

    const message = req.body?.message
    if (!message) return res.json({ ok: true, ignored: 'No message payload' })

    const text = textFromMessage(message)
    if (!shouldTreatAsTask(message, text)) {
      return res.json({ ok: true, ignored: 'Message did not match task intake rules' })
    }

    const normalizedText = normalizeTaskText(text)
    const company = detectCompanyFromText(normalizedText)
    if (!company) {
      const reply = buildMissingCompanyReply()
      await sendTelegramMessage({ chatId: message.chat.id, text: reply, replyToMessageId: message.message_id })
      return res.json({ ok: false, needsCompany: true, reply })
    }

    const urls = extractUrls(normalizedText)
    const creativeLink = extractFirstUrl(normalizedText)
    const mediaReferences = await mediaReferencesFromMessage(message)
    const taskType = detectTaskType(normalizedText)
    const title = makeTaskTitle(normalizedText, taskType)

    const result = await workflowCreateTask({
      company,
      title: title || `New ${company} task`,
      creativeLink,
      referenceLinks: urls,
      mediaReferences,
      description: normalizedText,
      owner: 'ops-manager',
      source: 'telegram',
      fn: 'Ops',
      priority: 'Medium',
      status: 'Backlog'
    })

    const reply = buildStaffConfirmation({
      company,
      notionUrl: result.notionUrl
    })

    await sendTelegramMessage({
      chatId: message.chat.id,
      text: reply,
      replyToMessageId: message.message_id
    })

    res.json({ ok: true, company, result, reply })
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error?.message || error) })
  }
})

export default router
