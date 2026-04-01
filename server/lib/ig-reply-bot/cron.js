/**
 * ig-reply-bot/cron.js
 * Weekly tone profile refresh via node-cron.
 * Also checks on startup if a tone profile exists and extracts one if needed.
 */

import cron from 'node-cron'
import { extractToneProfile } from './tone-extractor.js'
import { loadToneProfile } from './store.js'

let cronJob = null

export function startIGReplyBotCron() {
  // Startup check: extract tone if none exists (async, non-blocking)
  const existing = loadToneProfile()
  if (!existing) {
    console.log('[IG-Reply-Bot] No tone profile found — extracting on first boot...')
    extractToneProfile().catch(e => {
      console.error('[IG-Reply-Bot] Startup tone extraction failed:', e.message)
    })
  } else {
    console.log(`[IG-Reply-Bot] Tone profile loaded (extracted: ${existing.extractedAt}, ${existing.postCount} posts)`)
  }

  // Weekly refresh: Sunday 3am AEST
  cronJob = cron.schedule('0 3 * * 0', async () => {
    console.log('[IG-Reply-Bot] Running weekly tone refresh...')
    try {
      await extractToneProfile()
      console.log('[IG-Reply-Bot] Weekly tone refresh complete')
    } catch (e) {
      console.error('[IG-Reply-Bot] Weekly tone refresh failed:', e.message)
    }
  }, { timezone: 'Australia/Brisbane' })

  console.log('[IG-Reply-Bot] Cron started — tone refresh: Sundays 3am AEST')
}

export function stopIGReplyBotCron() {
  if (cronJob) {
    cronJob.stop()
    cronJob = null
    console.log('[IG-Reply-Bot] Cron stopped')
  }
}
