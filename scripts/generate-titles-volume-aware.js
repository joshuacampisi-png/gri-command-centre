/**
 * Volume-aware SEO title generator
 * Uses real AU monthly search volume from data/snapshots/keyword-research/au-volume.json
 *
 * For each product:
 *  1. Detect all matching product-type signals
 *  2. Pick highest-volume keyword that fits the product
 *  3. Build title: [exact buyer-intent keyword] + [variant/spec] | Australia 4.85★ Reviews
 *  4. ≤70 chars (research-confirmed mobile truncation cap)
 *
 * Only touches products with EMPTY seo.title AND empty title_tag metafield
 */
import 'dotenv/config'
import { writeFileSync, mkdirSync } from 'fs'

const SHOP = process.env.SHOPIFY_STORE_DOMAIN || 'bdd19a-3.myshopify.com'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const URL = `https://${SHOP}/admin/api/2026-01/graphql.json`

async function gql(query, variables = {}) {
  const r = await fetch(URL, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  return r.json()
}

// ===== KEYWORD MATRIX (real AU volume from research) =====
// Order: most specific first, falls through to broader if no match
// Each entry: { signal regex → primary keyword to lead title with, volume, category }
const KEYWORD_MATRIX = [
  // SPORTS BALLS — high specificity
  { signal: /\bgolf\s*ball/i,       primary: 'Gender Reveal Golf Ball',       volume: 210, cat: 'gr_sport' },
  { signal: /\bfootball\b/i,         primary: 'Gender Reveal Football',        volume: 90,  cat: 'gr_sport' },
  { signal: /\bsoccer\b/i,           primary: 'Gender Reveal Soccer Ball',     volume: 70,  cat: 'gr_sport' },
  { signal: /\bcricket\b/i,          primary: 'Gender Reveal Cricket Ball',    volume: 20,  cat: 'gr_sport' },
  { signal: /\bbasketball\b/i,       primary: 'Gender Reveal Basketball',      volume: 10,  cat: 'gr_sport' },
  { signal: /\brugby\b/i,            primary: 'Gender Reveal Rugby Ball',      volume: 10,  cat: 'gr_sport' },
  { signal: /\bNRL\b/i,              primary: 'Gender Reveal NRL Rugby Ball',  volume: 10,  cat: 'gr_sport' },
  // PRODUCT CORE — gender reveal specific
  { signal: /\bfire\s*extinguisher/i,primary: 'Gender Reveal Fire Extinguisher', volume: 110, cat: 'gr_ext' },
  { signal: /\bextinguisher\b/i,     primary: 'Gender Reveal Extinguisher',    volume: 170, cat: 'gr_ext' },
  { signal: /\b(mega|mini)\s*blaster/i, primary: 'Gender Reveal Powder Blaster', volume: 20, cat: 'gr_blaster' },
  { signal: /\bblaster\b/i,          primary: 'Gender Reveal Blaster',         volume: 20,  cat: 'gr_blaster' },
  { signal: /\bsmoke\s*bombs?\b/i,   primary: 'Gender Reveal Smoke Bombs',     volume: 880, cat: 'gr_smoke' },
  { signal: /\bburnout\b/i,          primary: 'Gender Reveal Burnout Powder',  volume: 70,  cat: 'gr_burnout' },
  { signal: /\bconfetti\s*cannon/i,  primary: 'Gender Reveal Confetti Cannon', volume: 260, cat: 'gr_cannon_confetti' },
  { signal: /\bpowder\s*cannon|powder XL cannon/i, primary: 'Gender Reveal Powder Cannon', volume: 70, cat: 'gr_cannon_powder' },
  { signal: /\bcannon\b/i,           primary: 'Gender Reveal Cannon',          volume: 480, cat: 'gr_cannon' },
  // BUNDLES / KITS
  { signal: /\b(bundle|pack|kit)\b/i, primary: 'Gender Reveal Bundle',         volume: 10,  cat: 'gr_bundle' },
  // BALLOONS — gender reveal first
  { signal: /\bballoon\s*kit/i,      primary: 'Gender Reveal Balloon Kit',     volume: 20,  cat: 'gr_balloon' },
  { signal: /\b(helium|balloon|foil)\b/i, primary: 'Gender Reveal Balloons',   volume: 1600, cat: 'gr_balloon' },
  { signal: /\bgarland\b/i,          primary: 'Gender Reveal Balloon Garland', volume: 10,  cat: 'gr_balloon' },
  // GENERIC GR
  { signal: /\bdecorations?\b/i,     primary: 'Gender Reveal Decorations',     volume: 880, cat: 'gr_decor' },
  // HIRE / TNT
  { signal: /\bTNT\b/i,              primary: 'TNT Gender Reveal Self Hire',   volume: 210, cat: 'tnt_hire' },
  { signal: /\bhire\b/i,             primary: 'Gender Reveal Hire',            volume: 20,  cat: 'hire' },
  // THEMED BRANDS
  { signal: /\bpaw[\s-]?patrol\b/i,  primary: 'Paw Patrol Balloons',           volume: 590, cat: 'themed_pawpatrol' },
  { signal: /\bmario\b/i,            primary: 'Super Mario Party Decorations', volume: 210, cat: 'themed_mario' },
  { signal: /\btoy[\s-]?story\b/i,   primary: 'Toy Story Birthday',            volume: 90,  cat: 'themed_toystory' },
  { signal: /\bspider[\s-]?man\b/i,  primary: 'Spider-Man Birthday Balloons',  volume: 50,  cat: 'themed_spiderman' },
  { signal: /\bfrozen\b/i,           primary: 'Frozen Birthday Balloons',      volume: 50,  cat: 'themed_frozen' },
  { signal: /\bbluey\b/i,            primary: 'Bluey Birthday Balloons',       volume: 100, cat: 'themed_bluey' },
  { signal: /\bpok[ée]mon\b/i,       primary: 'Gender Reveal Pokémon',         volume: 20,  cat: 'gr_themed' },
]

// ===== VARIANT/SPEC EXTRACTION =====
function extractSpec(productTitle) {
  const t = productTitle
  // Colour
  const colourMatch = t.match(/\b(Pink\s*\/\s*Blue|Pink\s*Blue|Pink|Blue|Green|Red|Black|White|Gold|Silver|Mixed)\b/i)
  // Size / variant count
  const packMatch = t.match(/\b(\d+\s*(?:Pack|x\s*Bundle|x\s*Pack|Piece))\b/i)
  const sizeMatch = t.match(/\b(XL|XXL|Mega|Mini|Large|Small|Jumbo|\d+(?:cm|mm|kg|g|ml|L))\b/i)
  // Twin
  const twinMatch = /\btwins?\b/i.test(t) ? 'Twins' : null
  const parts = []
  if (packMatch) parts.push(packMatch[1])
  if (sizeMatch) parts.push(sizeMatch[1])
  if (twinMatch) parts.push(twinMatch)
  if (colourMatch) parts.push(colourMatch[1].replace(/\s*\/\s*/g, ' '))
  return parts.join(' ').trim()
}

// ===== TITLE BUILDER =====
function clean(s) {
  return (s||'').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu,'').replace(/\$\d+/g,'').replace(/\s+/g,' ').trim()
}
function trimTo(s, max=70) {
  if (s.length <= max) return s
  const trimmed = s.slice(0, max)
  const lastPipe = trimmed.lastIndexOf('|')
  const lastSpace = trimmed.lastIndexOf(' ')
  return trimmed.slice(0, Math.max(lastPipe, lastSpace)).replace(/\s*\|\s*$/,'').trim()
}

