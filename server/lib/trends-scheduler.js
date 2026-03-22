/**
 * Google Trends Scheduler
 * Daily scan at 3am AEST (17:00 UTC).
 * Also runs once on boot (60s delay).
 */

import { runTrendsScan } from './google-trends.js'

function msUntilNextUTC(utcHour, utcMinute = 0) {
  const now = new Date()
  const target = new Date(now)
  target.setUTCHours(utcHour, utcMinute, 0, 0)
  if (target <= now) target.setUTCDate(target.getUTCDate() + 1)
  return Math.max(0, target.getTime() - now.getTime())
}

let active = false

export function startTrendsScheduler() {
  if (active) return
  active = true
  console.log('[Trends Cron] Trends Intelligence scheduler active, daily at 3am AEST')

  // Daily at 3am AEST = 17:00 UTC
  const schedule = () => {
    const ms = msUntilNextUTC(17, 0)
    const next = new Date(Date.now() + ms)
    console.log(`[Trends Cron] Next scan: ${next.toLocaleString('en-AU', { timeZone: 'Australia/Brisbane' })} AEST`)
    setTimeout(async () => {
      try { await runTrendsScan() }
      catch (e) { console.error('[Trends Cron] Scheduled scan failed:', e.message) }
      schedule()
    }, ms)
  }
  schedule()

  // Boot scan: 60s after startup
  setTimeout(async () => {
    try { await runTrendsScan() }
    catch (e) { console.error('[Trends Cron] Boot scan failed:', e.message) }
  }, 60000)
}
