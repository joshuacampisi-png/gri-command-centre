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
import blogWriterRoutes from './routes/blog-writer.js'
import adsRoutes from './routes/ads.js'
import adsStrategistRoutes from './routes/ads-strategist.js'
import shopifyWebhookRoutes from './routes/shopify-webhook.js'
import squareWebhookRoutes from './routes/square-webhook.js'
import { env } from './lib/env.js'
import { startTelegramPollingBot } from './lib/telegram-polling-bot.js'
import { startNotionPoller, triggerPoll } from './lib/notion-poller.js'
import { startFlywheel, stopFlywheel, getFlywheelStatus } from './lib/flywheel.js'
import { startExecutor, stopExecutor, getExecutorStatus, executeTaskById } from './lib/executor.js'
import { handleApproval, getPendingApprovals } from './lib/approval-queue.js'
import { startMorningWakeUp, sendMorningWakeUp } from './lib/morning-wake-up.js'
import { startSEOLearningCrons } from './lib/seo-learning-cron.js'
import { scheduleCompetitorIntelCron } from './lib/competitor-intel-cron.js'
import { startTrendsScheduler } from './lib/trends-scheduler.js'
import { startAdsSnapshotCron } from './lib/ads-snapshot-cron.js'
import { startAdsReportCrons } from './lib/ads-report-cron.js'
import { startRevenueBaselineCron } from './lib/revenue-cron.js'
import { seedBaselineIfNeeded } from './lib/daily-revenue.js'
// clearAllHires removed — one-time clear done
import { startKeywordScheduler } from './lib/keyword-tracker.js'
import { getUsageSummary } from './lib/claude-guard.js'
import instagramSchedulerRoutes from './routes/instagram-scheduler.js'
import { startInstagramCron } from './lib/instagram-cron.js'
import { startCalendarPublisher } from './lib/calendar-publisher.js'
import metaConnectRoutes, { loadSavedMetaTokens } from './routes/meta-connect.js'
import igReplyBotRoutes from './routes/ig-reply-bot.js'
import flywheelRoutes from './routes/flywheel.js'
import { startFlywheelCrons } from './lib/flywheel-cron.js'
import gadsAgentRoutes from './routes/gads-agent.js'
import { startGadsAgentCrons } from './lib/gads-agent-cron.js'
import { startIGReplyBotCron } from './lib/ig-reply-bot/cron.js'
import { startFatigueAlertCron } from './lib/fatigue-alert-cron.js'
import { startTNTPaymentPoller } from './lib/tnt-payment-poller.js'
import { seedVolumeFromRepo } from './lib/volume-seed.js'

