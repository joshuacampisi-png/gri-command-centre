/**
 * v3 — Volume-aware, category-aware, multi-keyword SEO title generator
 *
 * Fixes from v2:
 *  - Preserves product-defining adjectives (Powder, Confetti, Mega, Mini, Burnout)
 *  - Correct category mappings: foil curtain → backdrop, glue dots → accessory,
 *    cake topper → cake topper (6.6k/mo!), sash → mum to be sash (170/mo)
 *  - Baby shower + balloon kit combos lead with "baby shower decorations" (4.4k/mo)
 *  - Balloons vs balloon accessories distinguished
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

// ===== MATRIX V3 — order matters (most specific first) =====
const MATRIX = [
  // BACKDROPS / CURTAINS (was misclassified as balloons in v2)
  { signal: /\bfoil curtain/i, build: p => `Gender Reveal Foil Curtain | Party Backdrop Australia 4.85★`, volume: 210, cat: 'backdrop' },
  { signal: /\bbackdrop/i, build: p => `Gender Reveal Backdrop ${specCount(p)}| Australia 4.85★ Reviews`.replace(/\s+\|/, ' |'), volume: 170, cat: 'backdrop' },

  // CAKE TOPPER (HUGE win — 6,600/mo on "cake topper" + 110/mo GR-specific)
  { signal: /\bcake topper/i, build: p => {
      const colour = matchColour(p) || ''
      return `Cake Topper Gender Reveal & Baby Shower ${colour}| Australia 4.85★`.replace(/\s+\|/, ' |').replace(/\s+/g,' ')
    }, volume: 6600, cat: 'cake_topper' },

  // SASH (170/mo on "mum to be sash")
  { signal: /\bsash|\b(mom|mum) to be/i, build: p => `Mum To Be Sash Gender Reveal | Australia 4.85★ Reviews`, volume: 170, cat: 'sash' },

  // BALLOON ACCESSORIES (NOT balloons — fixed)
  { signal: /\bglue dots/i, build: p => `Balloon Glue Dots | Gender Reveal & Baby Shower Australia`, volume: 30, cat: 'accessory' },

  // PARTY TABLEWARE (low GR volume, but distinct from balloons)
  { signal: /\bplates/i, build: p => `Party Plates Gender Reveal & Baby Shower | Australia 4.85★`, volume: 20, cat: 'tableware' },
  { signal: /\bnapkins/i, build: p => `Party Napkins Gender Reveal & Baby Shower | Australia 4.85★`, volume: 10, cat: 'tableware' },
  { signal: /\bcups\b/i, build: p => `Party Cups Gender Reveal & Baby Shower | Australia 4.85★`, volume: 10, cat: 'tableware' },
  { signal: /\bforks?\b/i, build: p => `Gold Party Forks Gender Reveal & Baby Shower | Australia 4.85★`, volume: 0, cat: 'tableware' },
  { signal: /\bglasses\b/i, build: p => `Gender Reveal Boy & Girl Party Glasses | Australia 4.85★`, volume: 10, cat: 'tableware' },

  // PROPS / GAMES
  { signal: /\bscratchies?\b/i, build: p => `Gender Reveal Scratchies 10 Pack | Australia 4.85★ Reviews`, volume: 20, cat: 'props' },
  { signal: /\bprediction cards?/i, build: p => `Gender Reveal Prediction Cards & Voting | Australia 4.85★`, volume: 10, cat: 'props' },
  { signal: /\bvoting sheet/i, build: p => `Gender Reveal Voting Sheet & Prediction Cards | Australia 4.85★`, volume: 10, cat: 'props' },
  { signal: /\bpin the dummy/i, build: p => `Gender Reveal Pin The Dummy Party Game | Australia 4.85★`, volume: 10, cat: 'props' },
  { signal: /\bbandana|dog\b/i, build: p => `Gender Reveal Dog Bandana | Pet Party Reveal Australia 4.85★`, volume: 30, cat: 'props' },
  { signal: /\bphoto booth/i, build: p => `Gender Reveal Photo Booth Props | Australia 4.85★ Reviews`, volume: 10, cat: 'props' },

  // SPORTS BALLS — preserve sport-specific term
  { signal: /\bgolf\s*ball/i, build: p => `Gender Reveal Golf Ball ${matchColour(p)||''}| Australia 4.85★ Reviews`.replace(/\s+\|/,' |'), volume: 210, cat: 'gr_sport' },
  { signal: /\bsoccer\b/i,   build: p => `Gender Reveal Soccer Ball ${matchColour(p)||''}| Australia 4.85★ Reviews`.replace(/\s+\|/,' |'), volume: 70, cat: 'gr_sport' },
  { signal: /\bfootball\b/i, build: p => `Gender Reveal Football | Australia 4.85★ Reviews`, volume: 90, cat: 'gr_sport' },
  { signal: /\bcricket\b/i,  build: p => `Gender Reveal Cricket Ball | Australia 4.85★ Reviews`, volume: 20, cat: 'gr_sport' },
  { signal: /\bbasketball\b/i, build: p => `Gender Reveal Basketball | Australia 4.85★ Reviews`, volume: 10, cat: 'gr_sport' },
  { signal: /\brugby\b|\bNRL\b/i, build: p => `Gender Reveal Rugby Ball NRL | Australia 4.85★ Reviews`, volume: 10, cat: 'gr_sport' },
  { signal: /\bAFL\b|\bbaseball\b|\bNFL\b/i, build: p => {
      const sport = (p.title.match(/\b(AFL|NFL|Baseball)\b/i)||[])[1] || 'Sports'
      return `Gender Reveal ${sport} Ball | Australia 4.85★ Reviews`
    }, volume: 20, cat: 'gr_sport' },

  // EXTINGUISHER / BLASTER (170/mo)
  { signal: /\bfire\s*extinguisher/i, build: p => `Gender Reveal Fire Extinguisher ${megaMini(p)}| Australia 4.85★`.replace(/\s+\|/,' |'), volume: 110, cat: 'gr_ext' },
  { signal: /\bextinguisher\b/i, build: p => `Gender Reveal Extinguisher ${megaMini(p)}| Australia 4.85★ Reviews`.replace(/\s+\|/,' |'), volume: 170, cat: 'gr_ext' },
  { signal: /\bblaster\b/i, build: p => `Gender Reveal Powder Blaster ${megaMini(p)}| Australia 4.85★`.replace(/\s+\|/,' |'), volume: 20, cat: 'gr_blaster' },

  // SMOKE BOMBS (880/mo)
  { signal: /\bsmoke bomb/i, build: p => {
      const colour = matchColour(p) || ''
      const pack = matchPack(p) || ''
      return `Gender Reveal Smoke Bombs ${pack}${colour}| Australia 4.85★`.replace(/\s+\|/,' |').replace(/\s+/g,' ')
    }, volume: 880, cat: 'gr_smoke' },
  { signal: /\bsmoke\b/i, build: p => `Gender Reveal Smoke ${megaMini(p)}| Australia 4.85★ Reviews`.replace(/\s+\|/,' |'), volume: 210, cat: 'gr_smoke' },

  // BURNOUT (70/mo)
  { signal: /\bburnout\b/i, build: p => `Gender Reveal Burnout Powder ${matchColour(p)||''}${megaMini(p)}| Australia 4.85★`.replace(/\s+\|/,' |'), volume: 70, cat: 'gr_burnout' },

  // CANNONS — preserve Powder vs Confetti specificity
  { signal: /\bpowder\s*cannon|powder\s*XL/i, build: p => {
      const pack = matchPack(p) || ''
      const colour = matchColour(p) || ''
      return `Gender Reveal Powder Cannon ${pack}${colour}| Australia 4.85★`.replace(/\s+\|/,' |').replace(/\s+/g,' ')
    }, volume: 70, cat: 'gr_cannon_powder' },
  { signal: /\bconfetti\s*cannon/i, build: p => {
      const pack = matchPack(p) || ''
      return `Gender Reveal Confetti Cannon ${pack}| Australia 4.85★ Reviews`.replace(/\s+\|/,' |').replace(/\s+/g,' ')
    }, volume: 260, cat: 'gr_cannon_confetti' },
  { signal: /\bcannon\b/i, build: p => {
      const pack = matchPack(p) || ''
      return `Gender Reveal Cannon ${pack}| Australia 4.85★ Reviews`.replace(/\s+\|/,' |').replace(/\s+/g,' ')
    }, volume: 480, cat: 'gr_cannon' },

  // BABY SHOWER + BALLOON KIT (CROSSOVER — 4,400/mo on "baby shower decorations")
  { signal: /\bbaby shower.*balloon|balloon.*baby shower/i, build: p => {
      const pieces = (p.title.match(/(\d+)\s*piece/i)||[])[1]
      return `${pieces?pieces+' Piece ':''}Gender Reveal & Baby Shower Balloon Kit | Australia 4.85★`.replace(/\s+/g,' ')
    }, volume: 4400, cat: 'gr_bs_balloon_kit' },

  // BABY SHOWER (other)
  { signal: /\bbaby shower\b/i, build: p => `Gender Reveal & Baby Shower ${productCore(p)}| Australia 4.85★`.replace(/\s+\|/,' |'), volume: 4400, cat: 'baby_shower' },

  // BALLOONS (real balloons, distinguished from accessories)
  { signal: /\b(helium|latex|foil)\s*balloon/i, build: p => `Gender Reveal Balloons ${matchColour(p)||''}${matchPack(p)||''}| Australia 4.85★`.replace(/\s+\|/,' |').replace(/\s+/g,' '), volume: 1600, cat: 'gr_balloon' },
  { signal: /\bballoon kit/i, build: p => {
      const pieces = (p.title.match(/(\d+)\s*piece/i)||[])[1]
      return `${pieces?pieces+' Piece ':''}Gender Reveal Balloon Kit | Australia 4.85★`.replace(/\s+/g,' ')
    }, volume: 20, cat: 'gr_balloon_kit' },
  { signal: /\bballoon\b/i, build: p => `Gender Reveal Balloons ${matchColour(p)||''}| Australia 4.85★ Reviews`.replace(/\s+\|/,' |').replace(/\s+/g,' '), volume: 1600, cat: 'gr_balloon' },
  { signal: /\bgarland\b/i, build: p => `Gender Reveal Balloon Garland | Australia 4.85★ Reviews`, volume: 10, cat: 'gr_balloon' },

  // DECORATIONS GENERIC (880/mo)
  { signal: /\bdecorations?\b/i, build: p => `Gender Reveal Decorations ${productCore(p)}| Australia 4.85★`.replace(/\s+\|/,' |'), volume: 880, cat: 'gr_decor' },

  // BUNDLES / KITS / PACKS
  { signal: /\bbundle|pack|kit/i, build: p => {
      const pack = matchPack(p) || ''
      return `Gender Reveal Bundle ${pack}| Australia 4.85★ Reviews`.replace(/\s+\|/,' |').replace(/\s+/g,' ')
    }, volume: 10, cat: 'gr_bundle' },

  // TNT / HIRE
  { signal: /\bTNT\b/i, build: p => `TNT Gender Reveal Self Hire Kit | Australia Gold Coast`, volume: 210, cat: 'tnt_hire' },
  { signal: /\bself hire/i, build: p => `Gender Reveal Self Hire Kit | Australia Gold Coast Dispatch`, volume: 20, cat: 'hire' },
  { signal: /\bhire\b/i, build: p => `Gender Reveal Hire | Australia Same Day Dispatch`, volume: 20, cat: 'hire' },

  // ELECTRIC SPRAY GUN
  { signal: /\belectric.*spray|spray gun|electric.*card/i, build: p => `Gender Reveal Electric Water Gun | Australia 4.85★ Reviews`, volume: 10, cat: 'gr_electric' },

  // POWDER (generic gender reveal powder refill)
  { signal: /\bpowder\b/i, build: p => `Gender Reveal Powder Refill ${matchColour(p)||''}| Australia 4.85★`.replace(/\s+\|/,' |').replace(/\s+/g,' '), volume: 20, cat: 'gr_powder' },

  // THEMED — use balloon volume (590/mo for paw patrol balloons)
  { signal: /\bpaw[\s-]?patrol\b/i, build: p => {
      const char = (p.title.match(/\b(Chase|Rubble|Marshall|Skye|Rocky|Zuma|Everest)\b/)||[])[1] || ''
      return `Paw Patrol ${char} Foil Balloon Set | Birthday Party Australia`.replace(/\s+/g,' ')
    }, volume: 590, cat: 'themed_pawpatrol' },
  { signal: /\bmario\b/i, build: p => `Super Mario Party Decorations & Balloons | Birthday Australia`, volume: 210, cat: 'themed_mario' },
  { signal: /\btoy[\s-]?story\b/i, build: p => `Toy Story Birthday Party Set & Decorations | Australia`, volume: 90, cat: 'themed_toystory' },
  { signal: /\bspider[\s-]?man\b/i, build: p => `Spider-Man Birthday Party Balloons & Decorations | Australia`, volume: 50, cat: 'themed_spiderman' },
  { signal: /\bfrozen\b/i, build: p => `Frozen Birthday Party Balloons & Decorations | Australia`, volume: 50, cat: 'themed_frozen' },
  { signal: /\bbluey\b/i, build: p => `Bluey Birthday Party Balloons & Decorations | Australia`, volume: 100, cat: 'themed_bluey' },
  { signal: /\bpok[ée]mon|pok[ée]\s*ball/i, build: p => `Gender Reveal Pokémon Poké Ball 2 Pack | Australia 4.85★`, volume: 20, cat: 'gr_themed_pokemon' },
]

// ===== HELPERS =====
function matchColour(p) {
  const m = p.title.match(/\b(Pink\s*\/\s*Blue|Pink\s*Blue|Pink|Blue|Green|Red|Black|White|Gold|Silver|Mixed)\b/i)
  return m ? m[1].replace(/\s*\/\s*/g,' ') + ' ' : ''
}
function matchPack(p) {
  const m = p.title.match(/\b(\d+\s*(?:Pack|x\s*Pack|Piece))\b/i)
  return m ? m[1] + ' ' : ''
}
function megaMini(p) {
  const m = p.title.match(/\b(Mega|Mini|XL|XXL|Jumbo|Quad|Double)\b/i)
  return m ? m[1] + ' ' : ''
}
function specCount(p) {
  return ''
}
function productCore(p) {
  // Strip common prefixes/suffixes and return key product noun
  const t = clean(p.title).replace(/\bgender reveal\b/gi,'').replace(/\bbaby shower\b/gi,'').replace(/\bbundle\b/gi,'').replace(/\bkit\b/gi,'').replace(/\bset\b/gi,'').replace(/\s+/g,' ').trim()
  return t.split(/\s+/).slice(0, 3).join(' ') + ' '
}
function clean(s) {
  return (s||'').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu,'').replace(/\$\d+/g,'').replace(/\s+/g,' ').trim()
}
function trimTo(s, max=70) {
  if (s.length <= max) return s
  return s.slice(0, max).replace(/\s+\S*$/,'').replace(/\s*\|\s*$/,'').trim()
}

