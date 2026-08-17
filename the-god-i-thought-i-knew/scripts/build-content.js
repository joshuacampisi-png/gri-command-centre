/**
 * Parses the memoir markdown into a flat block stream the reader paginates at runtime.
 * Photos are lifted out of the text flow and emitted as full-page plates, anchored to
 * the paragraph they belong with, so an image is never split or squeezed by pagination.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(__dirname, 'book-source.md');

// Photo plates. `after` is a unique tail of the paragraph the plate should follow.
const PLATES = [
  {
    file: 'calabria_field',
    after: 'called Fabrizia.',
    caption: 'The members and family of my grandfather Domenico’s home church in Calabria.',
  },
  {
    file: 'french_congregation',
    after: 'the Italian meetings began.',
    caption: 'The Italian congregation gathered at the Belgian church, where the kind pastor gave my father the use of his building for the Italian meetings.',
  },
  {
    file: 'bus_dedication',
    after: 'got his Sunday mornings back.',
    caption: 'The inauguration of the church bus, 20 February 1966. My mother stands by the bus in her red dress. In the centre is my father, and beside him Brother Matteo De Santis, the superintendent of the Italian churches of America.',
  },
  {
    file: 'openair_market',
    after: 'to hear the gospel.',
    caption: 'An open-air meeting in the town square. The musicians of the church play in front of the bus, and the market crowd gathers to hear the gospel.',
  },
  {
    file: 'ribbon_cutting',
    after: 'the happiest moment imaginable.',
    caption: 'The opening of the new church. My father cuts the ribbon, with my mother beside him, and Brother Matteo De Santis on the left holding the Bible. Sister Zullo stands between them.',
  },
  {
    file: 'choir',
    after: 'I wished would never end.',
    caption: 'The choir singing an item in the new church, “A Pentecoste.” My brother-in-law Arthur leading, and my aunt Antonia on piano. The two children at the front are me and my friend Pina.',
  },
];

// Paragraphs that close a section with the author's name — set as a signature, not body copy.
const SIGNATURES = new Set(['Moses Campisi']);

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inline(text) {
  let s = escapeHtml(text);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  return s.trim();
}

const ROMAN = {
  One: 1, Two: 2, Three: 3, Four: 4, Five: 5, Six: 6, Seven: 7, Eight: 8, Nine: 9, Ten: 10,
  Eleven: 11, Twelve: 12, Thirteen: 13, Fourteen: 14, Fifteen: 15, Sixteen: 16, Seventeen: 17,
  Eighteen: 18, Nineteen: 19, Twenty: 20, 'Twenty-One': 21, 'Twenty-Two': 22, 'Twenty-Three': 23,
  'Twenty-Four': 24, 'Twenty-Five': 25, 'Twenty-Six': 26, 'Twenty-Seven': 27, 'Twenty-Eight': 28,
  'Twenty-Nine': 29,
};

function parse(md) {
  // Normalise, then split into logical lines.
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  const toc = [];
  let i = 0;
  let sectionCount = 0;
  let pendingDropCap = false;

  // Skip the leading title/author — the reader renders a designed title page instead.
  while (i < lines.length && !/^# To My Children/.test(lines[i])) i++;

  let listBuffer = null;
  const flushList = () => {
    if (listBuffer && listBuffer.length) blocks.push({ t: 'ul', items: listBuffer });
    listBuffer = null;
  };

  for (; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();

    if (!line) { flushList(); continue; }

    // Markers
    if (line === '[[PAGEBREAK]]') { flushList(); blocks.push({ t: 'break' }); continue; }
    // No asset exists for this placeholder; drop it rather than print the marker.
    if (/^\[\[.+\]\]$/.test(line)) { continue; }

    // Horizontal rule: a scene break inside a chapter, ignored right after a heading.
    if (/^---+$/.test(line)) {
      flushList();
      const prev = blocks[blocks.length - 1];
      if (prev && (prev.t === 'p' || prev.t === 'ul' || prev.t === 'sig')) blocks.push({ t: 'scene' });
      continue;
    }

    // Headings
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      flushList();
      const level = h[1].length;
      const text = h[2].trim();

      if (level === 1) {
        // Look ahead for the ## subtitle that pairs with it.
        let sub = '';
        for (let j = i + 1; j < lines.length && j < i + 4; j++) {
          const t = lines[j].trim();
          if (!t) continue;
          const m = t.match(/^##\s+(.*)$/);
          if (m) { sub = m[1].trim(); i = j; }
          break;
        }

        if (/^PART\b/i.test(text)) {
          const id = 'sec-' + (++sectionCount);
          blocks.push({ t: 'part', id, label: text, title: sub });
          toc.push({ id, kind: 'part', label: text, title: sub });
        } else {
          const id = 'sec-' + (++sectionCount);
          const m = text.match(/^Chapter\s+(.+)$/i);
          const num = m ? (ROMAN[m[1].trim()] || null) : null;
          blocks.push({ t: 'chapter', id, label: m ? text : '', title: sub || text, num });
          toc.push({ id, kind: 'chapter', label: m ? text : '', title: sub || text, num });
          pendingDropCap = true;
        }
        continue;
      }

      if (level === 2) { blocks.push({ t: 'h2', html: inline(text) }); continue; }
      blocks.push({ t: 'h3', html: inline(text) });
      continue;
    }

    // List item
    if (/^-\s+/.test(line)) {
      if (!listBuffer) listBuffer = [];
      listBuffer.push(inline(line.replace(/^-\s+/, '')));
      continue;
    }
    flushList();

    // Paragraph
    const html = inline(line);
    const plain = line.replace(/[*_]/g, '').trim();

    if (SIGNATURES.has(plain)) { blocks.push({ t: 'sig', html }); continue; }

    // A whole-line italic paragraph reads as an epigraph / scripture pull.
    if (/^\*[^*]+\*$/.test(line) && line.length < 600) {
      blocks.push({ t: 'epigraph', html: inline(line.replace(/^\*|\*$/g, '')) });
      pendingDropCap = pendingDropCap && false;
      continue;
    }

    const block = { t: 'p', html };
    if (pendingDropCap) { block.drop = true; pendingDropCap = false; }
    blocks.push(block);
  }
  flushList();

  return { blocks, toc };
}

function attachPlates(blocks) {
  const sizes = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', '.image-sizes.json'), 'utf8'));
  let placed = 0;
  for (const plate of PLATES) {
    const idx = blocks.findIndex(
      (b) => b.t === 'p' && b.html.replace(/<[^>]+>/g, '').trim().endsWith(plate.after)
    );
    if (idx === -1) {
      throw new Error(`Plate anchor not found: "${plate.after}"`);
    }
    const dim = sizes[plate.file];
    if (!dim) throw new Error(`No dimensions for image ${plate.file}`);
    // Insert after the anchor paragraph, past any scene break that follows it.
    let at = idx + 1;
    if (blocks[at] && blocks[at].t === 'scene') at++;
    blocks.splice(at, 0, {
      t: 'plate',
      src: `images/${plate.file}.webp`,
      caption: plate.caption,
      w: dim.width,
      h: dim.height,
    });
    placed++;
  }
  return placed;
}

const md = fs.readFileSync(SRC, 'utf8');
const { blocks, toc } = parse(md);
const placed = attachPlates(blocks);

const words = blocks
  .filter((b) => b.t === 'p' || b.t === 'epigraph')
  .reduce((n, b) => n + b.html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length, 0);

const out = {
  title: 'The God I Thought I Knew',
  subtitle: 'A journey from religion to real relationship',
  author: 'Moses Campisi',
  words,
  toc,
  blocks,
};

const dest = path.join(ROOT, 'public', 'content', 'book.json');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, JSON.stringify(out));

const counts = blocks.reduce((m, b) => ((m[b.t] = (m[b.t] || 0) + 1), m), {});
console.log('blocks:', JSON.stringify(counts));
console.log('plates placed:', placed, '| toc entries:', toc.length, '| words:', words);
console.log('written', dest, (fs.statSync(dest).size / 1024).toFixed(0) + ' KB');
