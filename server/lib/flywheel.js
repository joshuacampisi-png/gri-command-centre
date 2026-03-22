/**
 * 24/7 SEO Flywheel — GRI ONLY
 * PABLO SYSTEM UPDATE — 18 March 2026
 * Rules:
 *   - GRI only (Lionzen/GBU paused until system proven)
 *   - Runs once daily at 2:00am AEST (UTC 16:00)
 *   - Crash recovery: try/catch on every cycle, Telegram alert on failure
 *   - Deduplication enforced in seo-task-writer.js before lodging
 */

import { runSEOCrawl } from './seo-crawler.js'
import { runFullFlywheelWithBriefs } from './seo-task-writer.js'
import { env } from './env.js'

const JOSH_CHAT = '8040702286'

async function sendTelegram(text) {
  try {
    await fetch(`https://api.telegram.org/bot${env.telegram.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: JOSH_CHAT, text, parse_mode: 'Markdown' })
    })
  } catch (e) { console.error('[Flywheel] Telegram error:', e.message) }
}

/** Calculate ms until next occurrence of a UTC time (for AEST scheduling) */
function msUntilNextUTCTime(utcHour, utcMinute = 0) {
  const now = new Date()
  const target = new Date(now)
  target.setUTCHours(utcHour, utcMinute, 0, 0)
  if (target <= now) target.setUTCDate(target.getUTCDate() + 1)
  return Math.max(0, target.getTime() - now.getTime())
}

let flywheelActive = false
let lastRunAt = null
const stats = { totalAudits: 0, tasksCreated: 0, tasksDeduplicated: 0, errors: 0, lastError: null }

/**
 * Starts the flywheel.
 * GRI audits run once daily at 2:00am AEST (UTC 16:00).
 * Also runs immediately on boot (30s delay so server is fully ready).
 */
export async function startFlywheel() {
  if (flywheelActive) {
    console.log('[Flywheel] Already running')
    return
  }
  flywheelActive = true
  console.log('[Flywheel] 🚀 24/7 SEO Flywheel activated — GRI only, daily at 2:00am AEST')

  // ── Daily at 2:00am AEST (16:00 UTC) ──
  const schedule2am = () => {
    const msUntil = msUntilNextUTCTime(16, 0) // 16:00 UTC = 2:00am AEST
    const nextRun = new Date(Date.now() + msUntil)
    console.log(`[Flywheel] Next GRI audit: ${nextRun.toLocaleString('en-AU', { timeZone: 'Australia/Brisbane' })} AEST`)
    setTimeout(async () => {
      await runAuditCycle('GRI')
      schedule2am() // reschedule for next day
    }, msUntil)
  }
  schedule2am()

  // ── Boot run: 30s after startup ──
  setTimeout(() => runAuditCycle('GRI'), 30000)
}

export function stopFlywheel() {
  flywheelActive = false
  console.log('[Flywheel] Stopped')
}

export function getFlywheelStatus() {
  return { active: flywheelActive, lastRunAt, stats, company: 'GRI' }
}

async function runAuditCycle(company) {
  if (!flywheelActive) return
  lastRunAt = new Date().toISOString()
  stats.totalAudits++
  const aestTime = new Date().toLocaleString('en-AU', { timeZone: 'Australia/Brisbane' })
  console.log(`[Flywheel] ▶ ${company} audit starting — ${aestTime} AEST`)

  try {
    // 1. Crawl
    const crawl = await runSEOCrawl(company)
    if (!crawl.ok) {
      stats.errors++
      stats.lastError = crawl.error
      console.error(`[Flywheel] Crawl failed:`, crawl.error)
      await sendTelegram(
`⚠️ *PABLO SYSTEM ALERT*

Time: ${aestTime} AEST
Issue: SEO crawl failed for ${company}
Error: ${crawl.error}
Action: Will retry at next scheduled run (2am AEST)

— Pablo Escobot`
      ).catch(() => {})
      return
    }

    if (crawl.findings.length === 0) {
      console.log(`[Flywheel] ✅ ${company} — No new findings`)
      return
    }

    // 2. Generate Claude briefs + lodge tasks (dedup enforced inside)
    const results = await runFullFlywheelWithBriefs(crawl.findings, company)
    stats.tasksCreated += results.length
    stats.tasksDeduplicated += (crawl.findings.length - results.length)

    const high   = results.filter(r => r.finding?.severity === 'High').length
    const medium = results.filter(r => r.finding?.severity === 'Medium').length
    const skipped = crawl.findings.length - results.length
    console.log(`[Flywheel] ✅ ${company} — ${crawl.pagesAudited} pages, ${results.length} tasks lodged, ${skipped} duplicates skipped`)

    if (results.length === 0) {
      console.log('[Flywheel] All findings were duplicates — no new tasks lodged')
      return
    }

    const topLines = results.slice(0, 5).map((r, i) =>
      `${i + 1}. [${r.finding.severity}] ${r.finding.issue.slice(0, 55)} — \`${r.finding.page}\``
    ).join('\n')

    await sendTelegram(
`🔄 *AUTO-FLYWHEEL — ${company}*

Pablo ran a scheduled SEO audit. Low-risk fixes auto-applying now.

📊 *Results*
• Pages crawled: ${crawl.pagesAudited}
• Findings: ${crawl.totalFindings} total
• New tasks queued: ${results.length} (${high} High, ${medium} Medium)
• Duplicates skipped: ${skipped} (already in your queue)

📋 *New Issues*
${topLines}

🤖 Alt text & 404 redirects auto-fixing.
✏️ Meta & title changes appear in Approval tab first.

http://127.0.0.1:4173/

— Pablo Escobot 🚀`
    )
  } catch (e) {
    stats.errors++
    stats.lastError = e.message
    const aestNow = new Date().toLocaleString('en-AU', { timeZone: 'Australia/Brisbane' })
    console.error(`[Flywheel] ❌ ${company} error:`, e.message)
    await sendTelegram(
`⚠️ *PABLO SYSTEM ALERT*

Time: ${aestNow} AEST
Issue: Flywheel cycle crashed (${company})
Error: ${e.message}
Action: Will retry at next scheduled run (2am AEST)
Manual check needed: No (auto-recovery active)

— Pablo Escobot`
    ).catch(() => {})
  }
}
