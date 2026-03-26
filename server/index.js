import express from 'express'
import cors from 'cors'
import dashboardRoutes from './routes/dashboard.js'
import calendarRoutes from './routes/calendar.js'
import telegramIntakeRoutes from './routes/telegram-intake.js'
import telegramBotRoutes from './routes/telegram-bot.js'
import shopifyOauthRoutes from './routes/shopify-oauth.js'
import shopifyDevRoutes from './routes/shopify-dev.js'
import automationRoutes from './routes/automation.js'
import pipelineRoutes from './routes/pipeline.js'
import reviewRoutes from './routes/review.js'
import keywordRoutes from './routes/keywords.js'
import competitorRoutes from './routes/competitors.js'
import trendsRoutes from './routes/trends.js'
import publishRoutes from './routes/publish.js'
import hiresRoutes from './routes/hires.js'
import returnsRoutes from './routes/returns.js'
import contractRoutes from './routes/contract.js'
import shopifyWebhookRoutes from './routes/shopify-webhook.js'
import squareWebhookRoutes from './routes/square-webhook.js'
import { env } from './lib/env.js'
import { startTelegramPollingBot } from './lib/telegram-polling-bot.js'
import { startNotionPoller, triggerPoll } from './lib/notion-poller.js'
import { startFlywheel, stopFlywheel, getFlywheelStatus } from './lib/flywheel.js'
import { startExecutor, stopExecutor, getExecutorStatus, executeTaskById } from './lib/executor.js'
import { handleApproval, getPendingApprovals } from './lib/approval-queue.js'
import { startMorningBrief, sendMorningBrief } from './lib/morning-brief.js'
import { startSEOLearningCrons } from './lib/seo-learning-cron.js'
import { scheduleCompetitorIntelCron } from './lib/competitor-intel-cron.js'
import { startTrendsScheduler } from './lib/trends-scheduler.js'
import { startKeywordScheduler } from './lib/keyword-tracker.js'
import { getUsageSummary } from './lib/claude-guard.js'

// ── PABLO CRASH RECOVERY — Rule 5 ──
const JOSH_CHAT = '8040702286'
let crashCount = 0
const MAX_RESTARTS = 3

