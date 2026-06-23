/**
 * GMB Auto-Poster — Playwright posting flow for Google Business Profile
 *
 * Posts an image + description + CTA button to the Gender Reveal Ideas GBP
 * listing using a persisted Playwright storage state (cookies + localStorage).
 *
 * Notes:
 * - First run must be authenticated via scripts/gmb-login.js which writes the
 *   storage state file referenced by AUTH_STATE.
 * - Google's owner-panel DOM shifts often — every selector below has at least
 *   one fallback. Update fallbacks before tweaking timeouts.
 * - headless defaults to false until the selector set has been verified end
 *   to end against a real post.
 * - dryRun short-circuits before launching the browser, returning a simulated
 *   success payload so the caller can exercise the surrounding pipeline
 *   (queue rotation, description picking, state logging) without posting.
 * - On failure we capture a debug screenshot to dataFile() with a timestamped
 *   name and re-throw an Error carrying an explicit `.code` for triage.
 */

import { chromium } from 'playwright'
import { existsSync } from 'fs'
import { dataFile } from './data-dir.js'

const AUTH_STATE = dataFile('gmb-auth.json')

const GBP_SEARCH_URL =
  'https://www.google.com/search?q=Gender+Reveal+Ideas+-+Gender+Reveal+Store+Gold+Coast&authuser=1'

// Per-step timeouts (ms). Generous because Google's owner panel hydrates
// asynchronously and image processing can take >10s on first upload.
const TIMEOUTS = {
  navigation: 45000,
  panel: 20000,
  click: 15000,
  fill: 10000,
  uploadProcess: 45000,
  postConfirm: 45000,
}

// Selector fallbacks — first match wins. Keep the most-specific selector first
// and degrade gracefully. Adding to the bottom is safer than re-ordering.
const SELECTORS = {
  postsTab: [
    'div[role="tab"]:has-text("Posts")',
    'button:has-text("Posts")',
    'a:has-text("Posts")',
    'text=/^Posts$/',
  ],
  addPostButton: [
    'button:has-text("Add post")',
    'div[role="button"]:has-text("Add post")',
    'text=/Add post/i',
    'button:has-text("Add update")',
  ],
  descriptionField: [
    'textarea[aria-label*="description" i]',
    'textarea[placeholder*="description" i]',
    'textarea[aria-label*="write" i]',
    'div[role="textbox"][contenteditable="true"]',
    'textarea',
  ],
  fileInput: [
    'input[type="file"][accept*="image"]',
    'input[type="file"]',
  ],
  imagePreview: [
    'img[alt*="preview" i]',
    'img[src^="blob:"]',
    'div[aria-label*="image" i] img',
    'img[src*="googleusercontent"]',
  ],
  buttonToggle: [
    'button:has-text("Add a button")',
    'button:has-text("Button")',
    'div[role="button"]:has-text("Add a button")',
    'text=/Add a button/i',
  ],
  buttonTypeSelect: [
    'select[aria-label*="button" i]',
    'select',
  ],
  buttonLinkField: [
    'input[aria-label*="link" i]',
    'input[placeholder*="link" i]',
    'input[type="url"]',
    'input[aria-label*="url" i]',
  ],
  postButton: [
    'button:has-text("Post")',
    'div[role="button"]:has-text("Post")',
    'button:has-text("Publish")',
  ],
  successIndicator: [
    'text=/your post is published/i',
    'text=/post published/i',
    'text=/published/i',
    'text=/posted/i',
    'text=/success/i',
  ],
}

/**
 * Try each selector in order, returning the first locator that resolves.
 * Throws if none match within `timeout` ms.
 */
async function findFirst(page, selectors, { timeout } = { timeout: TIMEOUTS.click }) {
  const perSelector = Math.max(1000, Math.floor(timeout / selectors.length))
  let lastErr = null
  for (const sel of selectors) {
    try {
      const loc = page.locator(sel).first()
      await loc.waitFor({ state: 'visible', timeout: perSelector })
      return loc
    } catch (e) {
      lastErr = e
    }
  }
  throw new Error(`No selector matched. Tried: ${selectors.join(' | ')}. Last error: ${lastErr?.message || 'unknown'}`)
}