function genTitle(p) {
  const title = clean(p.title)
  const handle = p.handle || ''
  const matches = []
  for (const m of MATRIX) {
    if (m.signal.test(title) || m.signal.test(handle)) matches.push(m)
  }
  if (!matches.length) {
    return { keyword: '(no match)', title: trimTo(`${title} | Australia 4.85★ Reviews`), volume: 0, category: 'no_match' }
  }
  // Prefer first match (which is most specific given matrix order)
  // BUT: if multiple match with higher volume, weight by volume × specificity (first-match bonus = 2x)
  let best = matches[0]
  for (let i = 1; i < matches.length; i++) {
    if (matches[i].volume > best.volume * 2) { best = matches[i] }
  }
  const built = best.build(p).replace(/\s+/g,' ').trim()
  return { keyword: built.split('|')[0].trim(), title: trimTo(built), volume: best.volume, category: best.cat }
}

// ===== MAIN =====
const Q = `query($cursor: String) {
  products(first: 100, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    edges { node {
      id handle title status
      seo { title }
      titleTag: metafield(namespace:"global", key:"title_tag") { value }
    }}
  }
}`
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

console.log(`\n=== V3 TITLE GENERATION ===\n`)
console.log(`Active: ${active.length} | Blank seo.title: ${blanks.length}\n`)

