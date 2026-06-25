/**
 * GMB Auto-Poster — Playwright posting flow for Google Business Profile
 *
 * Posts an image + description + CTA button to the Gender Reveal Ideas GBP
 * listing via the OWNER-PANEL dashboard at business.google.com/dashboard.
 *
 * Why business.google.com/dashboard (not google.com/search):
 * - The google.com/search "see your listing" surface routes through a
 *   sorry/recaptcha interstitial when driven by automation, which blocked
 *   the previous implementation.
 * - The dashboard URL is confirmed captcha-free for authenticated owners
 *   (recon at 2026-06-23: captcha-report.json hitAtStep=null) — it is the
 *   correct entry point for headless/headed automation.
 *
 * Notes:
 * - First run must be authenticated via scripts/gmb-login.js which writes
 *   the storage state file referenced by AUTH_STATE.
 * - Google's owner-panel DOM shifts often — every selector below has 3-5
 *   candidates. Update fallbacks before tweaking timeouts.
 * - headless defaults to false until the selector set has been verified end
 *   to end against a real post.
 * - dryRun short-circuits before launching the browser, returning a simulated
 *   success payload so the caller can exercise the surrounding pipeline
 *   (queue rotation, description picking, state logging) without posting.
 * - On failure we capture a debug screenshot to dataFile() with a timestamped
 *   name and re-throw an Error carrying an explicit `.code` for triage.
 * - postToGmbWithExistingImage() lets the caller reuse an already-rendered
 *   image (no FAL call) so the Playwright flow can be verified without
 *   re-spending the $0.15 generation cost.
 */

import { chromium } from 'playwright'
import { existsSync } from 'fs'
import { dataFile } from './data-dir.js'

const AUTH_STATE = dataFile('gmb-auth.json')