async function sendCrashAlert(type, err) {
  const aestNow = new Date().toLocaleString('en-AU', { timeZone: 'Australia/Brisbane' })
  const text =
`⚠️ *PABLO SYSTEM ALERT*

Time: ${aestNow} AEST
Issue: ${type}
Error: ${String(err?.message || err).slice(0, 200)}
Action: Auto-restarting in 60s (attempt ${crashCount}/${MAX_RESTARTS})
Manual check needed: ${crashCount >= MAX_RESTARTS ? 'YES ⚠️' : 'No'}

— Pablo Escobot`
  try {
    await fetch(`https://api.telegram.org/bot${env.telegram.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: JOSH_CHAT, text, parse_mode: 'Markdown' })
    })
  } catch (e) { console.error('[Crash] Telegram alert failed:', e.message) }
}

process.on('uncaughtException', async (err) => {
  crashCount++
  console.error(`[CRASH] uncaughtException #${crashCount}:`, err)
  await sendCrashAlert('uncaughtException', err).catch(() => {})
  if (crashCount >= MAX_RESTARTS) {
    console.error('[CRASH] Max restarts reached — manual intervention required')
    process.exit(1)
  }
  // Do NOT exit — stay alive and keep serving
})

process.on('unhandledRejection', async (reason) => {
  console.error('[CRASH] unhandledRejection:', reason)
  await sendCrashAlert('unhandledRejection', reason).catch(() => {})
  // Non-fatal — log and continue
})

// ── EXPRESS APP ──
const app = express()
app.use(cors())

// ── Dashboard password gate ────────────────────────────────
// Only active when DASHBOARD_PASSWORD is set in .env
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD
if (DASHBOARD_PASSWORD && DASHBOARD_PASSWORD !== 'changeme') {
  app.use((req, res, next) => {
    // Allow webhooks, calendar API, and standalone calendar page through without auth
    if (req.path.startsWith('/api/shopify/webhook') || req.path.startsWith('/api/square/webhook') || req.path.startsWith('/api/shopify/oauth') || req.path.startsWith('/api/calendar') || req.path.startsWith('/calendar') || req.path.startsWith('/calendar-videos')) {
      return next()
    }
    const auth = req.headers.authorization
    if (!auth || !auth.startsWith('Basic ')) {
      res.setHeader('WWW-Authenticate', 'Basic realm="Command Centre"')
      return res.status(401).send('Authentication required')
    }
    const [, encoded] = auth.split(' ')
    const decoded = Buffer.from(encoded, 'base64').toString('utf8')
    const [, password] = decoded.split(':')
    if (password !== DASHBOARD_PASSWORD) {
      res.setHeader('WWW-Authenticate', 'Basic realm="Command Centre"')
      return res.status(401).send('Invalid password')
    }
    next()
  })
  console.log('🔒 Dashboard password protection: ACTIVE')
}
// Capture raw body for Shopify webhook HMAC verification
app.use('/api/shopify/webhook', express.json({
  verify: (req, _res, buf) => { req.rawBody = buf.toString('utf8'); }
}))
app.use(express.json({ limit: '10mb' }))
app.use('/task-media', express.static(join(process.cwd(), 'public/task-media')))
app.use('/review-captures', express.static(join(process.cwd(), 'public/review-captures')))
// Serve calendar videos from same dir multer writes to (data-dir resolver)
import { dataDir as _calVidDir } from './lib/data-dir.js'
const calendarVideoDir = _calVidDir('calendar-videos')
app.use('/calendar-videos', express.static(calendarVideoDir))
// Also serve from public dir as fallback for old uploads
app.use('/calendar-videos', express.static(join(process.cwd(), 'public/calendar-videos')))
app.use('/api/calendar', calendarRoutes)

// Serve built frontend from /dist — same origin, no CORS issues
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { existsSync } from 'fs'
const __dirname = dirname(fileURLToPath(import.meta.url))
const distPath = join(__dirname, '..', 'dist')
if (existsSync(distPath)) {
  app.use(express.static(distPath))
}
app.use('/api', dashboardRoutes)
app.use('/api/telegram-intake', telegramIntakeRoutes)
app.use('/api/telegram-bot', telegramBotRoutes)
app.use('/api/shopify/oauth', shopifyOauthRoutes)
app.use('/api/shopify/dev', shopifyDevRoutes)
app.use('/api/automation', automationRoutes)
app.use('/api/pipeline', pipelineRoutes)
app.use('/api/review', reviewRoutes)
app.use('/api/keywords', keywordRoutes)
app.use('/api/competitors', competitorRoutes)
app.use('/api/trends', trendsRoutes)
app.use('/api/publish', publishRoutes)
app.use('/api/hires', hiresRoutes)
app.use('/api/returns', returnsRoutes)
app.use('/api/contract', contractRoutes)
app.use('/api/shopify/webhook', shopifyWebhookRoutes)
app.use('/api/square/webhook', squareWebhookRoutes)

// Env debug — shows which vars are SET (no values exposed)
app.get('/api/env-debug', (_req, res) => {
  const keys = ['SHOPIFY_STORE_DOMAIN','SHOPIFY_ADMIN_ACCESS_TOKEN','NOTION_TOKEN','TELEGRAM_BOT_TOKEN','ANTHROPIC_API_KEY','PORT','DASHBOARD_PASSWORD']
  const result = {}
  keys.forEach(k => { result[k] = Boolean(process.env[k]) ? `SET(${String(process.env[k]).length}chars)` : 'MISSING' })
  res.json(result)
})

// Claude usage safety dashboard
app.get('/api/claude-usage', (_req, res) => res.json(getUsageSummary()))

// Manual poll trigger
app.post('/api/poll-now', async (_req, res) => {
  const result = await triggerPoll()
  res.json(result)
})

// Flywheel status + control
app.get('/api/flywheel/status', (_req, res) => {
  res.json(getFlywheelStatus())
})
app.post('/api/flywheel/:action', (req, res) => {
  const { action } = req.params
  if (action === 'start') { startFlywheel(); res.json({ ok: true, message: 'Flywheel started' }) }
  else if (action === 'stop') { stopFlywheel(); res.json({ ok: true, message: 'Flywheel stopped' }) }
  else res.status(400).json({ ok: false, error: 'Invalid action' })
})

// Executor endpoints
app.get('/api/executor/status', (_req, res) => {
  res.json(getExecutorStatus())
})
app.post('/api/executor/:action', (req, res) => {
  const { action } = req.params
  if (action === 'start') { startExecutor(); res.json({ ok: true, message: 'Executor activated' }) }
  else if (action === 'stop') { stopExecutor(); res.json({ ok: true, message: 'Executor stopped' }) }
  else res.status(400).json({ ok: false, error: 'Invalid action' })
})
app.post('/api/executor/execute/:taskId', async (req, res) => {
  const { taskId } = req.params
  try {
    const result = await executeTaskById(taskId)
    if (result.action === 'meta-description' && result.summary) {
      const { logSEOChange } = await import('./lib/seo-learning-system.js')
      await logSEOChange({
        company: 'GRI', page: result.path || '/',
        changeType: 'meta-description', agent: 'seo-content',
        oldValue: result.summary.oldValue, newValue: result.summary.newValue,
        targetKeywords: [], reasoning: result.summary.how, approvedBy: 'Josh'
      }).catch(err => console.error('[Learning] Failed to log:', err.message))
    }
    res.json(result)
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message })
  }
})

