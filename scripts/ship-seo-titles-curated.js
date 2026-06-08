/**
 * SHIP curated batch of SEO titles — only PROVEN-CLEAN cases.
 *
 * Strategy:
 *  - Each product has a HAND-VERIFIED title aligned to real AU keyword intent
 *  - No regex misclassification risk — every entry reviewed
 *  - Mix of categories so we get spread of signal
 *  - All targets ≤70 chars
 *  - Single rollback command for all
 *
 * Rollback: node scripts/ship-seo-titles-curated.js --rollback
 */
import 'dotenv/config'
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs'

const SHOP = process.env.SHOPIFY_STORE_DOMAIN || 'bdd19a-3.myshopify.com'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const URL = `https://${SHOP}/admin/api/2026-01/graphql.json`

const SNAPSHOT_DIR = 'data/snapshots/seo-titles-curated'
mkdirSync(SNAPSHOT_DIR, { recursive: true })
const LOG = `${SNAPSHOT_DIR}/log.json`
const ROLLBACK = process.argv.includes('--rollback')

async function gql(query, variables = {}) {
  const r = await fetch(URL, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  return r.json()
}

// ===== HAND-CURATED BATCH (verified clean, high-volume targets) =====
const CURATED = [
  // ── CAKE TOPPERS (6,600/mo "cake topper" + 110/mo gender reveal cake topper) ──
  { handle: 'oh-baby-cake-topper',                  newTitle: 'Oh Baby Cake Topper Gold | Gender Reveal & Baby Shower Australia' },
  { handle: 'gender-reveal-burn-away-topper',       newTitle: 'Burn Away Cake Topper Kit | Gender Reveal Viral Trend Australia' },

  // ── BABY SHOWER + BALLOON KIT (4,400/mo crossover) ──
  { handle: 'gender-reveal-baby-shower-balloon-kit', newTitle: '148 Piece Gender Reveal & Baby Shower Balloon Kit | Australia 4.85★' },
  { handle: '87-piece-nature-gender-reveal-baby-shower-luxury-balloon-kit', newTitle: '87 Piece Gender Reveal & Baby Shower Balloon Kit | Nature Australia' },

  // ── BABY SHOWER ACCESSORIES (preserve product specificity) ──
  { handle: 'baby-shower-box-australia',            newTitle: 'Gender Reveal & Baby Shower Party Box Set | Australia 4.85★' },
  { handle: 'gender-reveal-cups',                   newTitle: 'Oh Baby Party Cups | Gender Reveal & Baby Shower Australia' },
  { handle: 'gender-reveal-prediction-cards',       newTitle: 'Gender Reveal Prediction Cards | Baby Shower Party Australia' },
  { handle: 'gender-reveal0ideas-party',            newTitle: 'Gender Reveal Voting Sheet & Party Game | Australia 4.85★' },
  { handle: 'oh-baby-gender-reveal-napkins-gender-reveal-napkins', newTitle: 'Oh Baby Party Napkins | Gender Reveal & Baby Shower Australia' },
  { handle: 'baby-shower-plates-gender-reveal-plates', newTitle: 'Oh Baby Party Plates | Gender Reveal & Baby Shower Australia' },
  { handle: 'baby-shower-gold-forks',               newTitle: 'Gold Party Forks | Gender Reveal & Baby Shower Australia' },

  // ── SMOKE BOMBS (880/mo) ──
  { handle: 'gender-reveal-smoke-bombs',            newTitle: 'Gender Reveal Smoke Bombs Pink Blue | Australia 4.85★ Reviews' },
  { handle: 'gender-reveal-smoke-bomb-australia',   newTitle: 'Gender Reveal Smoke Bombs | Australia 4.85★ Reviews' },

  // ── EXTINGUISHER (170/mo + 110/mo "gender reveal fire extinguisher") ──
  { handle: 'gender-reveal-extinguisher-australia', newTitle: 'Gender Reveal Powder Extinguisher MEGA Blaster | Australia 4.85★' },
  { handle: 'mega-gender-reveal-powder-blaster',    newTitle: 'Gender Reveal Double MEGA Powder Extinguisher | Australia 4.85★' },
  { handle: 'gender-reveal-powder-extinguisher-australia', newTitle: 'Quad Family Gender Reveal Powder Extinguisher | Australia 4.85★' },

  // ── BURNOUT (70/mo) ──
  { handle: 'gender-reveal-burnout-powder',         newTitle: 'Gender Reveal Burnout Powder MEGA Smoke EXTREME | Australia 4.85★' },

  // ── SPORTS BALLS (preserving sport specificity) ──
  { handle: 'gender-reveal-golf-balls',             newTitle: 'Gender Reveal Golf Ball | Australia 4.85★ Reviews' },
  { handle: 'gender-reveal-exploding-soccer-ball',  newTitle: 'Gender Reveal Soccer Ball | Sports Reveal Australia 4.85★' },
  { handle: 'gender-reveal-nfl-ball',               newTitle: 'Gender Reveal NFL Football | Sports Reveal Australia 4.85★' },
  { handle: 'gender-reveal-powder-basketball',      newTitle: 'Gender Reveal Basketball | Sports Reveal Australia 4.85★' },
  { handle: 'gender-reveal-powder-baseball',        newTitle: 'Gender Reveal Baseball | Sports Reveal Australia 4.85★' },
  { handle: 'gender-reveal-rugby-ball',             newTitle: 'Gender Reveal NRL Rugby Ball | Sports Reveal Australia 4.85★' },
  { handle: 'gender-reveal-afl-ball',               newTitle: 'Gender Reveal AFL Football | Sports Reveal Australia 4.85★' },

  // ── CANNONS — preserve Powder/Confetti specificity ──
  { handle: 'gender-reveal-powder-cannon-australia', newTitle: 'Gender Reveal Powder Cannon XL 50cm | Australia 4.85★ Reviews' },
  { handle: 'gender-reveal-cannons',                newTitle: 'Gender Reveal Confetti & Powder Cannon XL | Australia 4.85★' },
  { handle: 'gender-reveal-confetti-cannons',       newTitle: 'Gender Reveal Confetti Cannon XL 50cm | Australia 4.85★ Reviews' },
  { handle: 'gender-reveal-confetti-cannon-australia', newTitle: '4 Pack Gender Reveal Confetti Cannon XL BIO | Australia 4.85★' },
  { handle: 'gender-reveal-powder-cannon-bundle',   newTitle: '4 Pack Gender Reveal Powder Cannon BIO XL | Australia 4.85★' },

  // ── DECORATIONS (880/mo) ──
  { handle: 'gender-reveal-confetti',               newTitle: 'Gender Reveal Confetti Decorations 120g | Australia 4.85★ Reviews' },
  { handle: 'gender-reveal-decorations',            newTitle: 'Gender Reveal Decoration Set Value | Australia 4.85★ Reviews' },
  { handle: 'gender-reveal-decorations-set',        newTitle: 'Gender Reveal Decoration Set Basic | Australia 4.85★ Reviews' },
  { handle: 'gender-reveal-party-products',         newTitle: 'Gender Reveal Decoration Set Family | Australia 4.85★ Reviews' },

  // ── BACKDROPS / SASH / PROPS ──
  { handle: 'gender-reveal-foil-curtain',           newTitle: 'Gender Reveal Foil Curtain | Party Backdrop Australia 4.85★' },
  { handle: 'gender-reveal-sash',                   newTitle: 'Mum To Be Sash | Gender Reveal & Baby Shower Australia 4.85★' },
  { handle: 'gender-reveal-scratchie',              newTitle: 'Gender Reveal Scratchies 10 Pack | Reveal Game Australia 4.85★' },
  { handle: 'official-gender-reveal-pet-bandana',   newTitle: 'Gender Reveal Dog Bandana | Pet Reveal Australia 4.85★ Reviews' },
  { handle: 'gender-reveal-boy-girl-party-glasses', newTitle: 'Gender Reveal Boy & Girl Party Glasses 20pcs | Australia 4.85★' },
  { handle: 'gender-reveal-pin-the-dummy-game',     newTitle: 'Gender Reveal Pin The Dummy Party Game | Australia 4.85★' },

  // ── ELECTRIC / GENERIC ──
  { handle: 'gender-reveal-electric-card-spray-gun', newTitle: 'Gender Reveal Electric Card Spray Gun | Australia 4.85★ Reviews' },
  { handle: 'gender-reveal-powder',                 newTitle: 'Gender Reveal Powder 200g Net Refill | Pink Blue Australia 4.85★' },

  // ── BALLOON PRODUCTS (real balloons, NOT accessories) ──
  { handle: 'gold-oh-baby-foil-balloons',           newTitle: 'Oh Baby Foil Balloons Gold | Gender Reveal & Baby Shower Australia' },
  { handle: 'baby-balloon-box',                     newTitle: 'Baby Balloon Box | Gender Reveal & Baby Shower Australia 4.85★' },
  { handle: 'boy-girl-gender-reveal-balloons',      newTitle: 'Boy Girl Gender Reveal Foil Air Fill Balloons | Australia 4.85★' },
  { handle: 'gender-reveal-confetti-balloon',       newTitle: 'Custom Mega POP Confetti Gender Reveal Balloon | Australia 4.85★' },
  { handle: 'deluxe-gold-mega-confetti-gender-reveal-balloon', newTitle: 'Deluxe Gold Mega Confetti Gender Reveal Balloon | Australia 4.85★' },

  // ── HIRE ──
  { handle: 'gender-reveal-balloon-garland',        newTitle: 'DIY Hire Gender Reveal Balloon Garland | Australia 4.85★ Reviews' },
  { handle: 'gender-reveal-balloon-box',            newTitle: 'Gender Reveal Helium Balloon Box Hire | Australia 4.85★ Reviews' },
  { handle: 'single-arch-balloon-garland',          newTitle: 'Classic Single or Double Arch Balloon Garland Hire | Australia' },

  // ── BALLOON ACCESSORY (corrected — NOT classed as balloons) ──
  { handle: 'balloon-glue-dots',                    newTitle: 'Balloon Glue Dots 100 Pack | Gender Reveal & Baby Shower Australia' },
]

console.log(`\n=== ${ROLLBACK?'ROLLBACK':'SHIP'} — Curated SEO titles (${CURATED.length} products) ===\n`)

// ROLLBACK
if (ROLLBACK) {
  if (!existsSync(LOG)) { console.error('No log to rollback'); process.exit(1) }
  const log = JSON.parse(readFileSync(LOG,'utf8'))
  let restored = 0
  for (const t of log.updates||[]) {
    const r = await gql(`mutation($input: ProductInput!) {
      productUpdate(input: $input) { product { id } userErrors { field message } }
    }`, { input: { id: t.productId, seo: { title: t.before.seoTitle, description: t.before.seoDescription || '' } } })
    if (t.before.titleTagValue) {
      await gql(`mutation($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) { userErrors { field message } }
      }`, { metafields: [{ ownerId: t.productId, namespace: 'global', key: 'title_tag', type: 'single_line_text_field', value: t.before.titleTagValue }] })
    }
    restored++
    process.stdout.write(`  restored ${restored}/${log.updates.length}\r`)
  }
  console.log(`\n✓ Rolled back ${restored} products`)
  process.exit(0)
}

// SHIP
const audit = { shippedAt: new Date().toISOString(), updates: [] }
let ok = 0, failed = 0, skipped = 0

for (const C of CURATED) {
  // Pull current state
  const cur = await gql(`{
    productByHandle(handle:"${C.handle}") {
      id title status
      seo { title description }
      titleTag: metafield(namespace:"global", key:"title_tag") { id value }
    }
  }`)
  const p = cur.data?.productByHandle
  if (!p) { console.log(`  ⊘ /${C.handle} — not found`); skipped++; continue }
  if (p.status !== 'ACTIVE') { console.log(`  ⊘ /${C.handle} — status ${p.status}`); skipped++; continue }
  // Safety: don't overwrite existing custom SEO title
  if (p.seo?.title || p.titleTag?.value) { console.log(`  ⊘ /${C.handle} — already has custom SEO title, skipping`); skipped++; continue }

  // Update seo.title
  const upd = await gql(`mutation($input: ProductInput!) {
    productUpdate(input: $input) { product { id seo { title } } userErrors { field message } }
  }`, { input: { id: p.id, seo: { title: C.newTitle, description: p.seo?.description || '' } } })
  if (upd.data?.productUpdate?.userErrors?.length) {
    console.log(`  ✗ /${C.handle} seo failed: ${JSON.stringify(upd.data.productUpdate.userErrors)}`)
    failed++; continue
  }

  // Set title_tag metafield
  await gql(`mutation($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) { userErrors { field message } }
  }`, { metafields: [{ ownerId: p.id, namespace: 'global', key: 'title_tag', type: 'single_line_text_field', value: C.newTitle }] })

  audit.updates.push({
    handle: C.handle, productId: p.id,
    before: { seoTitle: p.seo?.title || '', seoDescription: p.seo?.description || '', titleTagValue: p.titleTag?.value || '' },
    after: { seoTitle: C.newTitle, titleTagValue: C.newTitle },
  })
  ok++
  process.stdout.write(`  shipped ${ok}/${CURATED.length}\r`)
  await new Promise(r => setTimeout(r, 250))
}

writeFileSync(LOG, JSON.stringify(audit, null, 2))
console.log(`\n\n━━━ SHIP COMPLETE ━━━`)
console.log(`  ✓ Updated:  ${ok}`)
console.log(`  ⊘ Skipped:  ${skipped}`)
console.log(`  ✗ Failed:   ${failed}`)
console.log(`\n  Snapshot:  ${LOG}`)
console.log(`  Rollback:  node scripts/ship-seo-titles-curated.js --rollback`)
console.log(`\n  GMC sync:        1-2 hours`)
console.log(`  Shopping titles: 2-24 hours`)
console.log(`  Organic SERP:    2-7 days`)
process.exit(0)
