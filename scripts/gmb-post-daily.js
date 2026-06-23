#!/usr/bin/env node
/**
 * gmb-post-daily.js — cron entry point for the GMB Auto-Poster Flywheel.
 *
 * Wiring (one daily run, invoked by cron at the time configured in
 * data/gmb-config.json):
 *   1. Load gmb-config.json (queue folder + urlMapping + alert email).
 *   2. getNextImage() — oldest pending image, FIFO. Empty queue → exit 0.
 *   3. getCategoryFromFilename() → pickDescription() (avoids any copy
 *      posted in the last 14 days).
 *   4. postToGmb() — Playwright-driven post to the GBP listing.
 *   5. On success: markPosted() (moves the file to /posted/), logPost(),
 *      exit 0.
 *   6. On failure: logFailure(); if consecutiveFailures() > 1, fire a
 *      Telegram alert to Josh so he notices selector drift before it
 *      eats a week of posts; exit 1.
 *
 * Exit codes are meaningful to cron / monitoring:
 *   0 — success OR empty queue (nothing to do is not an error)
 *   1 — failure (logged + alert maybe fired)
 *
 * Run: node scripts/gmb-post-daily.js
 */

import { readFileSync } from 'fs'
import { dataFile } from '../server/lib/data-dir.js'
import { getNextImage, getCategoryFromFilename, markPosted } from '../server/lib/gmb-queue.js'
import { pickDescription } from '../server/lib/gmb-descriptions.js'
import { postToGmb } from '../server/lib/gmb-poster.js'
import { logPost, logFailure, consecutiveFailures } from '../server/lib/gmb-state.js'

const CONFIG_PATH = dataFile('gmb-config.json')

/**
 * Send a Telegram alert when consecutive failures cross the threshold.
 * Mirrors the pattern in server/lib/hire-mailer.js#telegramFallback so we
 * stay consistent with the rest of the Command Centre's alerting.
 *
 * Silently no-ops if TELEGRAM_BOT_TOKEN or TELEGRAM_JOSH_CHAT_ID are unset
 * — alerting shouldn't crash the cron.
 */
async function telegramFallback({ image, error, failures }) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_JOSH_CHAT_ID
  if (!token || !chatId) {
    console.warn('[gmb-post-daily] Telegram not configured — skipping alert')
    return
  }

  const msg =
    `⚠️ GMB AUTO-POST FAILED (${failures} in a row)\n\n` +
    `Image: ${image || '(none)'}\n` +
    `Error: ${error}\n\n` +
    `Check the queue + auth state. May need to re-run scripts/gmb-login.js.`

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: msg }),
    })
  } catch (e) {
    console.error('[gmb-post-daily] Telegram fallback failed:', e?.message || e)
  }
}

function loadConfig() {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'))
  } catch (e) {
    throw new Error(`Cannot read ${CONFIG_PATH}: ${e.message}`)
  }
}

async function main() {
  const startedAt = new Date().toISOString()
  console.log(`[gmb-post-daily] Starting ${startedAt}`)

  const config = loadConfig()

  const image = getNextImage()
  if (!image) {
    console.log('[gmb-post-daily] Queue is empty — nothing to post. Exiting 0.')
    return 0
  }
  console.log(`[gmb-post-daily] Next image: ${image.name}`)

  const mapping = getCategoryFromFilename(image.name, config.urlMapping)
  if (!mapping) {
    const err = new Error(`No urlMapping match (and no default) for ${image.name}`)
    logFailure({ image: image.name, error: err.message, at: new Date().toISOString() })
    console.error('[gmb-post-daily]', err.message)
    return 1
  }
  // Category for description rotation = the filenameMatch token. The
  // 'default' mapping yields the 'default' description pool.
  const category = mapping.filenameMatch

  const description = pickDescription({ category })
  if (!description) {
    const err = new Error(`No description available for category "${category}"`)
    logFailure({ image: image.name, error: err.message, at: new Date().toISOString() })
    console.error('[gmb-post-daily]', err.message)
    return 1
  }
  console.log(`[gmb-post-daily] Description: ${description.id}`)
  console.log(`[gmb-post-daily] Button: ${mapping.button} → ${mapping.url}`)

  try {
    const result = await postToGmb({
      imagePath: image.path,
      description: description.text,
      buttonType: mapping.button,
      buttonUrl: mapping.url,
    })

    markPosted(image.path)
    logPost({
      image: image.name,
      descriptionId: description.id,
      buttonUrl: mapping.url,
      buttonType: mapping.button,
      postedAt: result.postedAt,
    })

    console.log(`[gmb-post-daily] ✓ Posted ${image.name} at ${result.postedAt}`)
    return 0
  } catch (err) {
    const at = new Date().toISOString()
    const errorMsg = err?.message || String(err)
    console.error('[gmb-post-daily] FAILED:', errorMsg)

    logFailure({ image: image.name, error: errorMsg, at })

    const failures = consecutiveFailures()
    console.error(`[gmb-post-daily] Consecutive failures: ${failures}`)

    if (failures > 1) {
      await telegramFallback({ image: image.name, error: errorMsg, failures })
    }

    return 1
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error('[gmb-post-daily] FATAL:', err?.message || err)
    process.exit(1)
  })