// Approval endpoints
app.get('/api/approvals/pending', (_req, res) => {
  res.json({ ok: true, approvals: getPendingApprovals() })
})
app.post('/api/approvals/:taskId/:action', async (req, res) => {
  const { taskId, action } = req.params
  const userId = req.body.userId || 'josh'
  try {
    const result = await handleApproval(taskId, action, userId)
    res.json(result)
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message })
  }
})

// SEO Learning System
app.get('/api/seo/learnings', async (_req, res) => {
  const { generateLearningInsights } = await import('./lib/seo-learning-system.js')
  const insights = await generateLearningInsights()
  res.json(insights)
})
app.get('/api/seo/weekly-report', async (_req, res) => {
  const { generateWeeklyReport } = await import('./lib/seo-learning-system.js')
  const report = await generateWeeklyReport()
  res.json(report)
})

// SEO Education System
app.post('/api/seo/learn', async (_req, res) => {
  const { runLearningCycle } = await import('./lib/seo-education-system.js')
  const result = await runLearningCycle()
  res.json(result)
})
app.get('/api/seo/knowledge', async (req, res) => {
  const { getAgentKnowledge } = await import('./lib/seo-education-system.js')
  const topic = req.query.topic || 'meta-description'
  const knowledge = await getAgentKnowledge(topic)
  res.json(knowledge)
})
app.get('/api/seo/education-report', async (_req, res) => {
  const { generateEducationReport } = await import('./lib/seo-education-system.js')
  const report = await generateEducationReport()
  res.json(report)
})

// Morning brief — manual trigger
app.post('/api/morning-brief/send', async (_req, res) => {
  try {
    const brief = await sendMorningBrief()
    res.json({ ok: true, brief })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// Standalone calendar page for marketing team
// If CALENDAR_SOURCE_URL is set, the calendar fetches from the main command centre instead of local
app.get('/calendar', async (_req, res) => {
  const sourceUrl = process.env.CALENDAR_SOURCE_URL
  if (sourceUrl) {
    const { readFileSync } = await import('fs')
    let html = readFileSync(join(__dirname, '..', 'public', 'calendar.html'), 'utf8')
    html = html.replace("const API = '/api/calendar'", `const API = '${sourceUrl}/api/calendar'`)
    res.type('html').send(html)
  } else {
    res.sendFile(join(__dirname, '..', 'public', 'calendar.html'))
  }
})

// SPA fallback — serve index.html for non-API routes (must be AFTER all API routes)
if (existsSync(distPath)) {
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next()
    res.sendFile(join(distPath, 'index.html'))
  })
}

// ── STARTUP ──
app.listen(env.port, '0.0.0.0', () => {
  const aestNow = new Date().toLocaleString('en-AU', { timeZone: 'Australia/Brisbane' })
  console.log(`\n🚀 Pablo Command Centre API — ${aestNow} AEST`)
  console.log(`   Listening: http://127.0.0.1:${env.port}`)
  console.log(`   Company:   GRI only (Lionzen/GBU paused)`)
  console.log(`   Schedule:  SEO crawl @ 2am AEST | Morning brief @ 5am AEST\n`)

  startTelegramPollingBot()
  startNotionPoller()
  // Flywheel: ENABLED with deduplication (checks Rejected status too)
  startFlywheel()
  
  // Executor: ENABLED - auto-fix SEO tasks
  startExecutor()
  
  // Keep monitoring systems:
  startMorningBrief()
  startSEOLearningCrons()
  scheduleCompetitorIntelCron()
  startKeywordScheduler()
  startTrendsScheduler()

  console.log('✅ Full autonomous mode: ACTIVE')
  console.log('☀️  Morning brief: ACTIVE (5am AEST)')
  console.log('🧠 SEO learning: ACTIVE (Weekly Mon 3am, Daily 2am, Summary Mon 9am)')
  console.log('🔍 Competitor tracking: ACTIVE (Weekly Mon 4am)')
  console.log('📊 Keyword tracking: ACTIVE (Daily 6am)')
  console.log('📈 Google Trends: ACTIVE (Daily 3am)')
  console.log('🔒 Crash recovery: ACTIVE')
})
