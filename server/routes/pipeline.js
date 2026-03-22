import { Router } from 'express'
import { getNotionSnapshot, updateTaskState } from '../connectors/notion.js'
import { PIPELINE, appendExecutionLog } from '../lib/pipeline.js'
import { env } from '../lib/env.js'
import { assertDeveloperTask } from '../lib/task-guards.js'

const router = Router()

function previewUrlForTheme(themeId) {
  if (!themeId || !env.shopify.storeDomain) return ''
  return `https://${env.shopify.storeDomain}?preview_theme_id=${themeId}`
}

async function findTask(taskId) {
  const snapshot = await getNotionSnapshot('All')
  const task = (snapshot.tasks || []).find(item => item.id === taskId)
  if (!task) throw new Error('Task not found')
  return task
}

router.post('/workpack-ready', async (req, res) => {
  try {
    const { taskId, executionLog = '' } = req.body
    const task = await findTask(taskId)
    assertDeveloperTask(task)
    const result = await updateTaskState(taskId, {
      pipelineStage: PIPELINE.WORKPACK_READY,
      executionStage: 'Backlog',
      executionLog: appendExecutionLog(executionLog, 'Workpack generated and ready for preview execution')
    })
    res.json({ ok: true, ...result })
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error?.message || error) })
  }
})

router.post('/preview-ready', async (req, res) => {
  try {
    const { taskId, previewThemeId, executionLog = '' } = req.body
    const task = await findTask(taskId)
    assertDeveloperTask(task)
    const result = await updateTaskState(taskId, {
      status: 'In Progress',
      pipelineStage: PIPELINE.PREVIEW_READY,
      executionStage: 'Preview Ready',
      previewUrl: previewUrlForTheme(previewThemeId),
      storeTheme: `Preview Theme ${previewThemeId}`,
      executionLog: appendExecutionLog(executionLog, `Preview is ready on theme ${previewThemeId}`)
    })
    res.json({ ok: true, previewUrl: previewUrlForTheme(previewThemeId), ...result })
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error?.message || error) })
  }
})

router.post('/needs-approval', async (req, res) => {
  try {
    const { taskId, executionLog = '' } = req.body
    const task = await findTask(taskId)
    assertDeveloperTask(task)
    const result = await updateTaskState(taskId, {
      pipelineStage: PIPELINE.NEEDS_APPROVAL,
      status: 'Pending Approval',
      executionStage: 'Awaiting Approval',
      prStatus: 'Ready for Review',
      executionLog: appendExecutionLog(executionLog, 'Task moved to approval queue')
    })
    res.json({ ok: true, ...result })
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error?.message || error) })
  }
})

router.post('/set-live', async (req, res) => {
  try {
    const { taskId, executionLog = '', approvedBy = 'Josh' } = req.body
    const task = await findTask(taskId)
    assertDeveloperTask(task)
    if (task.pipelineStage !== PIPELINE.NEEDS_APPROVAL && task.pipelineStage !== PIPELINE.APPROVED) {
      throw new Error('Task must be in Needs Approval or Approved stage before going live')
    }
    const result = await updateTaskState(taskId, {
      pipelineStage: PIPELINE.LIVE,
      status: 'Live',
      executionStage: 'Live',
      prStatus: 'Merged',
      executionLog: appendExecutionLog(executionLog, `Task set live after approval by ${approvedBy}`)
    })
    res.json({ ok: true, approvedBy, ...result })
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error?.message || error) })
  }
})

export default router