// ── VOLUME SEED ──
// Must run BEFORE any route or lib reads data files so Railway's persistent
// volume gets populated from the committed baseline on first boot (or after a
// volume reset). No-op on local dev. See server/lib/volume-seed.js for why.
try {
  seedVolumeFromRepo()
} catch (err) {
  console.error('[VolumeSeed] Failed (non-fatal):', err.message)
}

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
  const errMsg = String(err?.message || err)
  // EPIPE = broken pipe from dropped connections (Telegram long-poll, etc.) — harmless, don't count as crash
  if (err?.code === 'EPIPE' || err?.code === 'ECONNRESET' || err?.code === 'ETIMEDOUT') {
    console.warn(`[NET] ${err.code} — transient network error, ignoring:`, errMsg.slice(0, 100))
    return
  }
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
  // Public paths — no auth required, no WWW-Authenticate header sent
  const PUBLIC_PREFIXES = [
    '/api/shopify/webhook', '/api/square/webhook', '/api/shopify/oauth',
    '/api/telegram-bot/webhook', '/api/ig-reply-bot/', '/api/flywheel/webhook',
    '/api/ads/google-spend/webhook', '/api/calendar', '/calendar',
    '/calendar-videos', '/instagram-media', '/api/contract',
    '/api/hires/sync', '/api/hires/reconcile-payments', '/api/hires/health',
    '/api/hires/resend-contract-by-order',
    '/api/hires/reset-contract',
  ]
  const PUBLIC_EXACT = [
    '/api/instagram/disk-usage', '/api/instagram/cleanup-media',
    '/api/ads/debug', '/api/ads/performance',
  ]
  function isPublicPath(p) {
    if (PUBLIC_EXACT.includes(p)) return true
    return PUBLIC_PREFIXES.some(prefix => p.startsWith(prefix))
  }

  app.use((req, res, next) => {
    if (isPublicPath(req.path)) return next()
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

  // Customer-facing contract pages: explicitly clear any cached auth prompts
  app.use('/api/contract', (_req, res, next) => {
    res.removeHeader('WWW-Authenticate')
    next()
  })

  console.log('🔒 Dashboard password protection: ACTIVE')
}
// Capture raw body for Shopify webhook HMAC verification
app.use('/api/shopify/webhook', express.json({
  verify: (req, _res, buf) => { req.rawBody = buf.toString('utf8'); }
}))
// Capture raw body for Flywheel webhook HMAC verification
app.use('/api/flywheel/webhook', express.json({
  verify: (req, _res, buf) => { req.rawBody = buf.toString('utf8'); }
}))
// Capture raw body for IG Reply Bot webhook HMAC verification
app.use('/api/ig-reply-bot/webhook', express.json({
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
// Serve Instagram media uploads
const instagramMediaDir = _calVidDir('instagram-media')
app.use('/instagram-media', express.static(instagramMediaDir))

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
app.use('/api/blog-writer', blogWriterRoutes)
app.use('/api/ads/strategist', adsStrategistRoutes)
app.use('/api/ads', adsRoutes)
app.use('/api/shopify/webhook', shopifyWebhookRoutes)
app.use('/api/square/webhook', squareWebhookRoutes)
app.use('/api/instagram', instagramSchedulerRoutes)
app.use('/api/meta', metaConnectRoutes)
app.use('/api/ig-reply-bot', igReplyBotRoutes)
app.use('/api/flywheel', flywheelRoutes)
app.use('/api/gads-agent', gadsAgentRoutes)

// ── Admin: disk usage + cleanup ──────────────────────────────────────────────
import { readdirSync, statSync, unlinkSync as _unlinkSync, readFileSync as _readFileSync } from 'fs'
import { DATA_ROOT } from './lib/data-dir.js'

function getDirSize(dir, depth = 0) {
  const results = []
  try {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      try {
        const st = statSync(full)
        if (st.isDirectory()) {
          const children = depth < 2 ? getDirSize(full, depth + 1) : []
          const totalSize = children.reduce((s, c) => s + c.size, 0)
          results.push({ name, type: 'dir', size: totalSize, files: children.length, children: depth < 1 ? children : undefined })
        } else {
          results.push({ name, type: 'file', size: st.size, modified: st.mtime.toISOString() })
        }
      } catch {}
    }
  } catch {}
  return results.sort((a, b) => b.size - a.size)
}

app.get('/api/admin/disk', (_req, res) => {
  const items = getDirSize(DATA_ROOT)
  const totalBytes = items.reduce((s, i) => s + i.size, 0)
  res.json({ ok: true, root: DATA_ROOT, totalMB: (totalBytes / 1048576).toFixed(2), items })
})

app.delete('/api/admin/disk/file', (req, res) => {
  const { path: relPath } = req.query
  if (!relPath || relPath.includes('..')) return res.status(400).json({ error: 'Invalid path' })
  const full = join(DATA_ROOT, relPath)
  try { _unlinkSync(full); res.json({ ok: true, deleted: relPath }) }
  catch (e) { res.status(500).json({ error: e.message }) }
})

app.delete('/api/admin/disk/dir', (req, res) => {
  const { path: relPath } = req.query
  if (!relPath || relPath.includes('..')) return res.status(400).json({ error: 'Invalid path' })
  const full = join(DATA_ROOT, relPath)
  try {
    const files = readdirSync(full)
    let deleted = 0
    for (const f of files) {
      try { _unlinkSync(join(full, f)); deleted++ } catch {}
    }
    res.json({ ok: true, dir: relPath, filesDeleted: deleted })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

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

// ── GRACEFUL SHUTDOWN ──
function gracefulShutdown(signal) {
  console.log(`\n⚡ ${signal} received — shutting down gracefully...`)
  if (server) {
    server.close(() => {
      console.log('✅ Server closed. Exiting.')
      process.exit(0)
    })
    // Force exit after 5s if connections hang
    setTimeout(() => { console.log('⏱ Forcing exit after 5s timeout'); process.exit(0) }, 5000)
  } else {
    process.exit(0)
  }
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))

// ── STARTUP ──
const server = app.listen(env.port, '0.0.0.0', () => {
  const aestNow = new Date().toLocaleString('en-AU', { timeZone: 'Australia/Brisbane' })
  console.log(`\n🚀 Pablo Command Centre API — ${aestNow} AEST`)
  console.log(`   Listening: http://127.0.0.1:${env.port}`)
  console.log(`   Company:   GRI only (Lionzen/GBU paused)`)
  console.log(`   Schedule:  SEO crawl @ 2am AEST | Morning brief @ 5am AEST\n`)

  // Telegram: using WEBHOOK mode (not polling — polling causes 409 conflicts)
  // Webhook registered at /api/telegram-bot/webhook
  // startTelegramPollingBot() — DISABLED, webhook is better
  startNotionPoller()
  // Flywheel: ENABLED with deduplication (checks Rejected status too)
  startFlywheel()
  
  // Executor: ENABLED - auto-fix SEO tasks
  startExecutor()
  
  // Background data jobs (NO Telegram messages)
  seedBaselineIfNeeded()
  startRevenueBaselineCron()

  // DISABLED — all auto Telegram messages killed per Josh's request
  startMorningWakeUp()
  // startSEOLearningCrons()
  // scheduleCompetitorIntelCron()
  // startKeywordScheduler()
  // startTrendsScheduler()
  // startAdsSnapshotCron()

  // Meta Ads daily + weekly Telegram reports via Pablo
  startAdsReportCrons()

  // Load saved Meta/Instagram tokens from data/meta-connect.json into process.env
  loadSavedMetaTokens()

  // Instagram auto-scheduler (checks every minute for due posts)
  startInstagramCron()
  startCalendarPublisher()

  // Instagram Auto Reply Bot (tone refresh cron + startup check)
  startIGReplyBotCron()

  // TNT Hire: poll Square every 5 min for pending bond payments
  startTNTPaymentPoller()

  // Ads Intelligence Flywheel — Meta sync, kill/scale rules, AOV, AI briefs
  startFlywheelCrons()

  // Google Ads Agent — smart cadence scans, daily briefing, auto-revert
  startGadsAgentCrons()

  // Ad fatigue alerts — checks every 4 hours, pings Telegram on transitions
  startFatigueAlertCron()

  console.log('✅ Server running — auto Telegram messages: DISABLED')
  console.log('🔒 Crash recovery: ACTIVE')
})