const proposals = blanks.map(p => ({
  handle: p.handle, productTitle: p.title, id: p.id, ...genTitle(p),
}))

// Score impact: volume × estimated organic position headroom
for (const p of proposals) {
  p.impactScore = (p.volume || 0)
}
const ranked = proposals.slice().sort((a,b) => b.impactScore - a.impactScore)

console.log(`━━━ TOP 40 BY VOLUME IMPACT — these get shipped ━━━\n`)
for (const p of ranked.slice(0, 40)) {
  console.log(`[${p.category}] vol=${p.volume}`)
  console.log(`  /${p.handle}`)
  console.log(`  old: "${p.productTitle.slice(0,80)}"`)
  console.log(`  NEW: "${p.title}" (${p.title.length}c)`)
  console.log('')
}

const byCat = {}
for (const p of proposals) {
  byCat[p.category] = (byCat[p.category]||0) + 1
}
console.log(`━━━ CATEGORY DISTRIBUTION ━━━`)
for (const [c, n] of Object.entries(byCat).sort((a,b)=>b[1]-a[1])) console.log(`  ${c.padEnd(28)} ${n}`)

mkdirSync('data/snapshots/seo-title-proposals-v3', { recursive: true })
writeFileSync('data/snapshots/seo-title-proposals-v3/proposals.json', JSON.stringify({
  generatedAt: new Date().toISOString(),
  totalBlanks: blanks.length,
  proposals,
  rankedByImpact: ranked.map(p => ({ handle: p.handle, productTitle: p.productTitle, newTitle: p.title, volume: p.volume, category: p.category, impactScore: p.impactScore })),
}, null, 2))
console.log(`\nFull data: data/snapshots/seo-title-proposals-v3/proposals.json`)
console.log(`\nNext: run ship-seo-titles.js to push top N`)
process.exit(0)
