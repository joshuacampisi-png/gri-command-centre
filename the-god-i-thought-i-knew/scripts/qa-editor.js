/**
 * Verifies the editor round trip: edit a chapter, save, then load the document
 * the page produced and confirm the edit survived and the page still works.
 * A self-reproducing page must be stable across generations.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FILE = path.join(ROOT, '.qa', 'editor.html');

const STUB = `
window.__published = null;
window.claude = {
  use: (name) => Promise.resolve(name === 'artifact' ? {
    publish: async (html) => { window.__published = html; return { ok: true }; }
  } : null)
};`;

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  let fail = 0;
  const errs = [];

  async function open(html, label) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await ctx.addInitScript(STUB);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errs.push(`${label}: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errs.push(`${label}: ${m.text()}`); });
    await page.setContent(html, { waitUntil: 'load' });
    await page.waitForTimeout(700);
    return { ctx, page };
  }

  // --- generation 1 -------------------------------------------------------
  const gen1 = fs.readFileSync(FILE, 'utf8');
  let { ctx, page } = await open(gen1, 'gen1');

  const boot = await page.evaluate(() => ({
    chapters: document.querySelectorAll('#list button').length,
    status: document.getElementById('status').textContent,
    saveDisabled: document.getElementById('save').disabled,
    bodyLen: document.getElementById('body').value.length,
  }));
  console.log('gen1 boot:', JSON.stringify(boot));
  if (boot.chapters !== 36) { console.log('  wrong chapter count'); fail++; }
  if (boot.status !== 'Ready') { console.log('  did not connect to artifact capability'); fail++; }

  // Pick Chapter One and edit it.
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('#list button')];
    btns.find((b) => b.textContent.includes('In the Beginning')).click();
  });
  await page.waitForTimeout(300);
  const MARK = 'ROUNDTRIP_SENTINEL_9F3';
  await page.evaluate((m) => {
    const t = document.getElementById('body');
    t.value = m + '\n\n' + t.value;
    t.dispatchEvent(new Event('input', { bubbles: true }));
  }, MARK);
  await page.waitForTimeout(200);

  const dirtyState = await page.evaluate(() => ({
    save: !document.getElementById('save').disabled,
    status: document.getElementById('status').textContent,
    dots: document.querySelectorAll('#list button.dirty').length,
  }));
  console.log('after edit:', JSON.stringify(dirtyState));
  if (!dirtyState.save || dirtyState.dots !== 1) { console.log('  dirty tracking wrong'); fail++; }

  await page.click('#save');
  await page.waitForTimeout(500);
  const saved = await page.evaluate(() => ({
    status: document.getElementById('status').textContent,
    html: window.__published,
  }));
  console.log('after save:', saved.status, '| doc', saved.html ? (saved.html.length / 1024).toFixed(0) + ' KB' : 'NONE');
  if (saved.status !== 'Saved' || !saved.html) { console.log('  save did not complete'); fail++; }
  await ctx.close();

  // --- generation 2: load exactly what the page produced ------------------
  const gen2 = saved.html || '';
  if (!/^<!doctype html>/i.test(gen2)) { console.log('  gen2 is not a complete document'); fail++; }
  if (gen2.indexOf(MARK) === -1) { console.log('  edit missing from gen2'); fail++; }

  ({ ctx, page } = await open(gen2, 'gen2'));
  const g2 = await page.evaluate((m) => {
    const btns = [...document.querySelectorAll('#list button')];
    btns.find((b) => b.textContent.includes('In the Beginning')).click();
    return {
      chapters: btns.length,
      status: document.getElementById('status').textContent,
    };
  }, MARK);
  await page.waitForTimeout(300);
  const g2body = await page.evaluate(() => document.getElementById('body').value);
  console.log('gen2 boot:', JSON.stringify(g2), '| edit present:', g2body.startsWith(MARK));
  if (g2.chapters !== 36) { console.log('  gen2 lost chapters'); fail++; }
  if (!g2body.startsWith(MARK)) { console.log('  gen2 lost the edit'); fail++; }

  // --- generation 3: make sure it can save again -------------------------
  await page.evaluate(() => {
    const t = document.getElementById('body');
    t.value = 'SECOND_PASS ' + t.value;
    t.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.click('#save');
  await page.waitForTimeout(500);
  const gen3 = await page.evaluate(() => window.__published);
  console.log('gen3 produced:', gen3 ? (gen3.length / 1024).toFixed(0) + ' KB' : 'NONE',
    '| both edits present:', !!gen3 && gen3.includes('SECOND_PASS') && gen3.includes(MARK));
  if (!gen3 || !gen3.includes('SECOND_PASS') || !gen3.includes(MARK)) {
    console.log('  third generation broke'); fail++;
  }
  await ctx.close();

  await browser.close();
  if (errs.length) { console.log('console errors:', errs.slice(0, 4)); fail++; }
  console.log(fail ? `\nFAILURES: ${fail}` : '\nEditor round trip is stable.');
  process.exit(fail ? 1 : 0);
})();