/**
 * Wrap a Playwright step with explicit error coding so the caller can
 * distinguish navigation failures from selector drift from upload stalls.
 */
async function step(code, fn) {
  try {
    return await fn()
  } catch (err) {
    const wrapped = new Error(`[${code}] ${err?.message || String(err)}`)
    wrapped.code = code
    wrapped.cause = err
    throw wrapped
  }
}

/**
 * Build a unique timestamped filename for a debug screenshot. Generated at
 * runtime so multiple failures in the same process never collide.
 */
function debugScreenshotPath() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const rand = Math.random().toString(36).slice(2, 8)
  return dataFile(`gmb-debug-${stamp}-${rand}.png`)
}

/**
 * Post an image + description + CTA button to the GBP listing.
 *
 * @param {object} opts
 * @param {string} opts.imagePath   - absolute path to the image file
 * @param {string} opts.description - post body text
 * @param {string} opts.buttonType  - GBP button label, e.g. "Book", "Order online"
 * @param {string} opts.buttonUrl   - target URL for the CTA
 * @param {boolean} [opts.dryRun=false] - if true, returns simulated success without launching browser
 * @param {boolean} [opts.headless=false] - Playwright headless flag; keep false until selectors are verified
 * @returns {Promise<{success: true, postedAt: string, dryRun?: boolean, image: string, descriptionPreview: string, buttonType: string, buttonUrl: string}>}
 */
