#!/usr/bin/env node
import 'dotenv/config'
import { writeFileSync, existsSync } from 'fs'
import { chromium } from 'playwright'
import { dataFile, dataDir } from '../server/lib/data-dir.js'

// NO-COST recon of business.google.com/dashboard (Google Business Profile
// Manager). This is the authenticated owner-flow path and should NOT trigger
// the reCAPTCHA wall that has been blocking the google.com/search approach.
//
// Walks: dashboard -> location tile -> posts/updates tab -> add-post editor.
// At each step we dump screenshot + clickables + (later) inputs/textareas so
// we can build a real selector map without a single FAL call.

const PROFILE_DIR = dataDir('gmb-chrome-profile')
const DASHBOARD_URL = 'https://business.google.com/dashboard'

const CLICKABLE_DUMP_FN = () =>
  Array.from(document.querySelectorAll('button,[role="button"],a,[aria-label]'))
    .slice(0, 80)
    .map(el => ({
      tag: el.tagName,
      text: (el.innerText || '').trim().slice(0, 80),
      ariaLabel: el.getAttribute('aria-label')?.slice(0, 120) || null,
      role: el.getAttribute('role') || null,
      href: el.getAttribute('href')?.slice(0, 160) || null,
      cls: el.className?.toString().split(' ').slice(0, 3).join(' ') || null,
    }))
    .filter(x => x.text || x.ariaLabel)

const INPUT_DUMP_FN = () =>
  Array.from(document.querySelectorAll('input')).map(el => ({
    type: el.getAttribute('type') || null,
    name: el.getAttribute('name') || null,
    accept: el.getAttribute('accept') || null,
    ariaLabel: el.getAttribute('aria-label')?.slice(0, 140) || null,
    placeholder: el.getAttribute('placeholder') || null,
  }))

const TEXT_INPUT_DUMP_FN = () => {
  const ta = Array.from(document.querySelectorAll('textarea')).map(el => ({
    kind: 'textarea',
    ariaLabel: el.getAttribute('aria-label')?.slice(0, 140) || null,
    placeholder: el.getAttribute('placeholder') || null,
    name: el.getAttribute('name') || null,
  }))
  const ce = Array.from(document.querySelectorAll('[contenteditable="true"]')).map(el => ({
    kind: 'contenteditable',
    ariaLabel: el.getAttribute('aria-label')?.slice(0, 140) || null,
    placeholder: el.getAttribute('placeholder') || null,
    role: el.getAttribute('role') || null,
  }))
  return [...ta, ...ce]
}

function writeJson(path, data) {
  try {
    writeFileSync(path, JSON.stringify(data, null, 2))
    console.log(`  -> wrote ${path}`)
  } catch (e) {
    console.log(`  !! write failed ${path}: ${e.message}`)
  }
}

async function safeScreenshot(page, path, label) {
  try {
    await page.screenshot({ path, fullPage: false })
    console.log(`  -> screenshot ${path}`)
    return true
  } catch (e) {
    console.log(`  !! screenshot failed at ${label}: ${e.message}`)
    return false
  }
}

async function safeDumpClickables(page, path, label) {
  try {
    const data = await page.evaluate(CLICKABLE_DUMP_FN)
    writeJson(path, data)
  } catch (e) {
    console.log(`  !! clickables dump failed at ${label}: ${e.message}`)
  }
}

async function safeDumpInputs(page, path, label) {
  try {
    const data = await page.evaluate(INPUT_DUMP_FN)
    writeJson(path, data)
  } catch (e) {
    console.log(`  !! inputs dump failed at ${label}: ${e.message}`)
  }
}

async function safeDumpTextInputs(page, path, label) {
  try {
    const data = await page.evaluate(TEXT_INPUT_DUMP_FN)
    writeJson(path, data)
  } catch (e) {
    console.log(`  !! text-inputs dump failed at ${label}: ${e.message}`)
  }
}

