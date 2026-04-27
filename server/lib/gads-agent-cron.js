/**
 * gads-agent-cron.js
 * Scheduled jobs for the Google Ads Agent.
 *
 * Smart cadence (Australia/Brisbane timezone = AEST, no DST):
 *   - Hourly scan during active hours 6am-10pm
 *   - Every 4 hours overnight (10pm-6am)
 *   - Daily deep audit + intelligence briefing at 6am
 *   - Daily accuracy check + revert run at 7am
 */
import cron from 'node-cron'
import { runFullScan } from './gads-agent-engine.js'
import { buildRecommendationsFromFindings, generateIntelligenceBriefing } from './gads-agent-intelligence.js'
import {
  addRecommendation, getExistingActiveFingerprints, addBriefing, logAudit,
} from './gads-agent-store.js'
import { runAccuracyChecks } from './gads-agent-revert.js'
import { isGadsConfigured, pingGads } from './gads-client.js'
import { refreshAutoContext } from './gads-agent-context.js'
import { buildEngineSnapshot, formatEngineForTelegram } from './gads-dominance-engine.js'
import { sendTelegramMessage } from '../connectors/telegram.js'
import { env } from './env.js'

// ── Crash-safe wrapper ──────────────────────────────────────────────────────

function safeRun(name, fn) {
  return async () => {
    const start = Date.now()
    try {
      console.log(`[GadsAgentCron] Starting: ${name}`)
      const result = await fn()
      const ms = Date.now() - start
      console.log(`[GadsAgentCron] Completed: ${name} (${ms}ms)`, result || '')
    } catch (err) {
      const ms = Date.now() - start
      console.error(`[GadsAgentCron] FAILED: ${name} after ${ms}ms —`, err.message)
      try {
        logAudit('cron_error', { job: name, error: err.message, durationMs: ms }, null, 'agent')
      } catch { /* nothing */ }
    }
  }
}

// ── Core jobs ───────────────────────────────────────────────────────────────

/**
 * Run a full scan: rules engine + recommendation builder + dedup + insert.
 * Returns { findings, newRecommendations }.
 */
export async function runAgentScanJob() {
  if (!isGadsConfigured()) {
    console.log('[GadsAgentCron] Google Ads API not configured, skipping scan')
    return { skipped: true }
  }

  logAudit('scan_started', { timestamp: new Date().toISOString() }, null, 'agent')

  const scan = await runFullScan()
  const existingFingerprints = getExistingActiveFingerprints()
  const newFindings = scan.findings.filter(f => !existingFingerprints.has(f.fingerprint))

  if (newFindings.length === 0) {
    logAudit('scan_completed', {
      findings: scan.findings.length,
      newRecommendations: 0,
      counts: scan.counts,
    }, null, 'agent')
    return { findings: scan.findings.length, newRecommendations: 0, counts: scan.counts }
  }

  // Build recommendation cards (top N get AI enrichment, rest are templated).
  // Pass the framework metrics attached to the scan result so Claude can ground
  // its narrative in real Layer 1/Layer 3 numbers instead of fabricating them.
  const recs = await buildRecommendationsFromFindings(newFindings, scan.frameworkMetrics)

  for (const r of recs) {
    const saved = addRecommendation({ ...r, severity: newFindings.find(f => f.fingerprint === r.fingerprint)?.severity })
    logAudit('recommendation_created', {
      title: saved.issueTitle,
      category: saved.category,
      projectedImpact: saved.projectedDollarImpact,
    }, saved.id, 'agent')
  }

  // Store needs-review findings (preflight failed or needs data)
  const needsReview = (scan.needsReviewFindings || []).filter(f => !existingFingerprints.has(f.fingerprint))
  for (const f of needsReview) {
    const saved = addRecommendation({
      ...f,
      status: 'needs-review',
      campaignContext: {
        ...(f.campaignContext || {}),
        preflight: f.preflight,
        preflightVerdict: f.preflightVerdict,
        preflightFailures: f.preflightFailures,
        dataFetchedAt: f.preflight?.ranAt || new Date().toISOString(),
      },
    })
    logAudit('recommendation_needs_review', {
      title: saved.issueTitle,
      category: saved.category,
      verdict: f.preflightVerdict,
      failures: f.preflightFailures?.length || 0,
    }, saved.id, 'agent')
  }

  logAudit('scan_completed', {
    findings: scan.findings.length,
    newRecommendations: recs.length,
    needsReview: needsReview.length,
    counts: scan.counts,
  }, null, 'agent')

  return { findings: scan.findings.length, newRecommendations: recs.length, needsReview: needsReview.length, counts: scan.counts }
}

export async function runDailyBriefingJob() {
  if (!isGadsConfigured()) {
    console.log('[GadsAgentCron] Google Ads API not configured, skipping briefing')
    return { skipped: true }
  }

  // Pull latest account summary + framework metrics for context
  const scan = await runFullScan()
  const briefing = await generateIntelligenceBriefing(scan.summary, scan.frameworkMetrics)
  const saved = addBriefing(briefing)
  logAudit('briefing_generated', { briefingId: saved.id, date: saved.briefingDate }, null, 'agent')
  return { briefingId: saved.id }
}

