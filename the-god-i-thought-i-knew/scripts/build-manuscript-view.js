/**
 * Renders the manuscript as one scrollable, searchable HTML page for proofreading.
 * Self-contained so it can be opened or previewed anywhere.
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'book-source.md');
const FONTS = path.join(__dirname, '..', 'public', 'fonts');

// The proofing view uses the book's own typeface, so the words look the same
// here as they do on the page.
const face = (file) =>
  `data:font/woff2;base64,${fs.readFileSync(path.join(FONTS, file)).toString('base64')}`;
const FONT_CSS = `
@font-face{font-family:Literata;src:url(${face('literata.woff2')}) format('woff2');
 font-weight:200 700;font-style:normal;font-display:swap;
 unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+2000-206F,U+2122,U+FEFF,U+FFFD;}
@font-face{font-family:Literata;src:url(${face('literata-ext.woff2')}) format('woff2');
 font-weight:200 700;font-style:normal;font-display:swap;
 unicode-range:U+0100-02BA,U+1E00-1E9F,U+1EF2-1EFF,U+2C60-2C7F,U+A720-A7FF;}
@font-face{font-family:Literata;src:url(${face('literata-italic.woff2')}) format('woff2');
 font-weight:200 700;font-style:italic;font-display:swap;}
`;
const OUT = path.join(__dirname, '..', '.qa', 'manuscript.html');

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (s) =>
  esc(s).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*]+)\*/g, '<em>$1</em>');

