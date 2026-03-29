/**
 * ads-snapshot-cron.js
 * Daily snapshot + Telegram report at 8am AEST (UTC+10 = 22:00 UTC previous day).
 */
import cron from 'node-cron'
import { isMetaConfigured } from './meta-api.js'
import { sendAdsDailyReport } from './ads-telegram-report.js'

export function startAdsSnapshotCron() {
  if (!isMetaConfigured()) {
    console.log('[AdsCron] Meta API not configured — ads cron disabled')
    return
  }

  // 8:00 AM AEST = 22:00 UTC (previous day)
  cron.schedule('0 22 * * *', async () => {
    console.log('[AdsCron] Running daily ads report...')
    try {
      await sendAdsDailyReport()
      console.log('[AdsCron] Daily report complete')
    } catch (err) {
      console.error('[AdsCron] Failed:', err.message)
    }
  }, { timezone: 'Australia/Brisbane' })

  console.log('[AdsCron] Ads daily report scheduled: 8:00 AM AEST')
}
