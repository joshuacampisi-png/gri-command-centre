import { Router } from 'express'
import { getNotionSnapshot } from '../connectors/notion.js'
import { getSlackSnapshot, postChannelVerificationSuite, postInitialCommandCentreMessage, postRoleMessage, postSlackMessage } from '../connectors/slack.js'
import { getOpenClawSnapshot } from '../connectors/openclaw.js'
import { getShopifySnapshot, getShopifyTodayOrders, getShopifyOrdersRange } from '../connectors/shopify.js'
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

// ── DELETE completed/rejected auto tasks + deduplicate ───
router.post('/auto-tasks/cleanup', async (_req, res) => {
  const { deduplicateAndClean } = await import('../lib/auto-task-store.js')
  const result = deduplicateAndClean()
  res.json({ ok: true, ...result })
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
// ── Today's Shopify sales (API first, webhook fallback) ──
router.get('/shopify/today-sales', async (_req, res) => {
  try {
    const data = await getShopifyTodayOrders()
    if (data.ok) return res.json(data)
    console.error('[today-sales] API returned not ok:', data.error)
  } catch (e) {
    console.error('[today-sales] API error:', e.message)
  }
  // Fallback to webhook tracker
  try {
    const { getTodaySales } = await import('../lib/sales-tracker.js')
    res.json(getTodaySales())
  } catch (e) {
    res.json({ ok: true, revenue: 0, shipping: 0, orders: 0, date: new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Brisbane' }), source: 'unavailable' })
  }
})

// ── Shopify API diagnostic ──
router.get('/shopify/diag', async (_req, res) => {
  const { env } = await import('../lib/env.js')
  const { getShopifyClientCredentialsToken } = await import('../lib/shopify-client-credentials.js')
  const { loadShopifyOAuthState } = await import('../lib/shopify-oauth-store.js')
  const result = { storeDomain: env.shopify.storeDomain, hasApiKey: !!env.shopify.apiKey, hasApiSecret: !!env.shopify.apiSecret, hasAdminToken: !!env.shopify.adminAccessToken }
  try {
    const oauth = await loadShopifyOAuthState()
    result.hasOAuthToken = !!oauth.accessToken
  } catch (e) { result.oauthError = e.message }
  try {
    const token = await getShopifyClientCredentialsToken()
    result.clientCredToken = token ? token.slice(0, 12) + '...' : 'empty'
  } catch (e) { result.clientCredError = e.message }
  try {
    const data = await getShopifyTodayOrders()
    result.todaySales = { ok: data.ok, orders: data.orders, revenue: data.revenue, error: data.error }
  } catch (e) { result.todaySalesError = e.message }
  res.json(result)
})

// ── Shipping / sales by date range (API first, webhook fallback) ──
router.get('/shopify/sales-range', async (req, res) => {
  const { from, to } = req.query
  if (!from || !to) return res.json({ ok: false, error: 'from and to query params required' })
  try {
    const data = await getShopifyOrdersRange(from, to)
    if (data.ok) return res.json(data)
    console.error('[sales-range] API returned not ok:', data.error)
  } catch (e) {
    console.error('[sales-range] API error:', e.message)
  }
  try {
    const { getSalesRange } = await import('../lib/sales-tracker.js')
    res.json(getSalesRange(from, to))
  } catch (e) {
    res.json({ ok: true, revenue: 0, shipping: 0, orders: 0, from, to })
  }
})

// ── Shipping Protection Stats (live from Shopify API) ──
router.get('/shopify/shipping-protection', async (_req, res) => {
  try {
    const now = new Date()
    const aestNow = new Date(now.getTime() + (10 * 60 * 60 * 1000))
    const aestDate = aestNow.toISOString().slice(0, 10)

    // Today
    const todayData = await getShopifyOrdersRange(aestDate, aestDate)

    // This week (Wed-Tue)
    const aestDay = aestNow.getUTCDay()
    const daysSinceWed = (aestDay - 3 + 7) % 7
    const wed = new Date(aestNow)
    wed.setUTCDate(aestNow.getUTCDate() - daysSinceWed)
    const wedStr = wed.toISOString().slice(0, 10)
    const tue = new Date(wed)
    tue.setUTCDate(wed.getUTCDate() + 6)
    const tueStr = tue.toISOString().slice(0, 10)
    const weekData = await getShopifyOrdersRange(wedStr, tueStr)

    // This month
    const monthStart = aestDate.slice(0, 8) + '01'
    const monthData = await getShopifyOrdersRange(monthStart, aestDate)

    // Lifetime: query month by month from when protection started to avoid pagination limits
    let lifetimeCount = 0, lifetimeRevenue = 0
    const startYear = 2025, startMonth = 1
    const endYear = aestNow.getUTCFullYear(), endMonth = aestNow.getUTCMonth() + 1
    for (let y = startYear; y <= endYear; y++) {
      const mStart = y === startYear ? startMonth : 1
      const mEnd = y === endYear ? endMonth : 12
      for (let m = mStart; m <= mEnd; m++) {
        const from = `${y}-${String(m).padStart(2, '0')}-01`
        const lastDay = new Date(y, m, 0).getDate()
        const to = `${y}-${String(m).padStart(2, '0')}-${lastDay}`
        const chunk = await getShopifyOrdersRange(from, to)
        lifetimeCount += chunk.protectionCount || 0
        lifetimeRevenue += chunk.protectionRevenue || 0
      }
    }

    res.json({
      ok: true,
      today: { count: todayData.protectionCount || 0, revenue: todayData.protectionRevenue || 0 },
      week: { count: weekData.protectionCount || 0, revenue: weekData.protectionRevenue || 0 },
      month: { count: monthData.protectionCount || 0, revenue: monthData.protectionRevenue || 0 },
      lifetime: { count: lifetimeCount, revenue: lifetimeRevenue },
      pricePerOrder: 3.00,
    })
  } catch (e) {
    console.error('[shipping-protection] Error:', e.message)
    try {
      const { getShippingProtection } = await import('../lib/sales-tracker.js')
      res.json(getShippingProtection())
    } catch {
      res.json({ ok: false, error: e.message })
    }
  }
})

// ── Month-to-date stats (revenue, shipping, protection) ──
router.get('/shopify/month-stats', async (_req, res) => {
  try {
    const now = new Date()
    const aestNow = new Date(now.getTime() + (10 * 60 * 60 * 1000))
    const aestDate = aestNow.toISOString().slice(0, 10)
    const monthStart = aestDate.slice(0, 8) + '01'
    const data = await getShopifyOrdersRange(monthStart, aestDate)
    res.json({
      ok: true,
      ...data,
      monthStart,
      today: aestDate,
    })
  } catch (e) {
    res.json({ ok: false, error: e.message })
  }
})

// ── Viral Instagram Reels ──
router.get('/viral/instagram', async (req, res) => {
  try {
    const { getViralInstagramReels } = await import('../lib/viral-instagram.js')
    const forceRefresh = req.query.refresh === '1'
    res.json(await getViralInstagramReels(forceRefresh))
  } catch (e) {
    res.json({ ok: false, videos: [], error: e.message })
  }
})

// ── Download Instagram Reel video ──
router.get('/viral/instagram/download/:shortcode', async (req, res) => {
  try {
    const { downloadReelVideo } = await import('../lib/viral-instagram.js')
    const result = await downloadReelVideo(req.params.shortcode)
    if (!result.ok) return res.status(400).json(result)

    // Proxy the video as a file download
    const videoRes = await fetch(result.videoUrl, {
      signal: AbortSignal.timeout(60000),
      headers: { 'User-Agent': 'Mozilla/5.0' },
    })
    if (!videoRes.ok) return res.status(502).json({ ok: false, error: `Video fetch failed: ${videoRes.status}` })

    const contentLength = videoRes.headers.get('content-length')
    res.setHeader('Content-Type', 'video/mp4')
    res.setHeader('Content-Disposition', `attachment; filename="reel-${req.params.shortcode}.mp4"`)
    if (contentLength) res.setHeader('Content-Length', contentLength)

    // Stream using Node.js Readable
    const { Readable } = await import('stream')
    const nodeStream = Readable.fromWeb(videoRes.body)
    nodeStream.pipe(res)
    nodeStream.on('error', () => { if (!res.headersSent) res.status(500).end() })
  } catch (e) {
    if (!res.headersSent) res.status(500).json({ ok: false, error: e.message })
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
