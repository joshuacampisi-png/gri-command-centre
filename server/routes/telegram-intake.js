import { Router } from 'express'
import { workflowCreateTask } from '../workflows/core.js'
import { buildMissingCompanyReply, buildStaffConfirmation, extractFirstUrl, extractUrls } from '../lib/telegram-intake.js'
import { parseTaskWithPablo } from '../connectors/anthropic.js'

const router = Router()

router.post('/ingest', async (req, res) => {
  try {
    const text = req.body?.text || ''
    const normalizedText = text
      .replace(/^\/task\s*/i, '')
      .replace(/^#task\s*/i, '')
      .replace(/^task:\s*/i, '')
      .trim()

    if (!normalizedText) {
      return res.json({ ok: false, reply: 'No task content found.' })
    }

    let parsed
    try {
      parsed = await parseTaskWithPablo(normalizedText)
    } catch (err) {
      console.error('[Pablo parse error]', err.message)
      return res.status(500).json({ ok: false, error: 'Pablo failed to parse the task.' })
    }

    const company = req.body?.company || parsed.company
    if (!company) {
      return res.json({ ok: false, needsCompany: true, reply: buildMissingCompanyReply() })
    }

    const urls = req.body?.referenceLinks || extractUrls(normalizedText)
    const creativeLink = req.body?.creativeLink || extractFirstUrl(normalizedText)
    const mediaReferences = req.body?.mediaReferences || []

    // Truncate title to Notion's 2000 char limit
    let title = parsed.title || 'Untitled task'
    let description = parsed.description || ''
    
    if (title.length > 2000) {
      // Move overflow to description
      description = title.substring(2000) + '\n\n' + description
      title = title.substring(0, 2000)
    }

    const result = await workflowCreateTask({
      company,
      title,
      description,
      creativeLink,
      referenceLinks: urls,
      mediaReferences,
      owner: parsed.owner,
      source: 'main',
      fn: parsed.taskType,
      priority: parsed.priority || 'Medium',
      status: 'Backlog'
    })

    const reply = buildStaffConfirmation({ company, notionUrl: result.notionUrl })
    res.json({ ok: true, company, result, parsed, reply })
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error?.message || error) })
  }
})

export default router
