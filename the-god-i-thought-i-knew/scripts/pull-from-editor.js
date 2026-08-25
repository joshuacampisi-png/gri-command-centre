/**
 * Rebuilds book-source.md from a saved copy of the editor page.
 *
 *   node scripts/pull-from-editor.js <editor.html>
 *
 * Writes a .bak first and reports what changed per chapter.
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'book-source.md');
const input = process.argv[2];
if (!input) {
  console.error('usage: node scripts/pull-from-editor.js <editor.html>');
  process.exit(1);
}

const html = fs.readFileSync(input, 'utf8');
const m = html.match(/<script id="book" type="application\/json">([\s\S]*?)<\/script>/);
if (!m) {
  console.error('No manuscript data found in that file — is it the editor page?');
  process.exit(1);
}

const data = JSON.parse(m[1].replace(/\\u003c/g, '<'));
if (!data.sections || !data.sections.length) {
  console.error('The manuscript data is empty; refusing to overwrite.');
  process.exit(1);
}

const rebuilt = data.sections
  .map((s) => {
    const head = `# ${s.title}`;
    const sub = s.sub ? `\n## ${s.sub}` : '';
    const body = s.body ? `\n\n${s.body.replace(/\s+$/, '')}` : '';
    return `${head}${sub}${body}`;
  })
  .join('\n\n\n\n') + '\n';

const before = fs.readFileSync(SRC, 'utf8');
const wc = (s) => s.split(/\s+/).filter(Boolean).length;

if (rebuilt === before) {
  console.log('No changes — the manuscript already matches the editor.');
  process.exit(0);
}

// Report per-section deltas against the current file.
const prev = {};
before.split(/\n(?=# )/).forEach((chunk) => {
  const h = chunk.match(/^#\s+(.+)/);
  if (h) prev[h[1].trim()] = wc(chunk);
});
let changed = 0;
data.sections.forEach((s) => {
  const now = wc(`# ${s.title}${s.sub ? `\n## ${s.sub}` : ''}\n\n${s.body}`);
  const was = prev[s.title];
  if (was !== undefined && was !== now) {
    console.log(`  ${s.sub || s.title}: ${was} -> ${now} words (${now - was >= 0 ? '+' : ''}${now - was})`);
    changed++;
  }
});

fs.copyFileSync(SRC, SRC + '.bak');
fs.writeFileSync(SRC, rebuilt);
console.log(`${changed} section(s) changed. Total ${wc(before)} -> ${wc(rebuilt)} words.`);
console.log('Backup at book-source.md.bak. Run: npm run preview');