function pickKeyword(product) {
  const t = clean(product.title)
  const h = product.handle || ''
  // Match multiple, pick highest volume
  const matches = []
  for (const k of KEYWORD_MATRIX) {
    if (k.signal.test(t) || k.signal.test(h)) matches.push(k)
  }
  if (!matches.length) return null
  matches.sort((a,b) => b.volume - a.volume)
  return matches[0]
}

function genTitle(product) {
  const kw = pickKeyword(product)
  const spec = extractSpec(product.title)
  if (!kw) {
    // No match — use original title + trust
    return { keyword: '(no match)', title: trimTo(`${clean(product.title)} | Australia 4.85★ Reviews`) }
  }
  // Build: [Primary Keyword] [Spec] | Australia 4.85★ Reviews
  let title = kw.primary
  if (spec) title = `${kw.primary} ${spec}`
  let full = `${title} | Australia 4.85★ Reviews`
  if (full.length > 70) full = `${title} | Australia 4.85★`
  if (full.length > 70) full = `${title} | Australia`
  if (full.length > 70) full = trimTo(title + ' | Australia', 70)
  return { keyword: kw.primary, volume: kw.volume, category: kw.cat, title: full }
}

// ===== MAIN =====
const Q = `query($cursor: String) {
  products(first: 100, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    edges { node {
      id handle title status tags
      seo { title }
      titleTag: metafield(namespace:"global", key:"title_tag") { value }
    }}
  }
}`

