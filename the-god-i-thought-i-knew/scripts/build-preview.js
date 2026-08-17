/**
 * Bundles the launch page into one self-contained HTML file for preview.
 * Fonts, images and the cover-art background all become data URIs, because the
 * artifact host blocks every external request. Output is body-level markup only:
 * the host supplies the doctype, html, head and body wrappers.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PUB = path.join(ROOT, 'public');
const OUT = path.join(ROOT, '.qa', 'preview.html');

const MIME = { '.woff2': 'font/woff2', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png' };

const cache = new Map();
function dataURI(rel) {
  if (cache.has(rel)) return cache.get(rel);
  const file = path.join(PUB, rel);
  const buf = fs.readFileSync(file);
  const uri = `data:${MIME[path.extname(file)]};base64,${buf.toString('base64')}`;
  cache.set(rel, uri);
  return uri;
}

let css = fs.readFileSync(path.join(PUB, 'site', 'site.css'), 'utf8');
// url(../fonts/x.woff2) and url(../media/x.webp) -> data URIs
css = css.replace(/url\(\.\.\/(fonts|media)\/([^)]+)\)/g, (_, dir, file) => `url(${dataURI(`${dir}/${file}`)})`);

const js = fs.readFileSync(path.join(PUB, 'site', 'site.js'), 'utf8');

let html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');

// Body content only.
html = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));

// Inline every <img>.
html = html.replace(/src="media\/([^"]+)"/g, (_, file) => `src="${dataURI('media/' + file)}"`);

// The script tag is replaced with the inlined source.
html = html.replace(/<script src="site\/site\.js"><\/script>/, '');

const out = [
  '<title>The God I Thought I Knew</title>',
  `<style>\n${css}\n</style>`,
  html.trim(),
  `<script>\n${js}\n</script>`,
].join('\n');

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, out);

const mb = (Buffer.byteLength(out) / 1024 / 1024).toFixed(2);
console.log('preview.html', mb + ' MB', '| inlined assets:', cache.size);
if (Buffer.byteLength(out) > 16 * 1024 * 1024) {
  console.error('OVER the 16MB artifact limit');
  process.exit(1);
}
