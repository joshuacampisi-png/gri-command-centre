/**
 * PHASE 3: Retrofit Article + Author + dateModified schema to all 4 existing blogs
 *  - Add full Article schema with author identity (Mallu Campisi + GRI Organization)
 *  - Add dateModified for freshness signal
 *  - Add 40-60 word answer block injection points (BLUF) at top of each blog
 *  - Add author byline + photo strip at top
 */
import 'dotenv/config'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const REST = 'https://bdd19a-3.myshopify.com/admin/api/2026-01'
async function rest(p,o={}){const r=await fetch(`${REST}${p}`,{...o,headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json',...(o.headers||{})}});return r.json()}
const sleep = ms => new Promise(r=>setTimeout(r,ms))

const TODAY = '2026-05-26'
const TODAY_ISO = '2026-05-26T09:00:00+10:00'
const TODAY_DISPLAY = 'Tuesday, May 26, 2026'
const FOUNDER_IMG = 'https://cdn.shopify.com/s/files/1/0584/7410/2873/files/founder-mallu-campisi.png?v=1779842404'

const BLOGS = [
  {
    id: 566587752537,
    handle: 'diy-gender-reveal-australia-18-ideas',
    title: 'DIY Gender Reveal Australia: 18 Ideas Aussie Families Love (2026)',
    blufAnswer: 'Aussie families plan DIY gender reveals using powder cannons, smoke bombs, sports balls, balloon kits, and dry ice setups. The most popular DIY reveals in 2026 are the Bio-Cannon ($35), 4-Pack Cannon Bundle ($129), and government-approved Smoke Bombs ($32). All products are biodegradable, family-safe, and available with same-day Gold Coast pickup.',
  },
  {
    id: 566587785305,
    handle: 'gender-reveal-photoshoot-australia-guide',
    title: 'Gender Reveal Photoshoot Australia: The Complete Guide (2026)',
    blufAnswer: 'A gender reveal photoshoot in Australia typically uses powder cannons or Mega Blasters for the iconic powder-burst hero shot. The best photoshoot tools are the Mega Blaster Powder Extinguisher ($149) for continuous 30-second spray and Bio-Cannons ($35) for instant burst moments. Outdoor venues with natural light produce the best results.',
  },
  {
    id: 566587818073,
    handle: 'gender-reveal-vs-baby-shower-australian-guide',
    title: 'Gender Reveal vs Baby Shower: Australian 2026 Guide',
    blufAnswer: 'A gender reveal announces the baby\'s gender to the parents and guests, typically at 18-20 weeks of pregnancy. A baby shower celebrates the upcoming arrival with gifts, usually at 28-34 weeks. Most Australian families have both, with the gender reveal first (using cannons, smoke bombs, or bundles) and the baby shower later. Average AU costs: $80-$400 for gender reveal, $300-$1,500 for baby shower.',
  },
  {
    id: 566587850841,
    handle: 'what-is-a-gender-reveal-party-australian-guide',
    title: 'What Is a Gender Reveal Party? Australian Guide for First-Time Parents (2026)',
    blufAnswer: 'A gender reveal party is a celebration where the baby\'s gender is announced to family and friends, typically at 18-20 weeks of pregnancy. In Australia, the most popular reveal moments use powder cannons ($35), smoke bombs ($32), Mega Blaster extinguishers ($149), or sports-themed balls ($45-$89). The host (or a friend) is the only one who knows the result, with everyone else finding out during the reveal moment.',
  },
]

async function retrofit(blog, b) {
  const cur = await rest(`/blogs/${blog.id}/articles/${b.id}.json`)
  let body = cur.article.body_html
  const wordCount = body.replace(/<[^>]+>/g,' ').split(/\s+/).filter(w=>w.length>2).length

  // Build full Article + Author + Publisher schema
  const articleSchema = `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": b.title,
    "datePublished": cur.article.published_at,
    "dateModified": TODAY_ISO,
    "wordCount": wordCount,
    "author": {
      "@type": "Person",
      "name": "Mallu Campisi",
      "jobTitle": "Co-Founder, Gender Reveal Ideas Australia",
      "url": "https://genderrevealideas.com.au/pages/about-the-founders",
      "image": FOUNDER_IMG,
      "sameAs": ["https://www.instagram.com/mallucampisi/"]
    },
    "publisher": {
      "@type": "Organization",
      "name": "Gender Reveal Ideas Australia",
      "url": "https://genderrevealideas.com.au",
      "foundingDate": "2010",
      "logo": { "@type": "ImageObject", "url": "https://genderrevealideas.com.au/cdn/shop/files/gri-logo.png" },
      "address": { "@type": "PostalAddress", "streetAddress": "Unit 3B/13 Upton Street", "addressLocality": "Bundall", "addressRegion": "QLD", "addressCountry": "AU" },
      "sameAs": ["https://www.instagram.com/gender.reveal.ideass","https://www.tiktok.com/@genderrevealaustralia","https://www.facebook.com/genderrevealideasaustralia"]
    },
    "mainEntityOfPage": { "@type": "WebPage", "@id": `https://genderrevealideas.com.au/blogs/news/${b.handle}` },
    "image": "https://genderrevealideas.com.au/cdn/shop/files/blog-featured-1779653585763.jpg",
    "isAccessibleForFree": true,
    "isPartOf": { "@type": "Blog", "name": "Gender Reveal Ideas Blog", "url": "https://genderrevealideas.com.au/blogs/news" }
  })}</script>`

  // Build BLUF answer block + author byline (slots in at top of body)
  const BLUF = `
<div style="background:#fff7f9;border-left:4px solid #c44569;padding:18px 24px;border-radius:0 12px 12px 0;margin:0 0 24px;font-size:16px;color:#333;line-height:1.65">
  <strong style="color:#c44569;display:block;margin-bottom:6px;font-size:13px;letter-spacing:1px;text-transform:uppercase">Quick answer</strong>
  ${b.blufAnswer}
</div>

<div style="display:flex;gap:12px;align-items:center;padding:10px 0 22px;margin:0 0 22px;border-bottom:1px solid #eee;font-size:14px;color:#666">
  <img src="${FOUNDER_IMG}" alt="Mallu Campisi" style="width:44px;height:44px;border-radius:50%;object-fit:cover;flex-shrink:0">
  <div>
    <div>By <a href="https://genderrevealideas.com.au/pages/about-the-founders" style="color:#1a1a1a;font-weight:600;text-decoration:none">Mallu Campisi</a>, Co-Founder of Gender Reveal Ideas Australia · Mother of five · <a href="https://www.instagram.com/mallucampisi/" rel="noopener" target="_blank" style="color:#c44569;text-decoration:none">@mallucampisi</a></div>
    <div style="color:#999;font-size:13px;margin-top:2px">Last updated: ${TODAY_DISPLAY} · Family-owned since 2010</div>
  </div>
</div>`

  // Remove old article schema if present, then prepend new schema + BLUF
  body = body.replace(/<script type="application\/ld\+json">\{"@context":"https:\/\/schema\.org","@type":"Article"[\s\S]*?<\/script>/g, '')

  // Remove any old "Quick answer" BLUF if present
  body = body.replace(/<div style="background:#fff7f9;border-left:4px solid #c44569;[\s\S]*?<\/div>\s*<div style="display:flex;gap:12px;align-items:center;padding:10px 0 22px[\s\S]*?<\/div>/g, '')

  // Prepend the new schema + BLUF at the top
  body = articleSchema + BLUF + body

  const upd = await rest(`/blogs/${blog.id}/articles/${b.id}.json`, {
    method: 'PUT',
    body: JSON.stringify({ article: { id: b.id, body_html: body } })
  })
  return { id: b.id, handle: b.handle, ok: !upd.errors, newLen: upd.article?.body_html.length, errors: upd.errors }
}

console.log('\n=== PHASE 3: Retrofitting 4 blogs with Article + Author schema + BLUF answer block ===\n')
const blogs = await rest('/blogs.json')
const blog = blogs.blogs.find(b => b.handle === 'news')

for (const b of BLOGS) {
  const r = await retrofit(blog, b)
  console.log(`  ${r.ok ? '✓' : '✗'} ${r.handle} (${r.newLen} chars) ${r.errors ? JSON.stringify(r.errors) : ''}`)
  await sleep(600)
}
console.log('\n✓ Phase 3 done. All 4 blogs now have Article + Author schema, BLUF answer block, founder byline + photo.')
process.exit(0)