async function tryClickByText(page, regex, label) {
  try {
    const handle = await page.evaluateHandle((pattern) => {
      const re = new RegExp(pattern, 'i')
      const nodes = Array.from(document.querySelectorAll('button,[role="button"],a,[aria-label]'))
      for (const el of nodes) {
        const text = (el.innerText || '').trim()
        const aria = el.getAttribute('aria-label') || ''
        if (re.test(text) || re.test(aria)) return el
      }
      return null
    }, regex.source)
    const el = handle.asElement()
    if (!el) {
      console.log(`  -- no match for ${label} (${regex})`)
      return false
    }
    await el.click()
    console.log(`  -> clicked ${label}`)
    return true
  } catch (e) {
    console.log(`  !! click failed for ${label}: ${e.message}`)
    return false
  }
}

async function detectCaptcha(page) {
  try {
    const result = await page.evaluate(() => {
      const html = document.documentElement.innerHTML
      const lower = html.toLowerCase()
      const hasRecaptcha = !!document.querySelector('iframe[src*="recaptcha"]')
      const hasCaptchaForm = !!document.querySelector('form[action*="sorry"]')
      const hasSorry = location.hostname.includes('sorry') || location.pathname.includes('sorry')
      const mentionsUnusual = lower.includes('unusual traffic') || lower.includes('not a robot')
      return {
        url: location.href,
        hasRecaptcha,
        hasCaptchaForm,
        hasSorry,
        mentionsUnusual,
        captcha: hasRecaptcha || hasCaptchaForm || hasSorry || mentionsUnusual,
      }
    })
    return result
  } catch (e) {
    return { error: e.message, captcha: false }
  }
}

