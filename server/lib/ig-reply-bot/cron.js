/**
 * ig-reply-bot/cron.js
 * - Comment poller: every 2 minutes (fallback for Development mode webhooks)
 * - Weekly tone profile refresh
 * - Startup tone extraction if none exists
 */

import cron from 'node-cron'
import { extractToneProfile } from './tone-extractor.js'
import { loadToneProfile } from './store.js'
import { pollForNewComments } from './comment-poller.js'

let toneCron = null
let pollCron = null

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

  // Weekly tone refresh: Sunday 3am AEST
  toneCron = cron.schedule('0 3 * * 0', async () => {
    console.log('[IG-Reply-Bot] Running weekly tone refresh...')
    try {
      await extractToneProfile()
      console.log('[IG-Reply-Bot] Weekly tone refresh complete')
    } catch (e) {
      console.error('[IG-Reply-Bot] Weekly tone refresh failed:', e.message)
    }
  }, { timezone: 'Australia/Brisbane' })

  // Comment poller: every 2 minutes (webhook fallback)
  pollCron = cron.schedule('*/2 * * * *', async () => {
    try {
      await pollForNewComments()
    } catch (e) {
      console.error('[IG-Reply-Bot] Poll failed:', e.message)
    }
  }, { timezone: 'Australia/Brisbane' })

  console.log('[IG-Reply-Bot] Cron started — poll: every 2min | tone refresh: Sundays 3am AEST')
}

export function stopIGReplyBotCron() {
  if (toneCron) { toneCron.stop(); toneCron = null }
  if (pollCron) { pollCron.stop(); pollCron = null }
  console.log('[IG-Reply-Bot] Cron stopped')
}