const lines = fs.readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n').split('\n');
const body = [];
const nav = [];
let n = 0;
let words = 0;
let pendingWords = null;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;
  if (/^\[\[.+\]\]$/.test(line)) continue;
  if (/^---+$/.test(line)) { body.push('<div class="brk">· · ·</div>'); continue; }

  const h = line.match(/^(#{1,3})\s+(.*)$/);
  if (h) {
    const level = h[1].length;
    const text = h[2].trim();
    if (level === 1) {
      const id = 's' + ++n;
      let sub = '';
      for (let j = i + 1; j < lines.length && j < i + 4; j++) {
        const t = lines[j].trim();
        if (!t) continue;
        const m = t.match(/^##\s+(.*)$/);
        if (m) { sub = m[1].trim(); i = j; }
        break;
      }
      const isPart = /^PART\b/i.test(text);
      if (pendingWords) pendingWords.count = words - pendingWords.at;
      const entry = { id, text, sub, isPart, at: words, count: 0 };
      nav.push(entry);
      pendingWords = entry;
      body.push(
        `<section id="${id}" class="${isPart ? 'part' : 'chap'}">` +
        `<h2><span class="lab">${esc(text)}</span>${sub ? `<span class="ttl">${esc(sub)}</span>` : ''}</h2>` +
        `</section>`
      );
      continue;
    }
    body.push(`<h3>${inline(text)}</h3>`);
    continue;
  }

  if (/^-\s+/.test(line)) { body.push(`<li>${inline(line.replace(/^-\s+/, ''))}</li>`); continue; }
  words += line.split(/\s+/).filter(Boolean).length;
  body.push(`<p>${inline(line)}</p>`);
}
if (pendingWords) pendingWords.count = words - pendingWords.at;

const navHTML = nav.map((e) =>
  `<a href="#${e.id}" class="${e.isPart ? 'np' : 'nc'}">` +
  `<span class="nt">${esc(e.sub || e.text)}</span>` +
  `<span class="nw">${e.count.toLocaleString()}</span></a>`
).join('');

const html = `<title>The God I Thought I Knew — Manuscript</title>
<style>
${FONT_CSS}
/* Night is the default so the page is correctly coloured before the script
   runs; the toggle below swaps it. */
:root{
  --bg:#15130f; --panel:#1c1915; --ink:#cdbfa8; --soft:#a2947f; --faint:#75695a;
  --gold:#c19a5d; --line:rgba(193,154,93,.22);
}
/* Day palette, matching the reader's day theme. */
body[data-theme="day"]{
  --bg:#fbf8f2; --panel:#f2ece0; --ink:#241d15; --soft:#6d5c46; --faint:#a4917a;
  --gold:#8a6334; --line:rgba(138,99,52,.2);
}
/* Night palette, matching the reader's night theme. */
body[data-theme="night"]{
  --bg:#15130f; --panel:#1c1915; --ink:#cdbfa8; --soft:#a2947f; --faint:#75695a;
  --gold:#c19a5d; --line:rgba(193,154,93,.22);
}
*{margin:0;padding:0;box-sizing:border-box}
body{background:var(--bg);color:var(--ink);
 font:16px/1.72 Literata,Georgia,"Times New Roman",serif;
 -webkit-font-smoothing:antialiased;transition:background .3s,color .3s;}
.wrap{display:grid;grid-template-columns:250px 1fr;min-height:100vh}
aside{background:var(--panel);border-right:1px solid var(--line);
 position:sticky;top:0;height:100vh;overflow-y:auto;padding:16px 0}
.head{padding:0 16px 14px;border-bottom:1px solid var(--line);margin-bottom:8px}
.head b{display:block;font-size:15px;font-weight:600;letter-spacing:.01em}
.head span{display:block;font-size:11.5px;color:var(--faint);margin-top:3px;
 font-family:ui-sans-serif,system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase}
aside a{display:flex;gap:8px;align-items:baseline;padding:7px 16px;color:var(--soft);
 text-decoration:none;font-size:13.5px;line-height:1.35}
aside a:hover{background:rgba(138,99,52,.09);color:var(--ink)}
aside a.np{margin-top:14px;color:var(--gold);font-size:11px;letter-spacing:.18em;
 text-transform:uppercase;font-family:ui-sans-serif,system-ui,sans-serif}
.nt{flex:1}
.nw{font-size:11px;color:var(--faint);font-variant-numeric:tabular-nums;
 font-family:ui-sans-serif,system-ui,sans-serif}
main{padding:44px clamp(20px,5vw,72px) 120px;max-width:820px}
.meta{font-family:ui-sans-serif,system-ui,sans-serif;font-size:11.5px;letter-spacing:.14em;
 text-transform:uppercase;color:var(--faint);margin-bottom:34px;
 padding-bottom:14px;border-bottom:1px solid var(--line)}
section.chap,section.part{margin:52px 0 22px;scroll-margin-top:20px}
section.part{text-align:center;margin-top:76px}
.tog{display:block;width:calc(100% - 32px);margin:0 16px 12px;padding:8px;cursor:pointer;
 background:transparent;border:1px solid var(--line);color:var(--soft);border-radius:4px;
 font:11px ui-sans-serif,system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;}
.tog:hover{background:rgba(138,99,52,.1);color:var(--ink);}
h2 .lab{display:block;font-family:ui-sans-serif,system-ui,sans-serif;font-size:11px;
 letter-spacing:.26em;text-transform:uppercase;color:var(--gold);margin-bottom:8px}
h2 .ttl{display:block;font-size:29px;font-weight:400;line-height:1.15}
section.part h2 .ttl{font-style:italic}
h3{font-size:18px;font-weight:600;margin:30px 0 12px;color:var(--gold)}
p{margin:0 0 1.05em;text-align:left;}
li{margin:0 0 .4em 1.4em}
.brk{text-align:center;color:var(--gold);letter-spacing:.5em;margin:1.4em 0;opacity:.6}
mark{background:rgba(214,169,99,.4);color:inherit}
.search{position:sticky;top:0;z-index:5;background:var(--bg);
 padding:0 0 14px;margin:-44px 0 0;padding-top:44px}
.search input{width:100%;max-width:340px;padding:9px 12px;border:1px solid var(--line);
 background:var(--panel);color:var(--ink);border-radius:4px;
 font:14px ui-sans-serif,system-ui,sans-serif}
.search input:focus{outline:none;border-color:var(--gold)}
@media(max-width:860px){
  .wrap{grid-template-columns:1fr}
  aside{position:static;height:auto;max-height:230px}
}
</style>
<div class="wrap">
<aside>
  <div class="head"><b>The God I Thought I Knew</b><span>Manuscript</span></div>
  <button class="tog" id="tog" type="button">Switch to day</button>
  ${navHTML}
</aside>
<main>
  <div class="search"><input id="q" type="search" placeholder="Search the manuscript…" autocomplete="off"></div>
  <div class="meta">${words.toLocaleString()} words · ${nav.filter((e) => /^Chapter\b/i.test(e.text)).length} chapters · ${nav.filter((e) => e.isPart).length} parts</div>
  <div id="doc">${body.join('\n')}</div>
</main>
</div>
<script>
// Default to the book's night look; remember whichever the reader picks.
const setTheme = (t) => {
  document.body.dataset.theme = t;
  document.getElementById('tog').textContent = t === 'night' ? 'Switch to day' : 'Switch to night';
  try { localStorage.setItem('tgitik.ms.theme', t); } catch (e) {}
};
let saved = 'night';
try { saved = localStorage.getItem('tgitik.ms.theme') || 'night'; } catch (e) {}
setTheme(saved);
document.getElementById('tog').addEventListener('click', () =>
  setTheme(document.body.dataset.theme === 'night' ? 'day' : 'night'));

const doc = document.getElementById('doc');
const original = doc.innerHTML;
let t;
document.getElementById('q').addEventListener('input', (e) => {
  clearTimeout(t);
  const v = e.target.value.trim();
  t = setTimeout(() => {
    if (v.length < 2) { doc.innerHTML = original; return; }
    const safe = v.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&');
    doc.innerHTML = original.replace(
      new RegExp('(?![^<]*>)(' + safe + ')', 'gi'),
      '<mark>$1</mark>'
    );
    const first = doc.querySelector('mark');
    if (first) first.scrollIntoView({ block: 'center' });
  }, 200);
});
</script>`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);
console.log('manuscript.html', (Buffer.byteLength(html) / 1024).toFixed(0) + ' KB |', words, 'words |', nav.length, 'sections');