async function main() {
  console.log(`[gmb-recon-dashboard] profile dir: ${PROFILE_DIR}`)
  console.log(`[gmb-recon-dashboard] launching chrome with saved auth...`)

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: 'chrome',
    headless: false,
    viewport: { width: 1400, height: 900 },
  })

  const page = context.pages()[0] || (await context.newPage())

  const captchaReport = { hitAtStep: null, details: null }

  try {
    // ── Step 1: dashboard ───────────────────────────────────────────────────
    console.log(`\n[step 1] navigate to ${DASHBOARD_URL}`)
    try {
      await page.goto(DASHBOARD_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
      console.log(`  -> at ${page.url()}`)
    } catch (e) {
      console.log(`  !! goto failed: ${e.message}`)
    }

    console.log(`[step 1] waiting 8s for dashboard to render...`)
    await page.waitForTimeout(8000)

    const c1 = await detectCaptcha(page)
    console.log(`  -> captcha check: ${JSON.stringify(c1)}`)
    if (c1.captcha && !captchaReport.hitAtStep) {
      captchaReport.hitAtStep = 1
      captchaReport.details = c1
    }

    await safeScreenshot(page, dataFile('gmb-recon-bp-01-dashboard.png'), 'step 1')
    await safeDumpClickables(page, dataFile('gmb-recon-bp-01-clickables.json'), 'step 1')

    // ── Step 2: click the location/listing tile ─────────────────────────────
    console.log(`\n[step 2] looking for location tile matching /Gender Reveal Ideas/i`)
    let clickedLocation = false
    try {
      const handle = await page.evaluateHandle(() => {
        const re = /gender reveal ideas/i
        // Try common tile shapes: links, buttons, role=button, generic divs
        const candidates = Array.from(document.querySelectorAll(
          'a, button, [role="button"], [role="link"], [data-business-name], .business-name, [aria-label]'
        ))
        for (const el of candidates) {
          const text = (el.innerText || '').trim()
          const aria = el.getAttribute('aria-label') || ''
          if (re.test(text) || re.test(aria)) return el
        }
        // Fallback: any element whose text starts with the name
        const all = Array.from(document.querySelectorAll('*'))
        for (const el of all) {
          if (el.children.length > 4) continue // skip containers
          const text = (el.innerText || '').trim()
          if (re.test(text) && text.length < 200) return el
        }
        return null
      })
      const el = handle.asElement()
      if (el) {
        await el.click()
        clickedLocation = true
        console.log(`  -> clicked location tile`)
      } else {
        console.log(`  -- no /Gender Reveal Ideas/i tile found; falling back to first listing`)
        // Try clicking the first business-like card
        const fallback = await tryClickByText(page, /view profile|manage|reveal|gold coast/i, 'fallback listing')
        clickedLocation = fallback
      }
    } catch (e) {
      console.log(`  !! location tile click failed: ${e.message}`)
    }

    await page.waitForTimeout(5000)

    const c2 = await detectCaptcha(page)
    if (c2.captcha && !captchaReport.hitAtStep) {
      captchaReport.hitAtStep = 2
      captchaReport.details = c2
    }

    await safeScreenshot(page, dataFile('gmb-recon-bp-02-after-location-click.png'), 'step 2')
    await safeDumpClickables(page, dataFile('gmb-recon-bp-02-clickables.json'), 'step 2')

    // ── Step 3: click posts/updates tab ─────────────────────────────────────
    console.log(`\n[step 3] looking for posts/updates tab`)
    const clickedPostsTab = await tryClickByText(page, /^(posts?|updates?)$|posts|updates/i, 'posts/updates tab')
    await page.waitForTimeout(5000)

    const c3 = await detectCaptcha(page)
    if (c3.captcha && !captchaReport.hitAtStep) {
      captchaReport.hitAtStep = 3
      captchaReport.details = c3
    }

    await safeScreenshot(page, dataFile('gmb-recon-bp-03-after-posts-click.png'), 'step 3')
    await safeDumpClickables(page, dataFile('gmb-recon-bp-03-clickables.json'), 'step 3')
    await safeDumpInputs(page, dataFile('gmb-recon-bp-03-inputs.json'), 'step 3')
    await safeDumpTextInputs(page, dataFile('gmb-recon-bp-03-text-inputs.json'), 'step 3')

    // ── Step 4: click "Add post" / "Create post" / "+" ──────────────────────
    console.log(`\n[step 4] looking for add-post / create-post / + button`)
    let clickedAddPost = await tryClickByText(
      page,
      /add\s*(a\s*)?post|create\s*post|new\s*post|\+\s*post/i,
      'add-post button'
    )
    if (!clickedAddPost) {
      // Try a bare "+" floating action button (FAB)
      clickedAddPost = await tryClickByText(page, /^\+$|add$/i, 'plus / add fallback')
    }
    await page.waitForTimeout(5000)

    const c4 = await detectCaptcha(page)
    if (c4.captcha && !captchaReport.hitAtStep) {
      captchaReport.hitAtStep = 4
      captchaReport.details = c4
    }

    await safeScreenshot(page, dataFile('gmb-recon-bp-04-add-post-editor.png'), 'step 4')
    await safeDumpClickables(page, dataFile('gmb-recon-bp-04-clickables.json'), 'step 4')
    await safeDumpInputs(page, dataFile('gmb-recon-bp-04-inputs.json'), 'step 4')
    await safeDumpTextInputs(page, dataFile('gmb-recon-bp-04-text-inputs.json'), 'step 4')

    console.log(`\n[gmb-recon-dashboard] done`)
    console.log(`  captcha hit? ${captchaReport.hitAtStep ? `YES at step ${captchaReport.hitAtStep}` : 'no'}`)
    console.log(`  clickedLocation: ${clickedLocation}`)
    console.log(`  clickedPostsTab: ${clickedPostsTab}`)
    console.log(`  clickedAddPost:  ${clickedAddPost}`)
  } catch (e) {
    console.error(`[gmb-recon-dashboard] top-level error: ${e.message}`)
    try {
      await safeScreenshot(page, dataFile('gmb-recon-bp-error-final.png'), 'error-final')
      await safeDumpClickables(page, dataFile('gmb-recon-bp-error-final-clickables.json'), 'error-final')
      await safeDumpInputs(page, dataFile('gmb-recon-bp-error-final-inputs.json'), 'error-final')
      await safeDumpTextInputs(page, dataFile('gmb-recon-bp-error-final-text-inputs.json'), 'error-final')
    } catch {}
  } finally {
    // write the captcha report at the end no matter what
    try {
      writeJson(dataFile('gmb-recon-bp-captcha-report.json'), captchaReport)
    } catch {}
    try { await context.close() } catch {}
  }

  process.exit(0)
}

main().catch(e => {
  console.error('[gmb-recon-dashboard] fatal:', e)
  process.exit(0)
})
