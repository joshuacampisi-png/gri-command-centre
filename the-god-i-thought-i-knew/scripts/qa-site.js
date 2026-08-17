/**
 * Headless QA for the launch page: console errors, horizontal overflow, tap-target
 * sizes, CTA wiring, price consistency, heading order, alt text, and screenshots
 * of every section at each breakpoint.
 */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'public');
const SHOTS = path.join(__dirname, '..', '.qa', 'site');
const PORT = 8241;

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.woff2': 'font/woff2', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.webmanifest': 'application/manifest+json',
  '.xml': 'application/xml', '.txt': 'text/plain',
};

function serve(root) {
  return http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const file = path.join(root, p);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); return res.end('not found');
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  }).listen(PORT);
}

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, mobile: false },
  { name: 'laptop', width: 1280, height: 800, mobile: false },
  { name: 'tablet', width: 820, height: 1180, mobile: true },
  { name: 'iphone', width: 390, height: 844, mobile: true },
  { name: 'small', width: 360, height: 740, mobile: true },
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
    const failedReqs = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('requestfailed', (r) => failedReqs.push(r.url()));
    page.on('response', (r) => { if (r.status() >= 400) failedReqs.push(r.status() + ' ' + r.url()); });

    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });

    // Scroll the whole page so every reveal fires and every lazy image loads.
    await page.evaluate(async () => {
      // The page sets scroll-behavior:smooth for anchor links, which would make
      // these jumps animate and never actually reach the lower sections.
      const step = window.innerHeight * 0.6;
      for (let y = 0; y < document.body.scrollHeight; y += step) {
        window.scrollTo({ top: y, behavior: 'instant' });
        await new Promise((r) => setTimeout(r, 120));
      }
      await new Promise((r) => setTimeout(r, 1100));
      window.scrollTo({ top: 0, behavior: 'instant' });
      await new Promise((r) => setTimeout(r, 300));
    });

    const audit = await page.evaluate(() => {
      const out = {};
      out.hScroll = document.documentElement.scrollWidth > window.innerWidth + 1;
      out.widest = null;
      if (out.hScroll) {
        let worst = 0, el = null;
        document.querySelectorAll('*').forEach((n) => {
          const r = n.getBoundingClientRect();
          if (r.right > worst) { worst = r.right; el = n; }
        });
        out.widest = (el ? el.tagName + '.' + el.className : '?') + ' right=' + Math.round(worst);
      }
      out.imgsNoAlt = [...document.querySelectorAll('img')].filter((i) => !i.getAttribute('alt')).length;
      out.imgsBroken = [...document.querySelectorAll('img')].filter((i) => i.complete && i.naturalWidth === 0).length;
      out.headings = [...document.querySelectorAll('h1,h2,h3')].map((h) => h.tagName);
      out.h1 = document.querySelectorAll('h1').length;
      out.ctas = document.querySelectorAll('.js-buy').length;
      out.prices = [...document.querySelectorAll('.price')].map((p) => p.textContent.trim());
      const hid = [...document.querySelectorAll('.reveal, .rise')].filter(
        (e) => getComputedStyle(e).opacity === '0'
      );
      out.hidden = hid.length;
      out.hiddenWho = hid.map((e) => {
        const r = e.getBoundingClientRect();
        return (e.tagName + '.' + e.className).slice(0, 40) + ' h=' + Math.round(r.height);
      }).slice(0, 6);
      // Tap targets on touch layouts.
      out.smallTargets = [...document.querySelectorAll('button, a')]
        .filter((b) => {
          const r = b.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && (r.height < 40 || r.width < 40);
        })
        .map((b) => (b.className || b.tagName) + ' ' + Math.round(b.getBoundingClientRect().height))
        .slice(0, 5);
      out.heroFallback = document.getElementById('hero-img').dataset.fallback === 'true';
      return out;
    });

    const headingOrderOk = audit.h1 === 1;
    const pricesOk = audit.prices.every((p) => p === '$12.95');

    console.log(
      `${vp.name.padEnd(8)} ${String(vp.width).padStart(4)}x${vp.height}  ` +
      `hscroll=${audit.hScroll} broken=${audit.imgsBroken} noalt=${audit.imgsNoAlt} ` +
      `h1=${audit.h1} ctas=${audit.ctas} prices=${pricesOk ? 'ok' : audit.prices.join('|')} ` +
      `unrevealed=${audit.hidden} err=${errors.length} netfail=${failedReqs.length}`
    );
    if (audit.hScroll) { console.log('   widest:', audit.widest); failures++; }
    if (audit.imgsBroken || audit.imgsNoAlt) failures++;
    if (!headingOrderOk || !pricesOk) failures++;
    if (audit.hidden) { console.log('   unrevealed:', audit.hiddenWho.join(' | ')); failures++; }
    if (errors.length) { console.log('   errors:', errors.slice(0, 3)); failures++; }
    if (failedReqs.length) { console.log('   net:', failedReqs.slice(0, 3)); failures++; }
    if (vp.mobile && audit.smallTargets.length) {
      console.log('   small tap targets:', audit.smallTargets.join(', '));
    }

    // CTA opens the checkout modal, Escape closes it.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(250);
    await page.evaluate(() => document.querySelector('.hero .js-buy').click());
    await page.waitForTimeout(350);
    const modalOpen = await page.evaluate(() => !document.getElementById('checkout').hidden);
    await page.screenshot({ path: path.join(SHOTS, `${vp.name}-modal.png`) });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    const modalClosed = await page.evaluate(() => document.getElementById('checkout').hidden);
    if (!modalOpen || !modalClosed) {
      console.log(`   checkout modal open=${modalOpen} closed=${modalClosed}`);
      failures++;
    }

    await page.screenshot({ path: path.join(SHOTS, `${vp.name}-hero.png`) });
    await page.screenshot({ path: path.join(SHOTS, `${vp.name}-full.png`), fullPage: true });

    await ctx.close();
  }

  await browser.close();
  server.close();
  console.log(failures ? `\nFAILURES: ${failures}` : '\nAll site checks passed.');
  process.exit(failures ? 1 : 0);
})();
