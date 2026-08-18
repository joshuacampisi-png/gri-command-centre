/**
 * Splices an edited chapter file back into the manuscript.
 *
 *   node scripts/replace-chapter.js CHAPTER-01.md
 *
 * The chapter is located by its own `# Chapter X` heading, so the file can be
 * edited freely as long as that first line is left alone. Writes a .bak first.
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'book-source.md');
const input = process.argv[2];
if (!input) {
  console.error('usage: node scripts/replace-chapter.js <chapter-file.md>');
  process.exit(1);
}

const incoming = fs.readFileSync(input, 'utf8').replace(/\r\n/g, '\n').replace(/\s+$/, '');
const heading = incoming.split('\n')[0].trim();
if (!/^#\s+\S/.test(heading)) {
  console.error(`First line must be the chapter heading, e.g. "# Chapter One". Got: ${heading}`);
  process.exit(1);
}

const book = fs.readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');
const lines = book.split('\n');

const start = lines.findIndex((l) => l.trim() === heading);
if (start === -1) {
  console.error(`Could not find "${heading}" in the manuscript.`);
  process.exit(1);
}
let end = lines.length;
for (let i = start + 1; i < lines.length; i++) {
  if (/^#\s+\S/.test(lines[i])) { end = i; break; }
}

const before = lines.slice(0, start).join('\n');
const after = lines.slice(end).join('\n');
const merged = `${before}\n${incoming}\n\n\n\n${after}`;

fs.copyFileSync(SRC, SRC + '.bak');
fs.writeFileSync(SRC, merged);

const words = (s) => s.split(/\s+/).filter(Boolean).length;
console.log(`replaced ${heading}: lines ${start + 1}-${end}`);
console.log(`  was ${words(lines.slice(start, end).join(' '))} words, now ${words(incoming)} words`);
console.log(`  backup at ${path.basename(SRC)}.bak`);
