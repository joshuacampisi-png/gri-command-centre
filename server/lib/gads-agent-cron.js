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

  // Build recommendation cards (top N get AI enrichment, rest are templated)
  const recs = await buildRecommendationsFromFindings(newFindings)

  for (const r of recs) {
    const saved = addRecommendation({ ...r, severity: newFindings.find(f => f.fingerprint === r.fingerprint)?.severity })
    logAudit('recommendation_created', {
      title: saved.issueTitle,
      category: saved.category,
      projectedImpact: saved.projectedDollarImpact,
    }, saved.id, 'agent')
  }

  logAudit('scan_completed', {
    findings: scan.findings.length,
    newRecommendations: recs.length,
    counts: scan.counts,
  }, null, 'agent')

  return { findings: scan.findings.length, newRecommendations: recs.length, counts: scan.counts }
}

export async function runDailyBriefingJob() {
  if (!isGadsConfigured()) {
    console.log('[GadsAgentCron] Google Ads API not configured, skipping briefing')
    return { skipped: true }
  }

  // Pull latest account summary for context
  const scan = await runFullScan()
  const briefing = await generateIntelligenceBriefing(scan.summary)
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

  // Daily accuracy check + revert sweep at 7am AEST
  cron.schedule('0 7 * * *', safeRun('daily-accuracy-check', runAccuracyCheckJob), { timezone: TZ })

  // Boot-time verification: ping the API once so we surface auth errors immediately
  setTimeout(async () => {
    try {
      const result = await pingGads()
      if (result.ok) {
        console.log(`[GadsAgentCron] ✅ Google Ads API live (account: ${result.name || 'unknown'})`)
        logAudit('api_ping_ok', result, null, 'agent')
      } else {
        console.error(`[GadsAgentCron] ❌ Google Ads API ping failed:`, result.error)
        logAudit('api_ping_failed', result, null, 'agent')
      }
    } catch (err) {
      console.error('[GadsAgentCron] API ping threw:', err.message)
    }
  }, 10_000)

  console.log('[GadsAgentCron] Scheduled: hourly scan (6am-9pm), overnight scan (10pm,2am), daily briefing (6am), accuracy check (7am) — all AEST')
}