console.log(`\n=== VOLUME-AWARE SEO TITLE GENERATION ===\n`)
let all = [], cursor = null, hasNext = true
while (hasNext) {
  const r = await gql(Q, { cursor })
  if (r.errors) { console.error('GQL err:', JSON.stringify(r.errors)); break }
  all.push(...(r.data?.products?.edges?.map(e => e.node) || []))
  hasNext = r.data?.products?.pageInfo?.hasNextPage
  cursor = r.data?.products?.pageInfo?.endCursor
}
const active = all.filter(p => p.status === 'ACTIVE')
const blanks = active.filter(p => !(p.seo?.title) && !(p.titleTag?.value))
console.log(`${all.length} total, ${active.length} active, ${blanks.length} with empty seo.title`)

const proposals = blanks.map(p => ({
  handle: p.handle,
  productTitle: p.title,
  ...genTitle(p),
}))

// Group by category for summary
const byCat = {}
for (const p of proposals) {
  const c = p.category || 'no_match'
  if (!byCat[c]) byCat[c] = []
  byCat[c].push(p)
}

console.log(`\n━━━ CATEGORY BREAKDOWN (volume-driven) ━━━\n`)
for (const [c, list] of Object.entries(byCat).sort((a,b)=>b[1].length-a[1].length)) {
  const vol = list[0]?.volume || 0
  console.log(`  ${c.padEnd(28)} ${list.length} products  | top keyword: "${list[0]?.keyword}" (${vol}/mo)`)
}

console.log(`\n━━━ FIRST 30 PROPOSED CHANGES — eye check ━━━\n`)
for (const p of proposals.slice(0, 30)) {
  console.log(`/${p.handle}`)
  console.log(`  original: "${p.productTitle}"`)
  console.log(`  NEW SEO:  "${p.title}" (${p.title.length}c) — KW "${p.keyword}" ${p.volume?`(${p.volume}/mo)`:''}`)
  console.log('')
}

console.log(`━━━ POTENTIAL NO-MATCH ITEMS (need manual review) ━━━\n`)
for (const p of proposals.filter(x => x.keyword === '(no match)')) {
  console.log(`  /${p.handle}  →  "${p.productTitle}"`)
}

mkdirSync('data/snapshots/seo-title-proposals-v2', { recursive: true })
writeFileSync('data/snapshots/seo-title-proposals-v2/proposals.json', JSON.stringify({
  generatedAt: new Date().toISOString(),
  totalProposals: proposals.length,
  byCategory: Object.fromEntries(Object.entries(byCat).map(([k,v]) => [k, v.length])),
  proposals,
}, null, 2))
console.log(`\nFull data: data/snapshots/seo-title-proposals-v2/proposals.json`)
console.log(`Nothing pushed yet.`)
process.exit(0)
