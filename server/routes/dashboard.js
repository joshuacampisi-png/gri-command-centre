import { Router } from 'express'
import { getNotionSnapshot } from '../connectors/notion.js'
import { getSlackSnapshot, postChannelVerificationSuite, postInitialCommandCentreMessage, postRoleMessage, postSlackMessage } from '../connectors/slack.js'
import { getOpenClawSnapshot } from '../connectors/openclaw.js'
import { getShopifySnapshot } from '../connectors/shopify.js'
import { integrationStatus } from '../lib/env.js'
import { COMPANIES, normalizeCompany } from '../lib/companies.js'
import { workflowConvertFindingToTask, workflowCreateAlert, workflowCreateApproval, workflowCreateFinding, workflowCreateHandoff, workflowCreateReport, workflowCreateTask } from '../workflows/core.js'
import { loadTasks, updateTaskStatus } from '../lib/auto-task-store.js'

const router = Router()
const fallbackStats = (tasks, findings, approvals) => ([
  { label: 'Open Tasks', value: String(tasks.length) },
  { label: 'Blocked', value: String(tasks.filter(t => String(t.status).toLowerCase() === 'blocked').length) },
  { label: 'Pending Approvals', value: String(approvals.length) },
  { label: 'New Setbacks', value: String(findings.length) }
])

router.get('/health', async (_req, res) => res.json({ ok: true, integrations: integrationStatus() }))
router.get('/shopify/health', async (_req, res) => {
  try {
    res.json(await getShopifySnapshot())
  } catch (error) {
    res.status(500).json({ connected: false, error: String(error?.message || error) })
  }
})

// ── PATCH auto task status (approve/reject from dashboard) ───
router.patch('/auto-tasks/:id', (req, res) => {
  const { status } = req.body
  if (!['Backlog', 'In Progress', 'Done', 'Rejected'].includes(status)) {
    return res.status(400).json({ ok: false, error: 'Invalid status' })
  }
  const task = updateTaskStatus(req.params.id, status)
  if (!task) return res.status(404).json({ ok: false, error: 'Task not found' })
  res.json({ ok: true, task })
})

router.get('/dashboard', async (req, res) => {
  try {
    const company = req.query.company === 'All' || !req.query.company ? 'All' : normalizeCompany(req.query.company)
    const [notion, slack, openclaw, shopify] = await Promise.all([
      getNotionSnapshot(company),
      getSlackSnapshot(),
      getOpenClawSnapshot(),
      getShopifySnapshot()
    ])
    const automation = { phases: (await import('../lib/automation-phases.js')).AUTOMATION_PHASES, shopifyPolicy: (await import('../lib/shopify-policy.js')).shopifyPolicy() }

    // Local auto-tasks (automated SEO tasks — dashboard only, never Notion)
    const autoTasks = loadTasks().filter(t =>
      company === 'All' || (t.company || 'GRI') === company
    )

    // Merge: Notion manual tasks + local auto tasks. Auto tasks shown first (most recent).
    const allTasks = [...autoTasks, ...notion.tasks]

    // Stats include both sources
    const statsBase = [...autoTasks, ...notion.tasks]
    res.json({
      ok: true, company,
      companies: ['All', ...COMPANIES],
      integrations: integrationStatus(),
      agents: openclaw.agents,
      stats: fallbackStats(statsBase, notion.findings, notion.approvals),
      tasks: allTasks,
      autoTasks,         // separate field so UI can distinguish origin
      findings: notion.findings,
      approvals: notion.approvals,
      reports: notion.reports,
      slack, notion, openclaw, shopify, automation
    })
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error?.message || error) })
  }
})
// ── Today's Shopify sales (from webhook tracker) ──
router.get('/shopify/today-sales', async (_req, res) => {
  try {
    const { getTodaySales } = await import('../lib/sales-tracker.js')
    res.json(getTodaySales())
  } catch (e) {
    res.json({ ok: false, error: e.message })
  }
})

// ── Shipping / sales by date range ──
router.get('/shopify/sales-range', async (req, res) => {
  try {
    const { getSalesRange } = await import('../lib/sales-tracker.js')
    const { from, to } = req.query
    if (!from || !to) return res.json({ ok: false, error: 'from and to query params required' })
    res.json(getSalesRange(from, to))
  } catch (e) {
    res.json({ ok: false, error: e.message })
  }
})

router.post('/slack/report', async (req, res) => res.json(await postSlackMessage(req.body)))
router.post('/slack/role/:role', async (req, res) => res.json(await postRoleMessage(req.params.role, req.body?.text || 'Role test message')))
router.post('/slack/test', async (_req, res) => res.json(await postInitialCommandCentreMessage()))
router.post('/slack/verify-all', async (_req, res) => res.json(await postChannelVerificationSuite()))
router.post('/workflow/finding', async (req, res) => res.json(await workflowCreateFinding(req.body)))
router.post('/workflow/task', async (req, res) => res.json(await workflowCreateTask(req.body)))
router.post('/workflow/task/from-finding', async (req, res) => res.json(await workflowConvertFindingToTask(req.body)))
router.post('/workflow/report', async (req, res) => res.json(await workflowCreateReport(req.body)))
router.post('/workflow/handoff', async (req, res) => res.json(await workflowCreateHandoff(req.body)))
router.post('/workflow/alert', async (req, res) => res.json(await workflowCreateAlert(req.body)))
router.post('/workflow/approval', async (req, res) => res.json(await workflowCreateApproval(req.body)))

export default router
