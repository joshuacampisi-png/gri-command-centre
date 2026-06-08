/**
 * Add internal product/collection links, cross-blog links, external authority links,
 * and E-E-A-T author/date line to all 4 blogs.
 */
import 'dotenv/config'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const REST = 'https://bdd19a-3.myshopify.com/admin/api/2026-01'
async function rest(p,o={}){const r=await fetch(`${REST}${p}`,{...o,headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json',...(o.headers||{})}});return r.json()}

const blogs = await rest('/blogs.json')
const blog = blogs.blogs.find(b => b.handle === 'news')

const BASE = 'https://genderrevealideas.com.au'
const PRODUCT = (h) => `${BASE}/products/${h}`
const BLOG_URL = (h) => `${BASE}/blogs/news/${h}`

// Cross-blog handles
const HANDLES = {
  diy: 'diy-gender-reveal-australia-18-ideas',
  photoshoot: 'gender-reveal-photoshoot-australia-guide',
  vsShower: 'gender-reveal-vs-baby-shower-australian-guide',
  whatIs: 'what-is-a-gender-reveal-party-australian-guide',
  perth: 'gender-reveal-perth-ultimate-guide-2026',
}

const EEAT = `<p style="font-size:13px;color:#888;margin:0 0 28px;padding-bottom:16px;border-bottom:1px solid #f0f0f0">
  By the <strong style="color:#555">Gender Reveal Ideas Australia</strong> team ·
  Last updated: 24 May 2026 ·
  Backed by 7,350+ verified Google reviews and 70,000+ Australian families
</p>`

// Replacement format: [phraseInBody, htmlReplacement, maxReplacements (default 1)]
// Using carefully chosen phrases unique to each blog.

const BLOGS_LINK_PLAN = [
  // ============ BLOG 1 — DIY ============
  {
    id: 566587752537, name: 'DIY',
    insertEeatAfter: '<p class="subtitle">',
    replacements: [
      // Product links (first-occurrence only)
      ['a $35 gender reveal cannon', `a <a href="${PRODUCT('gender-reveal-cannons')}">$35 gender reveal cannon</a>`],
      ['Mega Blaster Powder Extinguisher', `<a href="${PRODUCT('gender-reveal-extinguisher-australia')}">Mega Blaster Powder Extinguisher</a>`],
      ['Bio Cannons', `<a href="${PRODUCT('gender-reveal-cannons')}">Bio Cannons</a>`],
      ['TNT Self Hire setup', `<a href="${PRODUCT('tnt-gender-reveal-australia')}">TNT Self Hire setup</a>`],
      // Cross-blog
      ['Many parents still say this is the most magical reveal of all.', `Many parents still say this is the most magical reveal of all. For more on the difference between this and a full party, see our <a href="${BLOG_URL(HANDLES.vsShower)}">gender reveal vs baby shower guide</a>.`],
      ['most viral gender reveal videos online are filmed on phones', `most viral gender reveal videos online are filmed on phones. For shooting tips, see our <a href="${BLOG_URL(HANDLES.photoshoot)}">gender reveal photoshoot guide</a>`],
      ['if this is your first time hearing about gender reveals', `if this is your first time hearing about gender reveals — start with our <a href="${BLOG_URL(HANDLES.whatIs)}">complete gender reveal guide for first-time parents</a>`],
      // External authority
      ['multiple US news stories cover gender reveals gone wrong with fireworks', `multiple <a href="https://www.abc.net.au/news/2020-09-08/gender-reveal-parties-causing-fires-deaths/12640374" rel="noopener" target="_blank">news stories cover gender reveals gone wrong with fireworks</a>`],
    ],
  },
  // ============ BLOG 2 — PHOTOSHOOT ============
  {
    id: 566587785305, name: 'Photoshoot',
    insertEeatAfter: '<p class="subtitle">',
    replacements: [
      ['Mega Blaster', `<a href="${PRODUCT('gender-reveal-extinguisher-australia')}">Mega Blaster</a>`],
      ['smoke bombs', `<a href="${PRODUCT('gender-reveal-smoke-bombs')}">smoke bombs</a>`],
      ['TNT Self Hire', `<a href="${PRODUCT('tnt-gender-reveal-australia')}">TNT Self Hire</a>`],
      ['Bio Cannons (biodegradable, park-approved)', `<a href="${PRODUCT('gender-reveal-cannons')}">Bio Cannons</a> (biodegradable, park-approved)`],
      ['Kings Park allows small private gatherings', `<a href="https://www.bgpa.wa.gov.au" rel="noopener" target="_blank">Kings Park</a> allows small private gatherings`],
      // Cross-blog
      ['Perfect for sports-mad Aussie families', `Perfect for sports-mad Aussie families. For more on hosting at home see our <a href="${BLOG_URL(HANDLES.diy)}">DIY gender reveal guide</a>`],
      ['Kings Park photos: Bio Cannons', `<a href="${BLOG_URL(HANDLES.perth)}">Kings Park</a> photos: Bio Cannons`],
      ['Gender reveals are about the baby', `Gender reveals are about the baby — see our <a href="${BLOG_URL(HANDLES.vsShower)}">gender reveal vs baby shower guide</a> for the full comparison.`],
    ],
  },
  // ============ BLOG 3 — VS BABY SHOWER ============
  {
    id: 566587818073, name: 'vs Baby Shower',
    insertEeatAfter: '<p class="subtitle">',
    replacements: [
      ['cannons, blasters, smoke bombs', `<a href="${PRODUCT('gender-reveal-cannons')}">cannons</a>, blasters, <a href="${PRODUCT('gender-reveal-smoke-bombs')}">smoke bombs</a>`],
      ['Oh Baby" Acrylic Cake Topper', `"Oh Baby" <a href="${PRODUCT('oh-baby-cake-topper')}">Acrylic Cake Topper</a>`],
      ['burn-away topper', `<a href="${PRODUCT('gender-reveal-burn-away-topper')}">burn-away topper</a>`],
      // External authority
      ['fertility rate is declining', `<a href="https://www.abs.gov.au/statistics/people/population/births-australia/latest-release" rel="noopener" target="_blank">fertility rate is declining</a>`],
      // Cross-blog
      ['traditionally a close friend, sister, mother, or mother-in-law', `traditionally a close friend, sister, mother, or mother-in-law. For more on what a gender reveal actually is, see our <a href="${BLOG_URL(HANDLES.whatIs)}">complete gender reveal guide</a>.`],
      ['DIY cake reveal', `<a href="${BLOG_URL(HANDLES.diy)}">DIY cake reveal</a>`],
      ['For photo-driven reveals see our', `For photo-driven reveals see our <a href="${BLOG_URL(HANDLES.photoshoot)}">gender reveal photoshoot guide</a>. For other`],
      ['professional photographer', `<a href="${BLOG_URL(HANDLES.photoshoot)}">professional photographer</a>`],
    ],
  },
  // ============ BLOG 4 — WHAT IS ============
  {
    id: 566587850841, name: 'What Is',
    insertEeatAfter: '<p class="subtitle">',
    replacements: [
      ['powder cannon', `<a href="${PRODUCT('gender-reveal-cannons')}">powder cannon</a>`],
      ['smoke bomb that releases', `<a href="${PRODUCT('gender-reveal-smoke-bombs')}">smoke bomb</a> that releases`],
      ['TNT-style detonator', `<a href="${PRODUCT('tnt-gender-reveal-australia')}">TNT-style detonator</a>`],
      ['Mega Blaster', `<a href="${PRODUCT('gender-reveal-extinguisher-australia')}">Mega Blaster</a>`],
      // External authority
      ['ABS', `<a href="https://www.abs.gov.au/statistics/people/population/births-australia/latest-release" rel="noopener" target="_blank">ABS</a>`],
      ['Australia adopted gender reveals around 2015-2017', `Australia adopted gender reveals around 2015-2017 (see <a href="https://en.wikipedia.org/wiki/Gender_reveal_party" rel="noopener" target="_blank">gender reveal party history</a>)`],
      // Cross-blog
      ['typically earlier in pregnancy (20-28 weeks)', `typically earlier in pregnancy (20-28 weeks) — see our <a href="${BLOG_URL(HANDLES.vsShower)}">full gender reveal vs baby shower comparison</a>`],
      ['DIY (already have most gear) and just do the gender reveal', `DIY (already have most gear) and just do the gender reveal — see our <a href="${BLOG_URL(HANDLES.diy)}">DIY gender reveal ideas</a> for budget-friendly options`],
      ['Phones are encouraged', `Phones are encouraged. For pro-level tips, read our <a href="${BLOG_URL(HANDLES.photoshoot)}">gender reveal photoshoot guide</a>.`],
    ],
  },
]

console.log(`\n=== ADDING INTERNAL + EXTERNAL LINKS TO ALL 4 BLOGS ===\n`)

for (const B of BLOGS_LINK_PLAN) {
  const cur = await rest(`/blogs/${blog.id}/articles/${B.id}.json`)
  let body = cur.article.body_html
  const beforeLinks = (body.match(/<a /g) || []).length

  // Insert E-E-A-T block (only if not already there)
  if (!body.includes('Last updated: 24 May 2026') && B.insertEeatAfter) {
    // Insert RIGHT AFTER the subtitle paragraph closes
    const subtitleEnd = body.indexOf('</p>', body.indexOf(B.insertEeatAfter))
    if (subtitleEnd > 0) {
      body = body.slice(0, subtitleEnd + 4) + '\n' + EEAT + '\n' + body.slice(subtitleEnd + 4)
    }
  }

  // Apply replacements (first occurrence only by default)
  let applied = 0, missed = 0
  for (const [find, replace] of B.replacements) {
    if (body.includes(find)) {
      body = body.replace(find, replace)
      applied++
    } else {
      missed++
      console.log(`    ⚠ ${B.name}: phrase not found "${find.slice(0,55)}..."`)
    }
  }

  const afterLinks = (body.match(/<a /g) || []).length
  console.log(`  ${B.name}: ${beforeLinks} → ${afterLinks} links (+${afterLinks-beforeLinks}). ${applied}/${B.replacements.length} replacements applied.`)

  // Save
  const upd = await rest(`/blogs/${blog.id}/articles/${B.id}.json`, {
    method: 'PUT',
    body: JSON.stringify({ article: { id: B.id, body_html: body }})
  })
  if (upd.errors) console.log(`    ✗ Save failed`)
  else console.log(`    ✓ Saved`)
}

console.log(`\n=== VERIFY ===`)
for (const B of BLOGS_LINK_PLAN) {
  const cur = await rest(`/blogs/${blog.id}/articles/${B.id}.json`)
  const body = cur.article.body_html
  const productLinks = (body.match(/href="https:\/\/genderrevealideas\.com\.au\/products\//g) || []).length
  const blogLinks = (body.match(/href="https:\/\/genderrevealideas\.com\.au\/blogs\//g) || []).length
  const externalLinks = (body.match(/href="https?:\/\/(?!genderrevealideas)[^"]+"/g) || []).length
  const eeat = body.includes('Last updated: 24 May 2026')
  console.log(`\n${B.name}:`)
  console.log(`  Internal product links: ${productLinks}`)
  console.log(`  Cross-blog links:       ${blogLinks}`)
  console.log(`  External authority:     ${externalLinks}`)
  console.log(`  E-E-A-T block:          ${eeat ? '✓' : '✗'}`)
}
process.exit(0)