export async function postToGmb({
  imagePath,
  description,
  buttonType,
  buttonUrl,
  dryRun = false,
  headless = false,
}) {
  if (!imagePath) {
    const e = new Error('imagePath is required')
    e.code = 'MISSING_IMAGE_PATH'
    throw e
  }
  if (!description) {
    const e = new Error('description is required')
    e.code = 'MISSING_DESCRIPTION'
    throw e
  }
  if (!buttonType) {
    const e = new Error('buttonType is required')
    e.code = 'MISSING_BUTTON_TYPE'
    throw e
  }
  if (!buttonUrl) {
    const e = new Error('buttonUrl is required')
    e.code = 'MISSING_BUTTON_URL'
    throw e
  }

  // Dry-run short-circuit. Timestamp generated here at call time as required.
  if (dryRun) {
    const postedAt = new Date().toISOString()
    return {
      success: true,
      dryRun: true,
      postedAt,
      image: imagePath,
      descriptionPreview: description.slice(0, 120),
      buttonType,
      buttonUrl,
    }
  }

  if (!existsSync(AUTH_STATE)) {
    const e = new Error(`Auth state missing at ${AUTH_STATE} — run scripts/gmb-login.js first`)
    e.code = 'AUTH_STATE_MISSING'
    throw e
  }

  if (!existsSync(imagePath)) {
    const e = new Error(`Image not found: ${imagePath}`)
    e.code = 'IMAGE_NOT_FOUND'
    throw e
  }

  let browser = null
  let context = null
  let page = null

  try {
    browser = await step('BROWSER_LAUNCH', () =>
      chromium.launch({ headless, args: ['--disable-blink-features=AutomationControlled'] })
    )

    context = await step('CONTEXT_CREATE', () =>
      browser.newContext({
        storageState: AUTH_STATE,
        viewport: { width: 1440, height: 900 },
        locale: 'en-AU',
        timezoneId: 'Australia/Sydney',
      })
    )

    page = await step('PAGE_CREATE', () => context.newPage())
    page.setDefaultTimeout(TIMEOUTS.click)

    await step('NAVIGATE', async () => {
      await page.goto(GBP_SEARCH_URL, {
        waitUntil: 'domcontentloaded',
        timeout: TIMEOUTS.navigation,
      })
      // networkidle can stall on Google; fall back to a short wait if it does
      try {
        await page.waitForLoadState('networkidle', { timeout: 8000 })
      } catch {
        await page.waitForTimeout(1500)
      }
    })

    await step('OPEN_POSTS_TAB', async () => {
      const tab = await findFirst(page, SELECTORS.postsTab, { timeout: TIMEOUTS.panel })
      await tab.click({ timeout: TIMEOUTS.click })
    })

    await step('CLICK_ADD_POST', async () => {
      const addBtn = await findFirst(page, SELECTORS.addPostButton, { timeout: TIMEOUTS.panel })
      await addBtn.click({ timeout: TIMEOUTS.click })
    })

    await step('FILL_DESCRIPTION', async () => {
      const field = await findFirst(page, SELECTORS.descriptionField, { timeout: TIMEOUTS.fill })
      // Use .fill() where possible, fall back to typing for contenteditable divs
      try {
        await field.fill(description, { timeout: TIMEOUTS.fill })
      } catch {
        await field.click({ timeout: TIMEOUTS.click })
        await page.keyboard.type(description, { delay: 5 })
      }
    })

    await step('UPLOAD_IMAGE', async () => {
      const input = await findFirst(page, SELECTORS.fileInput, { timeout: TIMEOUTS.fill })
      await input.setInputFiles(imagePath, { timeout: TIMEOUTS.fill })
      // Wait for preview to render before continuing
      await findFirst(page, SELECTORS.imagePreview, { timeout: TIMEOUTS.uploadProcess })
    })

    await step('ADD_BUTTON', async () => {
      const toggle = await findFirst(page, SELECTORS.buttonToggle, { timeout: TIMEOUTS.click })
      await toggle.click({ timeout: TIMEOUTS.click })

      // Try the native <select> path first; if not present, fall back to a
      // visible menu item with the buttonType label
      try {
        const select = await findFirst(page, SELECTORS.buttonTypeSelect, { timeout: 5000 })
        await select.selectOption({ label: buttonType })
      } catch {
        const menuItem = page.locator(`text=/^${buttonType}$/i`).first()
        await menuItem.waitFor({ state: 'visible', timeout: TIMEOUTS.click })
        await menuItem.click({ timeout: TIMEOUTS.click })
      }

      const linkField = await findFirst(page, SELECTORS.buttonLinkField, { timeout: TIMEOUTS.fill })
      await linkField.fill(buttonUrl, { timeout: TIMEOUTS.fill })
    })

    await step('CLICK_POST', async () => {
      const postBtn = await findFirst(page, SELECTORS.postButton, { timeout: TIMEOUTS.click })
      await postBtn.click({ timeout: TIMEOUTS.click })
    })

    await step('AWAIT_CONFIRMATION', async () => {
      await findFirst(page, SELECTORS.successIndicator, { timeout: TIMEOUTS.postConfirm })
    })

    // Refresh storage state — cookies rotate per-session and saving here is
    // what keeps the unattended cron run alive for ~30 days.
    await step('SAVE_AUTH_STATE', () => context.storageState({ path: AUTH_STATE }))

    const postedAt = new Date().toISOString()

    return {
      success: true,
      postedAt,
      image: imagePath,
      descriptionPreview: description.slice(0, 120),
      buttonType,
      buttonUrl,
    }
  } catch (err) {
    // Best-effort debug screenshot — never let screenshot failure mask the
    // original error.
    let screenshotPath = null
    if (page) {
      try {
        screenshotPath = debugScreenshotPath()
        await page.screenshot({ path: screenshotPath, fullPage: true, timeout: 10000 })
      } catch (shotErr) {
        console.error('[gmb-poster] Failed to capture debug screenshot:', shotErr?.message)
        screenshotPath = null
      }
    }

    const code = err?.code || 'POST_FAILED'
    const wrapped = new Error(
      `GMB post failed (${code}): ${err?.message || String(err)}` +
        (screenshotPath ? ` [debug screenshot: ${screenshotPath}]` : '')
    )
    wrapped.code = code
    wrapped.cause = err
    wrapped.screenshotPath = screenshotPath
    throw wrapped
  } finally {
    try { if (context) await context.close() } catch {}
    try { if (browser) await browser.close() } catch {}
  }
}
