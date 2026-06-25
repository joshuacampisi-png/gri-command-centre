#!/usr/bin/env node
import 'dotenv/config'
import { writeFileSync } from 'fs'
import { chromium } from 'playwright'
import { dataFile, dataDir } from '../server/lib/data-dir.js'

// NO-COST GMB posting flow recon: walks the saved Playwright auth through
// each step of the post flow and dumps the live DOM (clickables, inputs,
// textareas) so we can build a real selector map. No FAL. No Claude. Just
// eyeballs + JSON.

const QUERY = 'Gender Reveal Ideas - Gender Reveal Store Gold Coast'
const PROFILE_DIR = dataDir('gmb-chrome-profile')

const CLICKABLE_DUMP_FN = () =>
  Array.from(document.querySelectorAll('button,[role="button"],a,[aria-label]'))
    .slice(0, 80)
    .map(el => ({
      tag: el.tagName,
      text: (el.innerText || '').trim().slice(0, 60),
      ariaLabel: el.getAttribute('aria-label')?.slice(0, 80) || null,
      role: el.getAttribute('role') || null,
      cls: el.className?.toString().split(' ').slice(0, 2).join(' ') || null,
    }))
    .filter(x => x.text || x.ariaLabel)

const INPUT_DUMP_FN = () =>
  Array.from(document.querySelectorAll('input')).map(el => ({
    type: el.getAttribute('type') || null,
    name: el.getAttribute('name') || null,
    ariaLabel: el.getAttribute('aria-label')?.slice(0, 120) || null,
    accept: el.getAttribute('accept') || null,
    placeholder: el.getAttribute('placeholder') || null,
  }))

const TEXT_INPUT_DUMP_FN = () => {
  const ta = Array.from(document.querySelectorAll('textarea')).map(el => ({
    kind: 'textarea',
    ariaLabel: el.getAttribute('aria-label')?.slice(0, 120) || null,
    placeholder: el.getAttribute('placeholder') || null,
    name: el.getAttribute('name') || null,
  }))
  const ce = Array.from(document.querySelectorAll('[contenteditable="true"]')).map(el => ({
    kind: 'contenteditable',
    ariaLabel: el.getAttribute('aria-label')?.slice(0, 120) || null,
    placeholder: el.getAttribute('placeholder') || null,
    role: el.getAttribute('role') || null,
  }))
  return [...ta, ...ce]
}

function writeJson(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2))
  console.log(`  -> wrote ${path}`)
}

async function safeDump(page, label, screenshotPath, clickablesPath, extras = {}) {
  try {
    await page.screenshot({ path: screenshotPath, fullPage: false })
    console.log(`  -> screenshot ${screenshotPath}`)
  } catch (e) {
    console.log(`  !! screenshot failed at ${label}: ${e.message}`)
  }
  try {
    const clickables = await page.evaluate(CLICKABLE_DUMP_FN)
    writeJson(clickablesPath, clickables)
  } catch (e) {
    console.log(`  !! clickables dump failed at ${label}: ${e.message}`)
  }
  if (extras.inputsPath) {
    try {
      const inputs = await page.evaluate(INPUT_DUMP_FN)
      writeJson(extras.inputsPath, inputs)
    } catch (e) {
      console.log(`  !! inputs dump failed at ${label}: ${e.message}`)
    }
  }
  if (extras.textInputsPath) {
    try {
      const textInputs = await page.evaluate(TEXT_INPUT_DUMP_FN)
      writeJson(extras.textInputsPath, textInputs)
    } catch (e) {
      console.log(`  !! text-inputs dump failed at ${label}: ${e.message}`)
    }
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

async function main() {
  console.log(`[gmb-recon] profile dir: ${PROFILE_DIR}`)
  console.log(`[gmb-recon] launching chromium with saved auth...`)

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: 'chrome',
    headless: false,
    viewport: { width: 1400, height: 900 },
  })

  const page = context.pages()[0] || (await context.newPage())

  try {
    // ── Step 1: Google search for the GBP query ───────────────────────────
    console.log(`\n[step 1] navigate to Google search for "${QUERY}"`)
    const url = `https://www.google.com/search?q=${encodeURIComponent(QUERY)}`
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    console.log(`  -> at ${page.url()}`)

    console.log(`[step 1] waiting 5s for owner panel to render...`)
    await page.waitForTimeout(5000)

    await safeDump(
      page,
      'step 1',
      dataFile('gmb-recon-01-search.png'),
      dataFile('gmb-recon-01-clickables.json'),
    )

    // ── Step 2: click whatever opens posts in the owner panel ─────────────
    console.log(`\n[step 2] looking for posts/updates trigger in owner panel`)
    await tryClickByText(page, /post|update/i, 'posts/updates trigger')
    await page.waitForTimeout(3000)

    await safeDump(
      page,
      'step 2',
      dataFile('gmb-recon-02-after-posts-click.png'),
      dataFile('gmb-recon-02-clickables.json'),
    )

    // ── Step 3: click "Add a post" / "Add post" tile if present ───────────
    console.log(`\n[step 3] looking for "Add a post" / "Add post" tile`)
    await tryClickByText(page, /add\s*(a\s*)?post/i, 'add-post tile')
    await page.waitForTimeout(3000)

    await safeDump(
      page,
      'step 3',
      dataFile('gmb-recon-03-after-add-post.png'),
      dataFile('gmb-recon-03-clickables.json'),
      {
        inputsPath: dataFile('gmb-recon-03-inputs.json'),
        textInputsPath: dataFile('gmb-recon-03-text-inputs.json'),
      },
    )

    console.log(`\n[gmb-recon] done — closing browser`)
  } catch (e) {
    console.error(`[gmb-recon] top-level error: ${e.message}`)
    // best-effort final dump so we can see where we stalled
    try {
      await safeDump(
        page,
        'error-final',
        dataFile('gmb-recon-error-final.png'),
        dataFile('gmb-recon-error-final-clickables.json'),
        {
          inputsPath: dataFile('gmb-recon-error-final-inputs.json'),
          textInputsPath: dataFile('gmb-recon-error-final-text-inputs.json'),
        },
      )
    } catch {}
  } finally {
    try { await context.close() } catch {}
  }

  process.exit(0)
}

main().catch(e => {
  console.error('[gmb-recon] fatal:', e)
  process.exit(0) // still exit 0 per spec — we want artifacts not failure codes
})
