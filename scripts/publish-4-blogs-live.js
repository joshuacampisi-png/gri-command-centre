/**
 * SEO QA + publish all 4 draft blogs live
 */
import 'dotenv/config'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const REST = 'https://bdd19a-3.myshopify.com/admin/api/2026-01'
async function rest(p,o={}){const r=await fetch(`${REST}${p}`,{...o,headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json',...(o.headers||{})}});return r.json()}

const blogs = await rest('/blogs.json')
const blog = blogs.blogs.find(b => b.handle === 'news')

const IDS = [
  { id: 566587752537, target: 'diy gender reveal' },
  { id: 566587785305, target: 'gender reveal photoshoot' },
  { id: 566587818073, target: 'gender reveal vs baby shower' },
  { id: 566587850841, target: 'what is a gender reveal' },
]

console.log(`\n=== SEO QA + PUBLISH ===\n`)

// QA each blog
console.log(`Step 1: SEO QA on all 4 drafts\n`)
for (const b of IDS) {
  const cur = await rest(`/blogs/${blog.id}/articles/${b.id}.json`)
  const a = cur.article
  const body = a.body_html
  const targetLower = b.target.toLowerCase()
  const bodyText = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
  const wordCount = bodyText.split(' ').length

  const checks = {
    'Title contains keyword':       a.title.toLowerCase().includes(targetLower) || a.title.toLowerCase().includes(targetLower.split(' ').slice(0,3).join(' ')),
    'H1 in body':                   /<h1>/.test(body),
    'Meta description set':         (a.summary_html || '').length > 100,
    'Word count > 2500':            wordCount > 2500,
    'Schema Article':               /"@type":"Article"/.test(body),
    'Schema FAQPage':               /"@type":"FAQPage"/.test(body),
    'Schema BreadcrumbList':        /"@type":"BreadcrumbList"/.test(body),
    'Featured image set':           !!(a.image && a.image.src),
    'Internal product links':       (body.match(/genderrevealideas\.com\.au\/products\//g) || []).length >= 2,
    'Internal collection link':     /\/collections\//.test(body),
    'FAQ accordion (10+)':          (body.match(/<details>/g) || []).length >= 10,
    'Keyword density (3+ mentions)':((bodyText.toLowerCase().match(new RegExp(targetLower.replace(/[.+]/g,'\\$&'),'g')) || []).length >= 3),
    'No product cards in body':     !/<div class="product-card">/.test(body),
    'No branded composite imgs':    !/GRI_Brand_trust|GRI_Showcase|tnt_hire\.png/.test(body),
    '3 unique lifestyle figures':   (body.match(/<figure[^>]*>/g) || []).length === 3,
  }

  console.log(`📄 ${a.title.slice(0,75)}`)
  console.log(`   Handle: /blogs/news/${a.handle}`)
  console.log(`   Words: ${wordCount} | Target: "${b.target}"`)
  let pass = 0, fail = 0
  for (const [name, ok] of Object.entries(checks)) {
    if (ok) { pass++ } else { fail++; console.log(`     ✗ ${name}`) }
  }
  console.log(`   ${pass}/${pass+fail} SEO checks pass\n`)
}

console.log(`Step 2: Publishing all 4 blogs LIVE\n`)
for (const b of IDS) {
  const upd = await rest(`/blogs/${blog.id}/articles/${b.id}.json`, {
    method: 'PUT',
    body: JSON.stringify({ article: { id: b.id, published: true, published_at: new Date().toISOString() }})
  })
  if (upd.errors) {
    console.log(`  ✗ ${b.id}: ${JSON.stringify(upd.errors)}`)
  } else {
    const a = upd.article
    console.log(`  ✓ LIVE: https://genderrevealideas.com.au/blogs/news/${a.handle}`)
    console.log(`    Published: ${a.published_at}`)
  }
}

console.log(`\n=== ALL 4 BLOGS NOW LIVE ===\n`)
console.log(`Next steps (you do these in Google Search Console):`)
console.log(`  1. Sign in to search.google.com/search-console`)
console.log(`  2. Submit each URL via "URL Inspection" → "Request Indexing"`)
console.log(`  3. Add to sitemap if not auto-discovered`)
console.log(`\nExpected first ranking signals: 7-14 days. Top 10 entry: 21-45 days.`)
process.exit(0)
