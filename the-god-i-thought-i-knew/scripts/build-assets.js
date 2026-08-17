/**
 * Image pipeline.
 *
 * The supplied cover/back-cover are flattened JPEGs with their typography baked in
 * (and the back cover is a phone screenshot, complete with a home indicator). Both are
 * rebuilt as live HTML in the reader, so this script extracts the parts worth keeping:
 *   - the photographic scene from the cover, with its sky mirror-extended to a book ratio
 *   - the author portrait from the back cover
 *   - the six interior photographs, as webp plates
 *   - a 1200x630 social card so the shared link previews properly
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const IMG = path.join(ROOT, 'public', 'media');
const SRC = path.join(ROOT, 'scripts', 'source-images');

const PHOTOS = [
  'calabria_field',
  'french_congregation',
  'bus_dedication',
  'openair_market',
  'ribbon_cutting',
  'choir',
];

// Clean photographic region of cov.jpg, below the baked-in title and above the baked-in strapline.
// There is only a sliver of sky above the figure's head here, so the scene is emitted as-is
// and the cover page composes it as a bottom-anchored band fading into a dark field.
const SCENE = { left: 0, top: 780, width: 800, height: 515 };
// Author portrait inside bak.jpg, inset to clear the gold rule drawn around it.
const PORTRAIT = { left: 608, top: 884, width: 102, height: 153 };

async function buildCoverArt() {
  const OUT_W = 1400;
  const sceneH = Math.round((SCENE.height / SCENE.width) * OUT_W);

  await sharp(path.join(SRC, 'cov.jpg'))
    .extract(SCENE)
    .resize(OUT_W, sceneH, { kernel: 'lanczos3' })
    .webp({ quality: 90 })
    .toFile(path.join(IMG, 'cover-art.webp'));

  return { OUT_W, sceneH };
}

async function buildPortrait() {
  await sharp(path.join(SRC, 'bak.jpg'))
    .extract(PORTRAIT)
    .resize(408, 612, { fit: 'cover', kernel: 'lanczos3' })
    .webp({ quality: 90 })
    .toFile(path.join(IMG, 'author.webp'));
}

async function buildPlates() {
  const sizes = {};
  for (const name of PHOTOS) {
    const file = path.join(SRC, `${name}.jpg`);
    const meta = await sharp(file).metadata();
    sizes[name] = { width: meta.width, height: meta.height };
    await sharp(file)
      .resize({ width: 1400, withoutEnlargement: true })
      .webp({ quality: 86 })
      .toFile(path.join(IMG, `${name}.webp`));
  }
  fs.writeFileSync(
    path.join(ROOT, 'scripts', '.image-sizes.json'),
    JSON.stringify(sizes, null, 2)
  );
  return sizes;
}

async function buildSocialCard() {
  // Landscape crop of the scene, darkened on the left where the overlaid title sits.
  const base = await sharp(path.join(SRC, 'cov.jpg'))
    .extract(SCENE)
    .resize(1200, 630, { fit: 'cover', position: 'attention' })
    .toBuffer();

  const scrim = Buffer.from(
    `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#000" stop-opacity="0.72"/>
          <stop offset="55%" stop-color="#000" stop-opacity="0.34"/>
          <stop offset="100%" stop-color="#000" stop-opacity="0.66"/>
        </linearGradient>
      </defs>
      <rect width="1200" height="630" fill="url(#g)"/>
      <text x="600" y="238" text-anchor="middle" fill="#f6efe2"
            font-family="Georgia, 'Times New Roman', serif" font-size="96" letter-spacing="2">THE GOD</text>
      <text x="600" y="330" text-anchor="middle" fill="#f6efe2"
            font-family="Georgia, 'Times New Roman', serif" font-size="62" letter-spacing="6">I THOUGHT I KNEW</text>
      <rect x="530" y="372" width="140" height="1" fill="#d7ab63"/>
      <text x="600" y="424" text-anchor="middle" fill="#e3c286"
            font-family="Georgia, 'Times New Roman', serif" font-size="27" letter-spacing="4" font-style="italic">A journey from religion to real relationship</text>
      <text x="600" y="560" text-anchor="middle" fill="#cbb894"
            font-family="Georgia, 'Times New Roman', serif" font-size="26" letter-spacing="9">MOSES CAMPISI</text>
    </svg>`
  );

  await sharp(base)
    .composite([{ input: scrim, top: 0, left: 0 }])
    .jpeg({ quality: 88 })
    .toFile(path.join(IMG, 'social-card.jpg'));
}

async function buildIcons() {
  const src = await sharp(path.join(SRC, 'cov.jpg'))
    .extract({ left: 150, top: 1000, width: 500, height: 500 })
    .toBuffer();
  for (const size of [180, 192, 512]) {
    await sharp(src).resize(size, size).png().toFile(path.join(IMG, `icon-${size}.png`));
  }
  await sharp(src).resize(48, 48).png().toFile(path.join(ROOT, 'public', 'favicon.png'));
}

(async () => {
  fs.mkdirSync(IMG, { recursive: true });
  const cover = await buildCoverArt();
  await buildPortrait();
  const sizes = await buildPlates();
  await buildSocialCard();
  await buildIcons();

  console.log('cover-art.webp', `${cover.OUT_W}x${cover.sceneH}`);
  console.log('plates:', Object.keys(sizes).join(', '));
  const total = fs
    .readdirSync(IMG)
    .reduce((n, f) => n + fs.statSync(path.join(IMG, f)).size, 0);
  console.log('images total', (total / 1024).toFixed(0) + ' KB');
})();
