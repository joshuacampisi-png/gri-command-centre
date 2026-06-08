/**
 * Generate buyer-intent SEO titles for products with EMPTY seo.title
 *
 * NEVER overwrites existing custom titles. Pure additive.
 *
 * Buyer-intent rules:
 *  - Primary keyword in first 30 chars (matches actual buyer query)
 *  - 1+ trust signal (Australia / 4.85★ / Same Day / Free Shipping)
 *  - ≤65 chars total (Google SERP truncation guard)
 *  - Category-aware (don't force "gender reveal" on Paw Patrol)
 *  - No emoji, no price, no ALL CAPS, no fluff
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

const Q = `query($cursor: String) {
  products(first: 100, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    edges { node {
      id handle title productType vendor status tags
      seo { title description }
      titleTag: metafield(namespace:"global", key:"title_tag") { value }
      collections(first: 10) { edges { node { handle title } } }
    }}
  }
}`

console.log('\n=== GENERATING SEO TITLES FOR BLANK PRODUCTS ===\n')
console.log('Fetching all products...')

let all = [], cursor = null, hasNext = true
while (hasNext) {
  const r = await gql(Q, { cursor })
  if (r.errors) { console.error('GQL err:', JSON.stringify(r.errors)); break }
  all.push(...(r.data?.products?.edges?.map(e => e.node) || []))
  hasNext = r.data?.products?.pageInfo?.hasNextPage
  cursor = r.data?.products?.pageInfo?.endCursor
  process.stdout.write(`  fetched ${all.length}\r`)
}
console.log(`\nTotal: ${all.length}`)

const active = all.filter(p => p.status === 'ACTIVE')
console.log(`Active: ${active.length}`)

// Filter to BLANK seo.title AND BLANK title_tag metafield
const blanks = active.filter(p => !(p.seo?.title) && !(p.titleTag?.value))
console.log(`With empty seo.title AND empty title_tag MF: ${blanks.length}`)

// CATEGORISATION
const THEMED_BRANDS = [
  { match: /paw[\s-]?patrol/i, brand: 'Paw Patrol' },
  { match: /toy[\s-]?story/i, brand: 'Toy Story' },
  { match: /super[\s-]?mario|mario/i, brand: 'Super Mario' },
  { match: /pokemon|pok[ée]/i, brand: 'Pokémon' },
  { match: /spider[\s-]?man/i, brand: 'Spider-Man' },
  { match: /frozen/i, brand: 'Frozen' },
  { match: /minecraft/i, brand: 'Minecraft' },
  { match: /bluey/i, brand: 'Bluey' },
]
const HIRE_TOKENS = ['hire','self hire','self-hire','tnt']
const PARTY_GENERIC_TOKENS = ['glue dots','foil','garland','plates','napkins','forks','cutlery','cake topper','straws','tablecloth','table cloth']

function categorise(p) {
  const title = (p.title||'').toLowerCase()
  const handle = (p.handle||'').toLowerCase()
  const tagText = (p.tags||[]).join(' ').toLowerCase()
  const colls = (p.collections?.edges||[]).map(e=>e.node.handle).join(' ').toLowerCase()

  const GR_RE = /\b(gender[\s-]?reveal|reveal cannon|reveal smoke|reveal extinguisher|reveal blaster|reveal bundle|reveal powder)\b/i
  // PRIMARY signal = product title or handle (intent the seller assigned to the product)
  const titleSaysGR = GR_RE.test(title) || GR_RE.test(handle)
  // Secondary signal = tags/collections only
  const tagsSaysGR = GR_RE.test(tagText) || GR_RE.test(colls)

  const HIRE_RE = /\b(hire|self[\s-]?hire|tnt[\s-]?gender)\b/i
  const isHire = HIRE_RE.test(title) || HIRE_RE.test(handle)

  // Themed brand detected anywhere
  let titleThemedBrand = null
  for (const tb of THEMED_BRANDS) {
    if (tb.match.test(title) || tb.match.test(handle)) { titleThemedBrand = tb.brand; break }
  }

  // PRIORITY 1: Hire
  if (isHire) return { cat: 'hire', brand: titleThemedBrand, reason: 'title/handle has hire token' }

  // PRIORITY 2: Themed brand in TITLE/HANDLE wins over tag-only GR signal
  // Birthday Paw Patrol product shouldn't be reclassified as GR just because it's in a related collection
  if (titleThemedBrand && !titleSaysGR) {
    return { cat: 'themed', brand: titleThemedBrand, reason: 'themed brand in title, no GR in title' }
  }

  // PRIORITY 3: Gender Reveal — title says so, OR clearly a GR product per all signals
  if (titleSaysGR) return { cat: 'gender_reveal', brand: titleThemedBrand, reason: 'GR in title' }
  if (tagsSaysGR && !titleThemedBrand) return { cat: 'gender_reveal', brand: null, reason: 'GR in tags, no themed brand' }

  // PRIORITY 4: Themed (theme brand only, no GR anywhere)
  if (titleThemedBrand) return { cat: 'themed', brand: titleThemedBrand, reason: 'themed brand only' }

  // PRIORITY 5: Generic party
  if (PARTY_GENERIC_TOKENS.some(tok => title.includes(tok))) return { cat: 'generic_party', brand: null, reason: 'party token in title' }

  return { cat: 'unknown', brand: null, reason: 'no signals matched' }
}

// TITLE GENERATORS
function titleCase(s) { return s.replace(/\w\S*/g, t => t[0].toUpperCase() + t.slice(1).toLowerCase()).replace(/\b(And|Or|For|With|The|A|An|Of|In|On|At|To|By)\b/g, m => m.toLowerCase()) }
function clean(s) {
  return (s||'').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu,'').replace(/\$\d+/g,'').replace(/\s+/g,' ').trim()
}
function trimTo(s, max=65) {
  if (s.length <= max) return s
  // Trim at last clean break
  const trimmed = s.slice(0, max)
  const lastPipe = trimmed.lastIndexOf('|')
  const lastSpace = trimmed.lastIndexOf(' ')
  return trimmed.slice(0, Math.max(lastPipe, lastSpace)).replace(/\s*\|\s*$/,'').trim()
}

