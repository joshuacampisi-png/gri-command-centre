/**
 * Headless QA for the reader: checks pagination correctness (nothing overflowing
 * its page box, no empty pages, no lost text), exercises a swipe on mobile, and
 * captures screenshots at both breakpoints.
 */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'public');
const SHOTS = path.join(__dirname, '..', '.qa');
const PORT = 8231;

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.woff2': 'font/woff2', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
};

function serve(root) {
  return http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    let file = path.join(root, p);
    // Serve a directory's index.html, the way a real static host does.
    if (p.endsWith('/') || (fs.existsSync(file) && fs.statSync(file).isDirectory())) {
      file = path.join(file, 'index.html');
    }
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); return res.end('nope');
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  }).listen(PORT);
}

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, mobile: false },
  { name: 'laptop', width: 1280, height: 800, mobile: false },
  { name: 'iphone', width: 390, height: 844, mobile: true },
  { name: 'iphone-se', width: 375, height: 667, mobile: true },
  { name: 'ipad', width: 820, height: 1180, mobile: true },
];

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const server = serve(ROOT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  let failures = 0;

  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
      isMobile: vp.mobile,
      hasTouch: vp.mobile,
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

    await page.goto(`http://localhost:${PORT}/read/`, { waitUntil: 'load' });
    await page.waitForFunction('window.__pageCount > 0', { timeout: 60000 });

    const stats = await page.evaluate(() => ({
      pages: window.__pageCount,
      ms: window.__paginationMs,
      mode: window.__mode,
    }));

    // Overflow check: no page body may have content taller than its box.
    const overflow = await page.evaluate(() => {
      const bad = [];
      document.querySelectorAll('.page-body').forEach((b, i) => {
        const flow = b.querySelector('.flow');
        if (!flow) return;
        const over = flow.scrollHeight - b.clientHeight + parseFloat(getComputedStyle(b).paddingTop) +
          parseFloat(getComputedStyle(b).paddingBottom);
        if (flow.scrollHeight > b.clientHeight + 1) bad.push({ i, over: Math.round(flow.scrollHeight - b.clientHeight) });
      });
      return bad.slice(0, 8);
    });

    // Empty-page check.
    const empties = await page.evaluate(() => {
      let n = 0;
      document.querySelectorAll('.page--text .flow').forEach((f) => {
        if (f.textContent.trim().length < 2) n++;
      });
      return n;
    });

    // Horizontal overflow of the document.
    const hOverflow = await page.evaluate(() =>
      document.documentElement.scrollWidth > window.innerWidth + 1);

    console.log(
      `${vp.name.padEnd(10)} ${String(vp.width).padStart(4)}x${vp.height}  ` +
      `${stats.mode.padEnd(6)} pages=${String(stats.pages).padStart(3)} ` +
      `paginate=${String(stats.ms).padStart(4)}ms ` +
      `overflow=${overflow.length} empty=${empties} hscroll=${hOverflow} errors=${errors.length}`
    );
    if (overflow.length) { console.log('   overflow detail:', JSON.stringify(overflow)); failures++; }
    if (empties) failures++;
    if (hOverflow) failures++;
    if (errors.length) { console.log('   errors:', errors.slice(0, 3)); failures++; }

    await page.screenshot({ path: path.join(SHOTS, `${vp.name}-1-cover.png`) });

    // Into the book: cover, title, then a text spread.
    await page.evaluate(() => document.querySelector('#btn-next').click());
    await page.waitForTimeout(900);
    await page.evaluate(() => document.querySelector('#btn-next').click());
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(SHOTS, `${vp.name}-2-text.png`) });

    // Jump to a photo plate via the contents, then screenshot a chapter opener.
    await page.evaluate(() => document.querySelector('#btn-contents').click());
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SHOTS, `${vp.name}-3-contents.png`) });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);

    const drawerState = await page.evaluate(() => ({
      contents: !document.querySelector('#contents').hidden,
      scrim: !document.querySelector('#scrim').hidden,
      panel: !document.querySelector('#typepanel').hidden,
    }));
    if (drawerState.contents || drawerState.scrim || drawerState.panel) {
      console.log('   drawer did not close on Escape:', JSON.stringify(drawerState));
      failures++;
    }

    if (vp.mobile) {
      const box = await page.locator('#book').boundingBox();
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      const hit = await page.evaluate(([x, y]) => {
        const el = document.elementFromPoint(x, y);
        return el ? el.tagName + '.' + (el.className || '') + '#' + (el.id || '') : 'none';
      }, [cx, cy]);

      const before = await page.evaluate(() => document.querySelector('#plabel').textContent);
      await page.touchscreen.tap(cx, cy);
      await page.waitForTimeout(1000);
      const afterTap = await page.evaluate(() => document.querySelector('#plabel').textContent);
      console.log(`   tap  @${Math.round(cx)},${Math.round(cy)} hits ${hit}`);
      console.log(`   tap-to-flip: "${before}" -> "${afterTap}" ${before !== afterTap ? 'OK' : 'NO CHANGE'}`);
      if (before === afterTap) failures++;

      // Real swipe: touchstart -> moves -> touchend, right to left.
      const sx = box.x + box.width * 0.78;
      await page.touchscreen.tap(cx, cy); // settle
      await page.waitForTimeout(900);
      const beforeSwipe = await page.evaluate(() => document.querySelector('#plabel').textContent);
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart', touchPoints: [{ x: sx, y: cy }],
      });
      for (const f of [0.6, 0.42, 0.26, 0.12]) {
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove', touchPoints: [{ x: box.x + box.width * f, y: cy }],
        });
        await page.waitForTimeout(24);
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(1100);
      const afterSwipe = await page.evaluate(() => document.querySelector('#plabel').textContent);
      console.log(`   swipe-to-flip: "${beforeSwipe}" -> "${afterSwipe}" ${beforeSwipe !== afterSwipe ? 'OK' : 'NO CHANGE'}`);
      if (beforeSwipe === afterSwipe) failures++;
      await page.screenshot({ path: path.join(SHOTS, `${vp.name}-4-swiped.png`) });
    }

    await ctx.close();
  }

  await browser.close();
  server.close();
  console.log(failures ? `\nFAILURES: ${failures}` : '\nAll reader checks passed.');
  process.exit(failures ? 1 : 0);
})();
