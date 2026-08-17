/**
 * Bundles the flip-book reader into one self-contained HTML file for preview.
 * The manuscript is normally fetched as JSON; here it is inlined and the fetch
 * short-circuited, because the artifact host blocks every external request.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PUB = path.join(ROOT, 'public');
const OUT = path.join(ROOT, '.qa', 'preview-reader.html');

const MIME = { '.woff2': 'font/woff2', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png' };

const cache = new Map();
function dataURI(rel) {
  if (cache.has(rel)) return cache.get(rel);
  const buf = fs.readFileSync(path.join(PUB, rel));
  const uri = `data:${MIME[path.extname(rel)]};base64,${buf.toString('base64')}`;
  cache.set(rel, uri);
  return uri;
}

let css = fs.readFileSync(path.join(PUB, 'read', 'reader.css'), 'utf8');
css = css.replace(/url\(\.\.\/(fonts|media)\/([^)]+)\)/g, (_, dir, file) => `url(${dataURI(`${dir}/${file}`)})`);

const lib = fs.readFileSync(path.join(PUB, 'read', 'page-flip.browser.js'), 'utf8');
let js = fs.readFileSync(path.join(PUB, 'read', 'reader.js'), 'utf8');

// Plate images are referenced from book.json; swap them for data URIs there.
const book = JSON.parse(fs.readFileSync(path.join(PUB, 'content', 'book.json'), 'utf8'));
book.blocks.forEach((b) => {
  if (b.t === 'plate') b.src = dataURI('media/' + path.basename(b.src));
});

// The author portrait is built into the back-cover markup.
js = js.replace("'../media/author.webp'", JSON.stringify(dataURI('media/author.webp')));
js = js.replace(/src="\.\.\/media\/author\.webp"/, `src="${dataURI('media/author.webp')}"`);

// Serve the manuscript from memory instead of over the network.
js = js.replace(
  "var res = await fetch('../content/book.json');\n    state.book = await res.json();",
  'state.book = window.__BOOK__;'
);
if (js.indexOf('window.__BOOK__') === -1) {
  throw new Error('fetch replacement did not apply — reader.js shape changed');
}

let html = fs.readFileSync(path.join(PUB, 'read', 'index.html'), 'utf8');
html = html.slice(html.indexOf('<body') , html.indexOf('</body>'));
html = html.slice(html.indexOf('>') + 1);
html = html.replace(/<script src="[^"]*"><\/script>/g, '');
html = html.replace(/src="\.\.\/media\/([^"]+)"/g, (_, f) => `src="${dataURI('media/' + f)}"`);

const out = [
  '<title>The God I Thought I Knew — Reader</title>',
  `<style>\n${css}\n</style>`,
  html.trim(),
  `<script>window.__BOOK__ = ${JSON.stringify(book)};</script>`,
  `<script>\n${lib}\n</script>`,
  `<script>\n${js}\n</script>`,
].join('\n');

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, out);

const mb = (Buffer.byteLength(out) / 1024 / 1024).toFixed(2);
console.log('preview-reader.html', mb + ' MB', '| inlined assets:', cache.size);
if (Buffer.byteLength(out) > 16 * 1024 * 1024) {
  console.error('OVER the 16MB artifact limit');
  process.exit(1);
}
