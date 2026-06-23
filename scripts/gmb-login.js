#!/usr/bin/env node
/**
 * gmb-login.js — one-time manual Google sign-in for the GMB auto-poster.
 *
 * Launches a headed Playwright Chromium so Josh can sign in to
 * contact.genderrevealideas@gmail.com (the GBP owner account) by hand —
 * including any 2FA prompts. Once he confirms by pressing ENTER, we persist
 * the resulting cookies + localStorage to dataFile('gmb-auth.json'). The
 * daily cron (gmb-post-daily.js) then re-uses that storage state via
 * gmb-poster.js, no further manual sign-in needed for ~30 days.
 *
 * Run: node scripts/gmb-login.js
 *
 * Notes:
 *   - Headed on purpose — Google trips automation heuristics on the
 *     2FA/passkey step in headless mode.
 *   - Auth file lives on the Railway volume (or local data/) via
 *     dataFile(), so it survives redeploys.
 */

import { chromium } from 'playwright'
import readline from 'readline'
import { dataFile } from '../server/lib/data-dir.js'

const AUTH_STATE = dataFile('gmb-auth.json')
const SIGN_IN_URL = 'https://accounts.google.com'
const TARGET_ACCOUNT = 'contact.genderrevealideas@gmail.com'

/**
 * Block the script until Josh hits ENTER in the terminal.
 * readline is closed in finally so we don't leak the stdin handle.
 */
function waitForEnter(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    rl.question(prompt, () => {
      rl.close()
      resolve()
    })
  })
}

async function main() {
  console.log('[gmb-login] Launching Chromium (headed)…')
  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled'],
  })

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'en-AU',
    timezoneId: 'Australia/Sydney',
  })

  const page = await context.newPage()

  try {
    console.log(`[gmb-login] Navigating to ${SIGN_IN_URL}`)
    await page.goto(SIGN_IN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })

    console.log('')
    console.log('───────────────────────────────────────────────────────────────')
    console.log(`Sign in to ${TARGET_ACCOUNT} then press ENTER`)
    console.log('───────────────────────────────────────────────────────────────')
    console.log('')

    await waitForEnter('Press ENTER once signed in… ')

    console.log(`[gmb-login] Saving storage state to ${AUTH_STATE}`)
    await context.storageState({ path: AUTH_STATE })
  } finally {
    try { await context.close() } catch {}
    try { await browser.close() } catch {}
  }

  console.log('')
  console.log(`[gmb-login] ✓ Success — auth state written to ${AUTH_STATE}`)
  console.log('[gmb-login] You can now run scripts/gmb-post-daily.js unattended.')
}

main().catch((err) => {
  console.error('[gmb-login] FAILED:', err?.message || err)
  process.exit(1)
})