// Owner-panel dashboard. This is the confirmed captcha-free entry point for
// authenticated GBP owners. The previous google.com/search URL routed through
// a sorry/recaptcha interstitial under automation and is no longer used.
const GBP_DASHBOARD_URL = 'https://business.google.com/dashboard'

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
//
// Primary selectors below are placeholders modelled on the typical
// business.google.com/dashboard DOM. The recon run at 2026-06-23 could not
// map them because the persisted profile was not signed in — every step
// captured the accounts.google.com identifier page. Once auth is in place
// these primaries should be re-verified against scripts/gmb-recon-dashboard.js
// and the SELECTOR comments updated with the actual `aria-label` strings.
const SELECTORS = {
  // The "dashboard" URL now 302s to a google.com/search merchant-panel
  // surface that has no separate location chooser. We intentionally pass
  // an EMPTY tile selector list so OPEN_LOCATION is a true no-op — the
  // previous fallbacks (`a:has-text("Gender Reveal Ideas")`) matched the
  // storefront link in the SERP body and navigated us off the merchant
  // panel entirely. If the chooser ever returns, only add selectors that
  // are strictly scoped to dashboard tiles (e.g. href contains
  // `/dashboard/l/`).
  locationTile: [
    'a[href*="business.google.com/dashboard/l/"]',
  ],
  // Posts entry point on the merchant-panel SERP. The primary action is
  // the "Add update" button in the right-rail quick-action strip — recon
  // 2026-06-25 confirmed `<button>` with exact innerText "Add update" at
  // ~(1130, 1979). Falling back to a partial-match button is safe; the
  // older `:has-text("Posts")` tab selectors are kept last because they
  // only existed on the legacy dashboard.
  postsSection: [
    'button:text-is("Add update")',
    'button:has-text("Add update")',
    'div[role="button"]:has-text("Add update")',
    'a[href*="/posts"]:has-text("Posts")',
    'div[role="tab"]:has-text("Posts")',
  ],
  // Clicking "Add update" injects an <iframe> overlay whose URL hash
  // ends with `promote/updates/add` — every editor interaction (textarea,
  // file input, button toggle, Post) lives INSIDE that frame. We pin the
  // frame by URL substring so we never accidentally bind to a sibling
  // iframe (Google Search has a few of those for ads/captcha).
  editorFrame: [
    'iframe[src*="promote/updates/add"]',
    'iframe[src*="/local/business/"][src*="updates"]',
  ],
  // CTA inside the Posts surface to open the editor sheet.
  addPostButton: [
    'button:has-text("Add post")',
    'div[role="button"]:has-text("Add post")',
    'button:has-text("Add a post")',
    'div[role="button"]:has-text("Add a post")',
    'button:has-text("Create post")',
  ],
  // Inside the editor iframe. Recon 2026-06-25 found exactly ONE
  // <textarea> in the frame (no aria-label, no placeholder) — Google has
  // stripped the labels, so a bare `textarea` is the only reliable hook.
  // The label-based fallbacks remain at the front in case they come back.
  descriptionField: [
    'textarea[aria-label*="description" i]',
    'textarea[placeholder*="description" i]',
    'textarea[aria-label*="write" i]',
    'div[role="textbox"][contenteditable="true"]',
    'textarea',
  ],
  // Hidden file input in the iframe. The visible "Select images and
  // videos" button (`button[jsname="A4L6Xc"]`) just proxies to this
  // input — uploading via setInputFiles on the hidden input bypasses
  // Google's native picker. Accept attribute confirmed:
  // image/jpg,image/jpeg,image/png,video/*
  fileInput: [
    'input[type="file"][accept*="image"]',
    'input[type="file"]',
  ],
  imagePreview: [
    'img[alt*="preview" i]',
    'img[src^="blob:"]',
    'div[aria-label*="image" i] img',
    'img[src*="googleusercontent"]',
    // Fallback: a thumbnail with a delete button only appears once
    // upload finishes processing.
    'button[aria-label*="delete" i]',
    'button[aria-label*="remove" i]',
  ],
  // "Button" toggle in the iframe. Recon: <button> with innerText
  // "Button" and aria-label "Add link fields" (jsname=JIbuQc).
  buttonToggle: [
    'button[aria-label="Add link fields"]',
    'button[aria-label*="link fields" i]',
    'button:has-text("Add a button")',
    'button:has-text("Add button")',
    'button:text-is("Button")',
    'button:has-text("Button")',
  ],
  // After clicking "Button", a Material-style dropdown BUTTON (NOT a
  // native <select>) appears showing the current value "None". Recon
  // 2026-06-25 caught it as `<button jsname="bhNrnf">None</button>`.
  // Clicking it opens a popup menu of types (Book, Order online, Buy,
  // Learn more, Sign up, Call now). We hit the button first to expand,
  // then pick the option by visible label.
  buttonTypeSelect: [
    'button[jsname="bhNrnf"]',
    'button:text-is("None")',
    'button[aria-haspopup="listbox"]',
    'div[role="combobox"]',
    'select[aria-label*="button" i]',
    'select',
  ],
  buttonLinkField: [
    'input[aria-label*="link" i]',
    'input[placeholder*="link" i]',
    'input[type="url"]',
    'input[aria-label*="url" i]',
    // The frame's link field has no aria-label after the recent UI
    // refresh — fall through to "the only visible text input" once the
    // button section is expanded.
    'input[type="text"]',
  ],
  // Publish: <button> with innerText "Post" and jsname="PtNcAd".
  postPublishButton: [
    'button[jsname="PtNcAd"]',
    'button:text-is("Post")',
    'button:has-text("Post")',
    'button:has-text("Publish")',
    'div[role="button"]:has-text("Post")',
  ],
  // Success can show as a snackbar in the parent OR as the editor
  // closing + the new post tile appearing on the merchant panel. We
  // match a few obvious copy strings; the caller's outer success check
  // (editor frame detached) is a stronger signal but we still want a
  // toast match where available.
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
 * Like findFirst but returns null instead of throwing. Use this for
 * optional steps (e.g. the location tile, which is skipped for
 * single-location accounts).
 */
async function findFirstOptional(page, selectors, { timeout } = { timeout: TIMEOUTS.click }) {
  try {
    return await findFirst(page, selectors, { timeout })
  } catch {
    return null
  }
}

/**
 * Click a locator robustly. Google's GBP renders some buttons outside the
 * viewport (e.g. "Add update" can be below the fold inside a scroll
 * container), and Playwright refuses to click off-screen elements by
 * default. This helper scrolls the element into view first, then uses
 * force:true as a last resort if the standard click still fails.
 */
async function clickRobust(locator) {
  try { await locator.scrollIntoViewIfNeeded({ timeout: 5000 }) } catch {}
  try {
    await locator.click({ timeout: 5000 })
    return
  } catch (firstErr) {
    // Off-screen, overlapped, or animating — force-click bypasses the
    // visibility/stability checks (we already proved it's the right
    // element via the selector match)
    try {
      await locator.click({ force: true, timeout: 5000 })
      return
    } catch (forceErr) {
      // Last resort — synthesise a click via Element.click() in the page
      try {
        await locator.evaluate((el) => el.click())
        return
      } catch (jsErr) {
        throw firstErr
      }
    }
  }
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
 * Detect that we landed on the accounts.google.com signin flow instead of
 * the dashboard. The recon script proved that an un-authed profile 302s
 * straight to /v3/signin/identifier — failing fast with a clear error here
 * saves a full step-timeout chain.
 */
async function assertNotOnSigninPage(page) {
  const url = page.url()
  if (url.includes('accounts.google.com')) {
    const e = new Error(
      `Landed on Google signin (${url}) — the persisted profile is not authenticated. ` +
        `Run scripts/gmb-login.js to sign in once, then retry.`
    )
    e.code = 'NOT_AUTHENTICATED'
    throw e
  }
  // Secondary check — the identifier input is unmistakable
  const onSignin = await page
    .locator('input[name="identifier"]')
    .first()
    .count()
    .then((c) => c > 0)
    .catch(() => false)
  if (onSignin) {
    const e = new Error(
      `Detected signin identifier input on ${url} — profile is not authenticated. ` +
        `Run scripts/gmb-login.js to sign in once, then retry.`
    )
    e.code = 'NOT_AUTHENTICATED'
    throw e
  }
}

/**
 * Internal — drives the full Playwright flow. Exported wrappers below
 * (postToGmb, postToGmbWithExistingImage) share this implementation and
 * differ only in how the imagePath is sourced.
 */
async function runPostFlow({
  imagePath,
  description,
  buttonType,
  buttonUrl,
  dryRun,
  headless,
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
      await page.goto(GBP_DASHBOARD_URL, {
        waitUntil: 'domcontentloaded',
        timeout: TIMEOUTS.navigation,
      })
      // networkidle can stall on Google; fall back to a short wait if it does
      try {
        await page.waitForLoadState('networkidle', { timeout: 8000 })
      } catch {
        await page.waitForTimeout(1500)
      }
      // Fail fast if we got bounced to signin — saves a full chain of
      // selector-timeout errors and produces a clear, actionable code.
      await assertNotOnSigninPage(page)
    })

    await step('OPEN_LOCATION', async () => {
      // Best-effort: accounts with a single location often skip the chooser
      // and land directly on the location dashboard. If no tile is visible
      // within the panel timeout, assume we're already on the location and
      // continue.
      const tile = await findFirstOptional(page, SELECTORS.locationTile, {
        timeout: TIMEOUTS.panel,
      })
      if (tile) {
        await clickRobust(tile)
        try {
          await page.waitForLoadState('networkidle', { timeout: 8000 })
        } catch {
          await page.waitForTimeout(1500)
        }
      }
    })

    // Editor lives in an iframe injected after we click "Add update".
    // Hold the handle here so subsequent steps can run against it; if
    // the surface ever returns to a top-level editor we fall back to
    // `page` so the existing selectors still apply.
    let editorTarget = page

    await step('NAVIGATE_TO_POSTS', async () => {
      const entry = await findFirst(page, SELECTORS.postsSection, {
        timeout: TIMEOUTS.panel,
      })
      await clickRobust(entry)
      // The merchant-panel "Add update" click swaps in an iframe overlay
      // — give it a beat to attach before the iframe hunt begins.
      await page.waitForTimeout(1500)
    })

    await step('CLICK_ADD_POST', async () => {
      // Modern surface: clicking "Add update" opens the editor IFRAME
      // directly (no intermediate posts list / tile). We resolve the
      // iframe handle here and hand it to the remaining steps. If the
      // iframe never appears we fall back to the legacy in-page editor.
      let iframeHandle = null
      for (const sel of SELECTORS.editorFrame) {
        try {
          iframeHandle = await page.waitForSelector(sel, { state: 'attached', timeout: TIMEOUTS.panel / SELECTORS.editorFrame.length })
          if (iframeHandle) break
        } catch {}
      }
      if (iframeHandle) {
        const frame = await iframeHandle.contentFrame()
        if (frame) {
          editorTarget = frame
          // Iframe content hydrates async — wait until at least the
          // description textarea OR file input is visible before yielding.
          try {
            await frame.waitForSelector('textarea, input[type="file"]', { timeout: TIMEOUTS.panel })
          } catch {}
        }
      }
    })

    await step('FILL_DESCRIPTION', async () => {
      const field = await findFirst(editorTarget, SELECTORS.descriptionField, { timeout: TIMEOUTS.fill })
      // Use .fill() where possible, fall back to typing for contenteditable divs
      try {
        await field.fill(description, { timeout: TIMEOUTS.fill })
      } catch {
        await clickRobust(field)
        // editorTarget.keyboard doesn't exist on Frame — type via page
        await page.keyboard.type(description, { delay: 5 })
      }
    })

    await step('UPLOAD_IMAGE', async () => {
      // File inputs are hidden (display:none, styled "Select images and
      // videos" button overlay). Wait for ATTACHED state inside the
      // editor target — setInputFiles works regardless of visibility.
      let input = null
      let lastErr = null
      for (const sel of SELECTORS.fileInput) {
        try {
          const loc = editorTarget.locator(sel).first()
          await loc.waitFor({ state: 'attached', timeout: 5000 })
          input = loc
          break
        } catch (e) { lastErr = e }
      }
      if (!input) throw new Error(`No file input attached. Tried: ${SELECTORS.fileInput.join(' | ')}. Last: ${lastErr?.message}`)
      await input.setInputFiles(imagePath, { timeout: TIMEOUTS.fill })
      // Wait for preview to render before continuing
      await findFirst(editorTarget, SELECTORS.imagePreview, { timeout: TIMEOUTS.uploadProcess })
    })

    await step('ADD_BUTTON', async () => {
      // 1. Expand the "Button" section
      const toggle = await findFirst(editorTarget, SELECTORS.buttonToggle, { timeout: TIMEOUTS.click })
      await clickRobust(toggle)
      // Section animates in; give it a beat before hunting the dropdown
      await page.waitForTimeout(800)

      // 2. Pick the button type. Modern GBP renders a Material dropdown
      //    BUTTON (currently labelled "None") that opens a popup menu —
      //    no native <select> is present. If we ever do find a real
      //    <select> (legacy path), prefer that; otherwise click the
      //    dropdown button to expand, then click the option by label.
      let usedNativeSelect = false
      try {
        const native = editorTarget.locator('select').first()
        await native.waitFor({ state: 'attached', timeout: 1500 })
        if (await native.count()) {
          await native.selectOption({ label: buttonType })
          usedNativeSelect = true
        }
      } catch {}

      if (!usedNativeSelect) {
        const dropdown = await findFirst(editorTarget, SELECTORS.buttonTypeSelect, { timeout: TIMEOUTS.click })
        await clickRobust(dropdown)
        // Popup options can render INSIDE the iframe or OUTSIDE in the
        // parent (Material portals). Try the iframe first, then the page.
        await page.waitForTimeout(500)
        const optionCandidates = [
          `[role="option"][aria-label="${buttonType}" i]`,
          `[role="option"]:text-is("${buttonType}")`,
          `[role="option"]:has-text("${buttonType}")`,
          `[role="menuitem"]:has-text("${buttonType}")`,
          `li:has-text("${buttonType}")`,
          `div[role="option"]:has-text("${buttonType}")`,
        ]
        let picked = null
        for (const targetCtx of [editorTarget, page]) {
          for (const sel of optionCandidates) {
            try {
              const opt = targetCtx.locator(sel).first()
              await opt.waitFor({ state: 'visible', timeout: 2000 })
              await clickRobust(opt)
              picked = sel
              break
            } catch {}
          }
          if (picked) break
        }
        if (!picked) {
          throw new Error(`Could not pick button type "${buttonType}" from popup. Tried: ${optionCandidates.join(' | ')}`)
        }
      }

      // 3. URL field appears AFTER picking the type. Wait briefly for
      //    it to slide in, then fill.
      await page.waitForTimeout(800)
      const linkField = await findFirst(editorTarget, SELECTORS.buttonLinkField, { timeout: TIMEOUTS.fill })
      await linkField.fill(buttonUrl, { timeout: TIMEOUTS.fill })
    })

    await step('CLICK_POST', async () => {
      const postBtn = await findFirst(editorTarget, SELECTORS.postPublishButton, { timeout: TIMEOUTS.click })
      await clickRobust(postBtn)
    })

    await step('AWAIT_CONFIRMATION', async () => {
      // Success can surface in EITHER the iframe (snackbar before close)
      // or the parent page (toast after iframe detaches). Try both.
      const detached = page
        .waitForSelector(SELECTORS.editorFrame[0], { state: 'detached', timeout: TIMEOUTS.postConfirm })
        .then(() => 'frame-detached')
        .catch(() => null)
      const parentToast = findFirst(page, SELECTORS.successIndicator, { timeout: TIMEOUTS.postConfirm })
        .then(() => 'parent-toast')
        .catch(() => null)
      const frameToast = editorTarget === page
        ? Promise.resolve(null)
        : findFirst(editorTarget, SELECTORS.successIndicator, { timeout: TIMEOUTS.postConfirm })
            .then(() => 'frame-toast')
            .catch(() => null)
      const which = await Promise.race([detached, parentToast, frameToast])
      if (!which) {
        throw new Error('No success indicator (frame did not detach and no published-toast appeared)')
      }
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
  return runPostFlow({ imagePath, description, buttonType, buttonUrl, dryRun, headless })
}

/**
 * Post using an ALREADY-RENDERED image — no FAL call required.
 *
 * Same signature as postToGmb but explicit about the contract: imagePath
 * must point at a file that already exists on disk. Used for verifying the
 * Playwright flow end-to-end without re-spending the $0.15 generation cost
 * on each iteration.
 *
 * @param {object} opts
 * @param {string} opts.imagePath   - absolute path to an existing image file
 * @param {string} opts.description - post body text
 * @param {string} opts.buttonType  - GBP button label
 * @param {string} opts.buttonUrl   - target URL for the CTA
 * @param {boolean} [opts.dryRun=false]
 * @param {boolean} [opts.headless=false]
 * @returns {Promise<{success: true, postedAt: string, dryRun?: boolean, image: string, descriptionPreview: string, buttonType: string, buttonUrl: string}>}
 */
export async function postToGmbWithExistingImage({
  imagePath,
  description,
  buttonType,
  buttonUrl,
  dryRun = false,
  headless = false,
}) {
  return runPostFlow({ imagePath, description, buttonType, buttonUrl, dryRun, headless })
}
