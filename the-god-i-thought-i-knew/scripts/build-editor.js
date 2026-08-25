/**
 * Builds the live manuscript editor: one self-contained page that carries the
 * book as data, lets it be edited, and republishes itself through the artifact
 * capability. Reading the page back recovers the edited manuscript.
 */
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const SRC = path.join(HERE, 'book-source.md');
const FONTS = path.join(HERE, '..', 'public', 'fonts');
const OUT = path.join(HERE, '..', '.qa', 'editor.html');

const face = (f) =>
  `data:font/woff2;base64,${fs.readFileSync(path.join(FONTS, f)).toString('base64')}`;

const FONT_CSS = `@font-face{font-family:Literata;src:url(${face('literata.woff2')}) format('woff2');font-weight:200 700;font-style:normal;font-display:swap}
@font-face{font-family:Literata;src:url(${face('literata-italic.woff2')}) format('woff2');font-weight:200 700;font-style:italic;font-display:swap}
`;

/** Split the manuscript at its `# ` headings. */
function parse(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let cur = null;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    const h = t.match(/^#\s+(.+)$/);
    if (h) {
      if (cur) out.push(cur);
      let sub = '';
      for (let j = i + 1; j < lines.length && j < i + 4; j++) {
        const s = lines[j].trim();
        if (!s) continue;
        const m = s.match(/^##\s+(.*)$/);
        if (m) { sub = m[1].trim(); i = j; }
        break;
      }
      cur = { title: h[1].trim(), sub, isPart: /^PART\b/i.test(h[1]), body: [] };
      continue;
    }
    if (cur) cur.body.push(lines[i]);
  }
  if (cur) out.push(cur);
  return out.map((s) => ({ ...s, body: s.body.join('\n').replace(/^\n+/, '').replace(/\s+$/, '') }));
}

const sections = parse(fs.readFileSync(SRC, 'utf8'));
const DATA = { title: 'The God I Thought I Knew', author: 'Moses Campisi', sections };

const css = FONT_CSS + fs.readFileSync(path.join(HERE, 'editor', 'editor.css'), 'utf8');
const app = fs.readFileSync(path.join(HERE, 'editor', 'editor-app.js'), 'utf8');
const json = JSON.stringify(DATA).replace(/</g, '\\u003c');
const CLOSE = '<' + '/script>';

const html = `<!doctype html>
<html lang="en-AU">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${DATA.title} — Manuscript</title>
<style id="css">${css}</style>
</head>
<body data-theme="night">
<script id="book" type="application/json">${json}${CLOSE}
<div id="root"></div>
<script id="app">${app}${CLOSE}
</body>
</html>
`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);

const w = sections.reduce((n, s) => n + s.body.split(/\s+/).filter(Boolean).length, 0);
console.log(
  'editor.html', (Buffer.byteLength(html) / 1024).toFixed(0) + ' KB |',
  sections.length, 'sections |', w.toLocaleString(), 'words'
);
