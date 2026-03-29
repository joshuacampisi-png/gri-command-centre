import cron from 'node-cron'
import { rollBaselineForward } from './daily-revenue.js'

/**
 * Daily cron at 1am AEST — rolls the YTD baseline forward
 * so orders falling outside the 60-day API window are preserved.
 */
export function startRevenueBaselineCron() {
  // 1am AEST daily
  cron.schedule('0 1 * * *', async () => {
    try {
      const result = await rollBaselineForward()
      if (result.rolled) {
        console.log(`[RevenueCron] Baseline rolled to ${result.through}`)
      }
    } catch (e) {
      console.error('[RevenueCron] Error:', e.message)
    }
  }, { timezone: 'Australia/Brisbane' })

  console.log('[RevenueCron] Daily baseline roll scheduled (1am AEST)')
}
