/**
 * Captures frames through a single page turn so the curl animation can be
 * reviewed as stills, plus an animated GIF of the turn.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SHOTS = path.join(ROOT, '.qa', 'flip');
const body = fs.readFileSync(path.join(ROOT, '.qa', 'preview-reader.html'), 'utf8');

const wrap = (b) =>
  '<!doctype html><html><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1"></head><body>' + b + '</body></html>';

const RUNS = [
  { name: 'desk', width: 1280, height: 820, mobile: false, start: 8 },
  { name: 'phone', width: 390, height: 844, mobile: true, start: 10 },
];

(async () => {
  fs.rmSync(SHOTS, { recursive: true, force: true });
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  for (const run of RUNS) {
    const ctx = await browser.newContext({
      viewport: { width: run.width, height: run.height },
      deviceScaleFactor: 1.5,
      isMobile: run.mobile,
      hasTouch: run.mobile,
    });
    const page = await ctx.newPage();
    await page.setContent(wrap(body), { waitUntil: 'load' });
    await page.waitForFunction('window.__pageCount > 0', { timeout: 60000 });
    await page.waitForTimeout(900);

    await page.evaluate((i) => window.__pf.turnToPage(i), run.start);
    await page.waitForTimeout(800);

    // Taking a screenshot blocks for longer than a frame, so the shipped 680ms
    // turn finishes before the second capture. Stretch it for the capture only;
    // the deployed setting is untouched.
    await page.evaluate(() => { window.__pf.getSettings().flippingTime = 5000; });
    await page.evaluate(() => window.__pf.flipNext());

    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(i === 0 ? 250 : 620);
      await page.screenshot({ path: path.join(SHOTS, `${run.name}-${String(i + 1).padStart(2, '0')}.png`) });
    }
    console.log(`${run.name}: 6 frames`);
    await ctx.close();
  }

  await browser.close();
})();
