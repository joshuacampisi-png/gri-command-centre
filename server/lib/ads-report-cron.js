/**
 * ads-report-cron.js
 * Schedules daily and weekly Meta Ads Telegram reports via Pablo's bot.
 *
 * Daily:  8:00 AM AEST every day
 * Weekly: 8:00 AM AEST every Monday
 */
import cron from 'node-cron'
import { isMetaConfigured } from './meta-api.js'
import { sendAdsDaily } from './ads-daily-report.js'
import { sendAdsWeekly } from './ads-weekly-report.js'

export function startAdsReportCrons() {
  if (!isMetaConfigured()) {
    console.log('[AdsReportCron] Meta API not configured — report crons disabled')
    return
  }

  // Daily at 8:00 AM AEST
  cron.schedule('0 8 * * *', async () => {
    console.log('[AdsReportCron] Running daily ads report...')
    try {
      const result = await sendAdsDaily()
      console.log('[AdsReportCron] Daily report:', result.ok ? 'sent' : result.error)
    } catch (err) {
      console.error('[AdsReportCron] Daily report failed:', err.message)
    }
  }, { timezone: 'Australia/Brisbane' })

  // Monday at 8:00 AM AEST
  cron.schedule('0 8 * * 1', async () => {
    console.log('[AdsReportCron] Running weekly ads report...')
    try {
      const result = await sendAdsWeekly()
      console.log('[AdsReportCron] Weekly report:', result.ok ? 'sent' : result.error)
    } catch (err) {
      console.error('[AdsReportCron] Weekly report failed:', err.message)
    }
  }, { timezone: 'Australia/Brisbane' })

  console.log('[AdsReportCron] Daily report scheduled: 8:00 AM AEST (every day)')
  console.log('[AdsReportCron] Weekly report scheduled: 8:00 AM AEST (Monday)')
}
