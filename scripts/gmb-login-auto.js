#!/usr/bin/env node
/**
 * gmb-login-auto.js — non-interactive variant of gmb-login.js.
 *
 * Opens a headed Chromium, polls every 3 seconds for a signed-in Google
 * session, and saves the storage state to data/gmb-auth.json the moment
 * the session is detected. No ENTER prompt — closes itself when done.
 *
 * Used by automated setup flows where we want to background the browser,
 * let the user sign in at their own pace, and pick up the cookies as soon
 * as they exist.
 *
 * Detection signal: navigate to https://myaccount.google.com and watch for
 * either a non-redirect to accounts.google.com OR the presence of a Google
 * session cookie (__Secure-1PSID).
 *
 * Run: node scripts/gmb-login-auto.js [--timeout=600]   (default 10 min)
 */
import { chromium } from 'playwright'
import { dataFile, dataDir } from '../server/lib/data-dir.js'

const AUTH_STATE = dataFile('gmb-auth.json')
const PROBE_URL = 'https://myaccount.google.com/'
const TARGET_ACCOUNT = 'contact.genderrevealideas@gmail.com'

// Dedicated Chrome profile JUST for GMB automation. Lives at
// data/gmb-chrome-profile/. Uses REAL Google Chrome (channel:'chrome')
// instead of the bundled Chromium, so it looks/feels like a normal Chrome
// window — password manager extensions can be installed, branding is
// familiar. Profile is separate from Josh's everyday Chrome (Default
// profile), so his real browsing stays untouched.
const CHROME_PROFILE_DIR = dataDir('gmb-chrome-profile')

const timeoutArg = process.argv.find(a => a.startsWith('--timeout='))
const TIMEOUT_SECONDS = timeoutArg ? Number(timeoutArg.split('=')[1]) : 600

function log(msg) { console.log(`[gmb-login-auto] ${msg}`) }

async function isSignedIn(context, page) {
  // Check 1: Google session cookies present on .google.com
  const cookies = await context.cookies()
  const hasSession = cookies.some(c =>
    /^(__Secure-1PSID|__Secure-3PSID|SAPISID)$/.test(c.name) &&
    /google\.com$/.test(c.domain) &&
    c.value && c.value.length > 10
  )
  if (!hasSession) return false

  // Check 2: navigate to myaccount.google.com — if redirected to accounts.google.com/signin, we're NOT signed in
  try {
    await page.goto(PROBE_URL, { waitUntil: 'domcontentloaded', timeout: 15000 })
    const url = page.url()
    if (url.startsWith('https://accounts.google.com/') || /\/signin/.test(url)) return false
    return true
  } catch {
    return false
  }
}

async function main() {
  log(`Launching real Google Chrome with dedicated GMB profile at ${CHROME_PROFILE_DIR}`)
  log('(your everyday Chrome profile is untouched — this is a separate sandboxed profile for posting)')

  // launchPersistentContext + channel:'chrome' uses installed Google Chrome
  // (not the bundled Chromium) and stores cookies/passwords/extensions in
  // CHROME_PROFILE_DIR. Subsequent runs of this script will open Chrome
  // already signed-in — no password re-entry needed unless Google logs
  // the session out.
  const context = await chromium.launchPersistentContext(CHROME_PROFILE_DIR, {
    channel: 'chrome',
    headless: false,
    viewport: { width: 1440, height: 900 },
    locale: 'en-AU',
    timezoneId: 'Australia/Sydney',
    args: ['--disable-blink-features=AutomationControlled'],
  })

  const page = context.pages()[0] || await context.newPage()

  try {
    log(`Opening Google sign-in for ${TARGET_ACCOUNT}…`)
    await page.goto('https://accounts.google.com/signin', { waitUntil: 'domcontentloaded', timeout: 60000 })

    log(`Sign in at your own pace. Polling every 3s for up to ${TIMEOUT_SECONDS}s.`)
    log('The window will close itself the moment a signed-in session is detected.')

    const started = Date.now()
    while ((Date.now() - started) / 1000 < TIMEOUT_SECONDS) {
      await new Promise(r => setTimeout(r, 3000))
      const ok = await isSignedIn(context, page).catch(() => false)
      if (ok) {
        log('✓ Signed-in session detected.')
        // Export storageState so the daily poster can use storageState mode
        // (faster cold-start than launching the persistent profile)
        await context.storageState({ path: AUTH_STATE })
        log(`✓ Auth state exported → ${AUTH_STATE}`)
        log(`✓ Persistent Chrome profile saved → ${CHROME_PROFILE_DIR}`)
        return
      }
    }
    throw new Error(`Timed out after ${TIMEOUT_SECONDS}s waiting for sign-in`)
  } finally {
    try { await context.close() } catch {}
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[gmb-login-auto] FAILED:', err?.message || err)
    process.exit(1)
  })