export async function runAccuracyCheckJob() {
  if (!isGadsConfigured()) return { skipped: true }
  const result = await runAccuracyChecks()
  logAudit('accuracy_check_run', result, null, 'agent')
  return result
}

/**
 * Engine debrief — sends GRI Dominance Engine snapshot to Josh's Telegram.
 * Called daily at 6am AEST.
 */
export async function runEngineTelegramDebrief() {
  if (!isGadsConfigured()) return { skipped: true, reason: 'gads not configured' }
  const chatId = process.env.TELEGRAM_JOSH_CHAT_ID || env.telegram?.joshChatId
  if (!chatId) return { skipped: true, reason: 'TELEGRAM_JOSH_CHAT_ID not set' }

  const snapshot = await buildEngineSnapshot({ skipCache: true })
  let framework = null
  try {
    const { getFrameworkMetrics } = await import('./gads-agent-framework-metrics.js')
    framework = await getFrameworkMetrics(30)
  } catch (e) {
    console.warn('[engine-debrief] framework metrics failed:', e.message)
  }
  const text = formatEngineForTelegram(snapshot, framework)

  // Telegram message limit is 4096 chars — truncate safely
  const safe = text.length > 3900 ? text.slice(0, 3900) + '\n…(truncated)' : text

  // Use Markdown parse mode for *bold* etc. The connector's sendTelegramMessage
  // doesn't take parse_mode — call telegramCall directly via fetch fallback.
  // Simpler: just send as plain text (Telegram renders * and _ literally
  // without parse_mode), so we strip markdown for the simple connector.
  const plain = safe
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')

  const result = await sendTelegramMessage({ chatId, text: plain })
  logAudit('engine_debrief_sent', { chatId, ok: result.ok, len: plain.length }, null, 'agent')
  return { ok: result.ok, len: plain.length }
}

// ── Schedule everything ─────────────────────────────────────────────────────

export function startGadsAgentCrons() {
  console.log('[GadsAgentCron] Starting Google Ads Agent cron jobs...')

  const TZ = 'Australia/Brisbane' // AEST, no DST — matches flywheel pattern

  // Hourly scan during active hours (6am-10pm): runs at minute 15 of every hour in that range
  cron.schedule('15 6-21 * * *', safeRun('hourly-scan', runAgentScanJob), { timezone: TZ })

  // Overnight scans every 4 hours (10pm, 2am) — 6am is covered by the daily briefing flow
  cron.schedule('15 22,2 * * *', safeRun('overnight-scan', runAgentScanJob), { timezone: TZ })

  // Daily deep audit + briefing at 6am AEST
  cron.schedule('0 6 * * *', safeRun('daily-briefing', runDailyBriefingJob), { timezone: TZ })

  // Daily Engine debrief to Josh's Telegram at 6am AEST
  cron.schedule('0 6 * * *', safeRun('engine-telegram-debrief', runEngineTelegramDebrief), { timezone: TZ })

  // Daily accuracy check + revert sweep at 7am AEST
  cron.schedule('0 7 * * *', safeRun('daily-accuracy-check', runAccuracyCheckJob), { timezone: TZ })

  // Boot-time verification: ping the API once so we surface auth errors immediately,
  // then refresh the Layer 2 auto-discovered context so the first scan is context-aware.
  setTimeout(async () => {
    try {
      const result = await pingGads()
      if (result.ok) {
        console.log(`[GadsAgentCron] ✅ Google Ads API live (account: ${result.name || 'unknown'})`)
        logAudit('api_ping_ok', result, null, 'agent')
        try {
          const auto = await refreshAutoContext()
          console.log(`[GadsAgentCron] ✅ Context discovered — ${auto.enabledCampaigns.length} enabled campaigns, ${auto.pausedCampaigns.length} paused, ${auto.sharedLists.length} shared lists`)
          logAudit('context_refreshed', {
            enabledCampaigns: auto.enabledCampaigns.length,
            pausedCampaigns: auto.pausedCampaigns.length,
            sharedLists: auto.sharedLists.length,
          }, null, 'agent')
        } catch (ctxErr) {
          console.error('[GadsAgentCron] Context refresh failed at boot:', ctxErr.message)
        }
      } else {
        console.error(`[GadsAgentCron] ❌ Google Ads API ping failed:`, result.error)
        logAudit('api_ping_failed', result, null, 'agent')
      }
    } catch (err) {
      console.error('[GadsAgentCron] API ping threw:', err.message)
    }
  }, 10_000)

  console.log('[GadsAgentCron] Scheduled: hourly scan (6am-9pm), overnight scan (10pm,2am), daily briefing (6am), engine telegram debrief (6am), accuracy check (7am) — all AEST')
}
