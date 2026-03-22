import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { chromium, devices } from 'playwright'
import { buildReviewUrls } from './review-urls.js'

const captureDir = '/Users/wogbot/.openclaw/workspace/command-centre-app/public/review-captures'
const desktopViewport = { width: 1440, height: 1200 }
const mobileDevice = devices['iPhone 13']

async function ensureDir() {
  await mkdir(captureDir, { recursive: true })
}

function relUrl(fileName) {
  return `/review-captures/${fileName}`
}

async function capturePage(url, fileName, mode = 'desktop') {
  const browser = await chromium.launch({ headless: true })
  try {
    const context = mode === 'mobile'
      ? await browser.newContext({ ...mobileDevice })
      : await browser.newContext({ viewport: desktopViewport })
    const page = await context.newPage()
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 })
    const fullPath = path.join(captureDir, fileName)
    await page.screenshot({ path: fullPath, fullPage: true })
    await context.close()
    return relUrl(fileName)
  } finally {
    await browser.close()
  }
}

export async function captureReviewSet(pathname = '/') {
  await ensureDir()
  const urls = buildReviewUrls(pathname)
  const stamp = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`

  const results = {
    path: pathname,
    live: urls.live,
    preview: urls.preview,
    captures: {
      liveDesktop: await capturePage(urls.live, `${stamp}-live-desktop.png`, 'desktop'),
      previewDesktop: await capturePage(urls.preview, `${stamp}-preview-desktop.png`, 'desktop'),
      liveMobile: await capturePage(urls.live, `${stamp}-live-mobile.png`, 'mobile'),
      previewMobile: await capturePage(urls.preview, `${stamp}-preview-mobile.png`, 'mobile')
    }
  }

  return results
}