// Strip ALL instances of "gender reveal" anywhere in the string, keeping rest
function stripAllGenderReveal(s) {
  return s
    .replace(/\bgender[\s-]?reveal\b/gi, '')   // remove anywhere
    .replace(/[\s\/]{2,}/g, ' ')                // collapse double spaces/slashes
    .replace(/^\W+|\W+$/g, '')                  // trim leading/trailing punctuation
    .replace(/\s+/g, ' ')
    .trim()
}

function genTitle(p, c) {
  const baseTitle = clean(p.title)

  switch (c.cat) {
    case 'gender_reveal': {
      // Pattern: "Gender Reveal [Product] | Australia 4.85★ Reviews"
      // Strip ALL gender reveal mentions from base, then prepend once
      const core = stripAllGenderReveal(baseTitle) || baseTitle
      let t = `Gender Reveal ${core} | Australia 4.85★ Reviews`
      // If too long, try shorter trust signal
      if (t.length > 65) t = `Gender Reveal ${core} | Australia 4.85★`
      if (t.length > 65) t = `Gender Reveal ${core} | Australia`
      return trimTo(t, 65)
    }
    case 'themed': {
      // Pattern: "[Theme] [Product] | Birthday Party | Australia"
      let t = `${baseTitle} | Birthday Party Decor | Australia Same Day`
      if (t.length > 65) t = `${baseTitle} | Birthday Party | Australia Same Day`
      if (t.length > 65) t = `${baseTitle} | Birthday Party | Australia`
      return trimTo(t, 65)
    }
    case 'hire': {
      // Pattern: "[Product] Hire | Australia Same Day Dispatch"
      const hireBase = baseTitle.replace(/\s*\bhire\b\s*/gi, ' ').replace(/\s+/g,' ').trim()
      let t = `${hireBase} Hire | Australia Same Day Dispatch`
      if (t.length > 65) t = `${hireBase} Hire | Australia Same Day`
      if (t.length > 65) t = `${hireBase} Hire | Australia`
      return trimTo(t, 65)
    }
    case 'generic_party': {
      let t = `${baseTitle} | Party Supplies Australia | Same Day Dispatch`
      if (t.length > 65) t = `${baseTitle} | Party Supplies | Australia`
      return trimTo(t, 65)
    }
    case 'unknown':
    default: {
      let t = `${baseTitle} | Australia 4.85★ Reviews`
      if (t.length > 65) t = `${baseTitle} | Australia`
      return trimTo(t, 65)
    }
  }
}

// RUN
const proposed = []
const byCategory = { gender_reveal:[], themed:[], hire:[], generic_party:[], unknown:[] }
for (const p of blanks) {
  const c = categorise(p)
  const newTitle = genTitle(p, c)
  const entry = { handle: p.handle, productTitle: p.title, category: c.cat, brand: c.brand, proposedSeoTitle: newTitle, proposedLength: newTitle.length }
  proposed.push(entry)
  byCategory[c.cat].push(entry)
}

console.log(`\n━━━ CATEGORIES ━━━`)
for (const [cat, list] of Object.entries(byCategory)) {
  console.log(`  ${cat.padEnd(15)} ${list.length}`)
}

console.log(`\n━━━ SAMPLE — 3 per category (manual eye-check before push) ━━━\n`)
for (const [cat, list] of Object.entries(byCategory)) {
  if (!list.length) continue
  console.log(`\n[${cat.toUpperCase()}]`)
  for (const e of list.slice(0,3)) {
    console.log(`  /${e.handle}`)
    console.log(`    product.title:  ${e.productTitle}`)
    console.log(`    NEW seo.title:  "${e.proposedSeoTitle}" (${e.proposedLength}c)`)
  }
}

console.log(`\n━━━ UNKNOWNS (need manual review) ━━━\n`)
for (const e of byCategory.unknown) {
  console.log(`  /${e.handle}`)
  console.log(`    "${e.productTitle}"`)
  console.log(`    fallback proposed: "${e.proposedSeoTitle}"`)
}

mkdirSync('data/snapshots/seo-title-proposals', { recursive: true })
writeFileSync('data/snapshots/seo-title-proposals/proposals.json', JSON.stringify({
  generatedAt: new Date().toISOString(),
  totalActive: active.length,
  withBlanks: blanks.length,
  byCategory: Object.fromEntries(Object.entries(byCategory).map(([k,v]) => [k, v.length])),
  proposals: proposed,
}, null, 2))
console.log(`\nFull proposals: data/snapshots/seo-title-proposals/proposals.json`)
console.log(`\nNothing shipped yet. Review then say 'ship the seo titles' to push.`)
process.exit(0)
