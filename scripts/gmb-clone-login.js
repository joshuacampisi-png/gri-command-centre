#!/usr/bin/env node
/**
 * gmb-clone-login.js
 *
 * Captures the signed-in Google session from Josh's everyday Chrome
 * WITHOUT making him close it.
 *
 * Approach:
 *   1. Clone the relevant auth files from his real Chrome profile
 *      (~/Library/Application Support/Google/Chrome/Default) into the
 *      dedicated GMB profile dir (data/gmb-chrome-profile/Default).
 *   2. Launch Playwright Chromium with the cloned profile — should be
 *      already signed in because we carried over Cookies, Login Data,
 *      Local State and Preferences. macOS Chrome's cookie encryption key
 *      lives in the Mac user's Keychain (not per-profile), so the cloned
 *      cookies decrypt fine in the new profile.
 *   3. Navigate to myaccount.google.com and check we're signed in.
 *   4. Save storage state to data/gmb-auth.json for the daily cron.
 *
 * If anything fails (Chrome encryption rotation, missing cookies, login
 * not detected), we fall through to a UI sign-in flow so Josh can still
 * complete the auth manually in this same Playwright window.
 *
 * Run: node scripts/gmb-clone-login.js
 */

import { chromium } from 'playwright'
import { existsSync, copyFileSync, mkdirSync, cpSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { dataFile, dataDir } from '../server/lib/data-dir.js'

const AUTH_STATE = dataFile('gmb-auth.json')
const CLONE_PROFILE_DIR = dataDir('gmb-chrome-profile')
const CLONE_PROFILE_DEFAULT = join(CLONE_PROFILE_DIR, 'Default')
const REAL_CHROME_DEFAULT = join(homedir(), 'Library', 'Application Support', 'Google', 'Chrome', 'Default')
const REAL_CHROME_ROOT = join(homedir(), 'Library', 'Application Support', 'Google', 'Chrome')

const PROBE_URL = 'https://myaccount.google.com/'
const TARGET_ACCOUNT = 'contact.genderrevealideas@gmail.com'

const log = (m) => console.log(`[gmb-clone] ${m}`)

function cloneProfile() {
  if (!existsSync(REAL_CHROME_DEFAULT)) {
    log('⚠️  Real Chrome Default profile not found — skipping clone, falling through to manual sign-in')
    return false
  }

  log(`Cloning auth state from ${REAL_CHROME_DEFAULT}`)
  log(`Into ${CLONE_PROFILE_DEFAULT}`)
  mkdirSync(CLONE_PROFILE_DEFAULT, { recursive: true })

  // Files that hold the signed-in session state. Cookies is the critical one.
  // Login Data has saved passwords (not really needed for an already-signed-in
  // session but useful if Chrome needs to re-issue auth). Local State at the
  // ROOT (not Default) has the OS-encryption-key wrapper Chrome uses to
  // decrypt the Cookies file — without this Chrome would generate a NEW key
  // and the cloned cookies would be unreadable.
  const filesToClone = [
    { from: join(REAL_CHROME_DEFAULT, 'Cookies'),       to: join(CLONE_PROFILE_DEFAULT, 'Cookies') },
    { from: join(REAL_CHROME_DEFAULT, 'Cookies-journal'),to: join(CLONE_PROFILE_DEFAULT, 'Cookies-journal') },
    { from: join(REAL_CHROME_DEFAULT, 'Login Data'),    to: join(CLONE_PROFILE_DEFAULT, 'Login Data') },
    { from: join(REAL_CHROME_DEFAULT, 'Preferences'),   to: join(CLONE_PROFILE_DEFAULT, 'Preferences') },
    { from: join(REAL_CHROME_ROOT, 'Local State'),      to: join(CLONE_PROFILE_DIR, 'Local State') },
  ]

  let copied = 0
  for (const { from, to } of filesToClone) {
    if (existsSync(from)) {
      try {
        copyFileSync(from, to)
        copied++
        log(`  ✓ ${from.split('/').pop()}`)
      } catch (e) {
        log(`  ⚠ ${from.split('/').pop()} — ${e.message}`)
      }
    } else {
      log(`  · ${from.split('/').pop()} — not present, skipping`)
    }
  }
  log(`Cloned ${copied}/${filesToClone.length} files`)
  return copied >= 2 // need at least Cookies + Local State for decryption to work
}

async function isSignedIn(context, page) {
  const cookies = await context.cookies()
  const hasSession = cookies.some(c =>
    /^(__Secure-1PSID|__Secure-3PSID|SAPISID)$/.test(c.name) &&
    /google\.com$/.test(c.domain) &&
    c.value && c.value.length > 10
  )
  if (!hasSession) return false
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
  const cloned = cloneProfile()
  if (!cloned) {
    log('Clone incomplete — Chrome will open empty; sign in manually if needed')
  }

  log('Launching Chrome with cloned profile…')
  const context = await chromium.launchPersistentContext(CLONE_PROFILE_DIR, {
    channel: 'chrome',
    headless: false,
    viewport: { width: 1440, height: 900 },
    locale: 'en-AU',
    timezoneId: 'Australia/Sydney',
    args: ['--disable-blink-features=AutomationControlled'],
  })

  const page = context.pages()[0] || await context.newPage()

  try {
    log('Checking if cloned session is already signed in…')
    const alreadyIn = await isSignedIn(context, page).catch(() => false)

    if (alreadyIn) {
      log('✓ Cloned session is signed in — saving auth state immediately')
      await context.storageState({ path: AUTH_STATE })
      log(`✓ Auth state saved → ${AUTH_STATE}`)
      return
    }

    log('Cloned session not detected as signed in. Opening sign-in page so you can sign in manually.')
    await page.goto('https://accounts.google.com/signin', { waitUntil: 'domcontentloaded', timeout: 60000 })
    log(`Sign in to ${TARGET_ACCOUNT} when ready. Polling every 3s for up to 45 min.`)

    const TIMEOUT_SECONDS = 2700
    const started = Date.now()
    while ((Date.now() - started) / 1000 < TIMEOUT_SECONDS) {
      await new Promise(r => setTimeout(r, 3000))
      if (await isSignedIn(context, page).catch(() => false)) {
        log('✓ Signed-in session detected')
        await context.storageState({ path: AUTH_STATE })
        log(`✓ Auth state saved → ${AUTH_STATE}`)
        return
      }
    }
    throw new Error('Timed out waiting for sign-in')
  } finally {
    try { await context.close() } catch {}
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[gmb-clone] FAILED:', err?.message || err)
    process.exit(1)
  })
