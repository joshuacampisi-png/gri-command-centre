/**
 * FINAL: replace ALL old branded images in every blog with new lifestyle images
 * Simple string-replace approach, much more reliable than regex
 */
import 'dotenv/config'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const REST = 'https://bdd19a-3.myshopify.com/admin/api/2026-01'
async function rest(p,o={}){const r=await fetch(`${REST}${p}`,{...o,headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json',...(o.headers||{})}});return r.json()}

// Already-uploaded lifestyle image URLs
const URLS = {
  hero1: 'https://cdn.shopify.com/s/files/1/0584/7410/2873/files/lifestyle-couple-golden-hour-bump.png?v=1779515013',
  hero2: 'https://cdn.shopify.com/s/files/1/0584/7410/2873/files/lifestyle-beach-sunset-reveal.png?v=1779515017',
  hero3: 'https://cdn.shopify.com/s/files/1/0584/7410/2873/files/lifestyle-baby-shower-celebration.png?v=1779515022',
  hero4: 'https://cdn.shopify.com/s/files/1/0584/7410/2873/files/lifestyle-couple-sealed-envelope.png?v=1779515026',
  sup1: 'https://cdn.shopify.com/s/files/1/0584/7410/2873/files/lifestyle-cake-cutting-home-reveal.png?v=1779516779',
  sup2: 'https://cdn.shopify.com/s/files/1/0584/7410/2873/files/lifestyle-lavender-field-photoshoot.png?v=1779516783',
  sup3: 'https://cdn.shopify.com/s/files/1/0584/7410/2873/files/lifestyle-baby-shower-intimate-friends.png?v=1779516788',
  sup4: 'https://cdn.shopify.com/s/files/1/0584/7410/2873/files/lifestyle-grandmothers-embrace.png?v=1779516793',
}

// Old image URLs that need replacement (full URLs Shopify currently stores)
const OLD = {
  smokeBombHero: 'https://cdn.shopify.com/s/files/1/0584/7410/2873/files/SocMEd.png?v=1747709644',
  griProduct:    'https://cdn.shopify.com/s/files/1/0584/7410/2873/files/GRI_product.png?v=1779497009',
  griShowcase:   'https://cdn.shopify.com/s/files/1/0584/7410/2873/files/GRI_Showcase.png?v=1779497004',
  tntHire:       'https://cdn.shopify.com/s/files/1/0584/7410/2873/files/tnt_hire.png?v=1779497013',
}

// Per-blog mapping: which old URLs to replace with which new URLs + new captions
const BLOGS = [
  {
    id: 566587752537, name: 'DIY',
    replacements: [
      { from: OLD.smokeBombHero, to: URLS.hero1,  newAlt: 'Pregnant Australian couple at golden hour in eucalyptus backyard',  newCaption: 'A warm Australian afternoon. The bump, the partner, the eucalyptus — the kind of photo every Aussie family wants to keep forever.' },
      { from: OLD.griProduct,    to: URLS.sup1,   newAlt: 'Australian couple cutting gender reveal cake at home',              newCaption: 'A simple at-home cake reveal — the moment that becomes the photo on the fridge.' },
    ],
  },
  {
    id: 566587785305, name: 'Photoshoot',
    replacements: [
      { from: OLD.smokeBombHero, to: URLS.hero2,  newAlt: 'Australian beach gender reveal photoshoot — pink and blue smoke at sunset', newCaption: 'The shot every Australian family is after — pink or blue smoke at golden hour against an Indian Ocean sunset.' },
      { from: OLD.griProduct,    to: URLS.sup2,   newAlt: 'Pregnant Australian couple in lavender field with pink smoke at golden hour', newCaption: 'Golden-hour lavender field — the kind of light that turns any photo into a magazine cover.' },
    ],
    // Also fully remove the TNT figure (no 3rd lifestyle image)
    removeFigures: [OLD.tntHire],
  },
  {
    id: 566587818073, name: 'vs Baby Shower',
    replacements: [
      { from: OLD.smokeBombHero, to: URLS.hero3,  newAlt: 'Australian backyard baby shower celebration with female friends and family', newCaption: 'A baby shower in an Aussie backyard — the women who matter, all in one frame.' },
      { from: OLD.griShowcase,   to: URLS.sup3,   newAlt: 'Australian baby shower — pregnant woman embraced by close friends and mother', newCaption: 'A baby shower is about the women around you. A gender reveal is about the moment of discovery. Both worth celebrating.' },
    ],
  },
  {
    id: 566587850841, name: 'What Is',
    replacements: [
      { from: OLD.smokeBombHero, to: URLS.hero4,  newAlt: 'Australian couple at home with sealed gender reveal envelope — intimate emotional moment', newCaption: 'A modern Australian gender reveal often starts here — a sealed envelope, two people, one breath held.' },
      { from: OLD.griProduct,    to: URLS.sup4,   newAlt: 'Pregnant Australian woman embraced by both grandmothers at golden hour', newCaption: 'Three generations, one moment. The real reason to host a gender reveal.' },
    ],
  },
]

const blogs = await rest('/blogs.json')
const blog = blogs.blogs.find(b => b.handle === 'news')

console.log(`\n=== FINAL IMAGE SWAP — All 4 blogs ===\n`)

for (const B of BLOGS) {
  const cur = await rest(`/blogs/${blog.id}/articles/${B.id}.json`)
  let body = cur.article?.body_html
  if (!body) { console.log(`✗ ${B.name}: could not load`); continue }

  const beforeFigures = (body.match(/<figure[^>]*>/g) || []).length

  // Apply replacements: swap entire <figure> block containing the old URL
  for (const r of B.replacements) {
    // Find the figure block containing this image URL and replace its src + alt + caption
    const escUrl = r.from.replace(/[.?+()\\\/]/g, c => '\\' + c)
    const re = new RegExp(`<figure class="bf">\\s*<img src="${escUrl}"[^>]*\\/>\\s*(<figcaption>[^<]*<\\/figcaption>)?\\s*<\\/figure>`)
    const newFig = `<figure class="bf"><img src="${r.to}" alt="${r.newAlt}" loading="lazy"/><figcaption>${r.newCaption}</figcaption></figure>`
    if (re.test(body)) {
      body = body.replace(re, newFig)
      console.log(`  ✓ ${B.name}: replaced ${r.from.split('/').pop().slice(0,30)} → ${r.to.split('/').pop().slice(0,40)}`)
    } else {
      // Try simpler string replace just on src URL
      if (body.includes(r.from)) {
        body = body.replace(r.from, r.to)
        // also try to update the nearest alt + caption — simpler approach
        console.log(`  ✓ ${B.name}: URL-only swap for ${r.from.split('/').pop().slice(0,30)}`)
      } else {
        console.log(`  ⚠ ${B.name}: ${r.from.split('/').pop()} not found in body`)
      }
    }
  }

  // Remove specified figures entirely
  if (B.removeFigures) {
    for (const url of B.removeFigures) {
      const escUrl = url.replace(/[.?+()\\\/]/g, c => '\\' + c)
      const re = new RegExp(`<figure class="bf">\\s*<img src="${escUrl}"[^>]*\\/>[\\s\\S]*?<\\/figure>`, 'g')
      if (re.test(body)) {
        body = body.replace(re, '')
        console.log(`  ✓ ${B.name}: removed figure for ${url.split('/').pop()}`)
      }
    }
  }

  const afterFigures = (body.match(/<figure[^>]*>/g) || []).length
  console.log(`  ${B.name}: ${beforeFigures} figures → ${afterFigures} figures`)

  // Save
  const upd = await rest(`/blogs/${blog.id}/articles/${B.id}.json`, {
    method: 'PUT',
    body: JSON.stringify({ article: { id: B.id, body_html: body }})
  })
  if (upd.errors) console.log(`  ✗ Save failed: ${JSON.stringify(upd.errors)}`)
  else console.log(`  ✓ ${B.name} saved\n`)
}

console.log(`=== DONE ===\n`)
console.log(`Verifying...`)

// Verify
for (const B of BLOGS) {
  const cur = await rest(`/blogs/${blog.id}/articles/${B.id}.json`)
  const body = cur.article?.body_html || ''
  const figs = body.match(/<figure class="bf">[\s\S]*?<\/figure>/g) || []
  console.log(`\n${B.name} (${B.id}): ${figs.length} figures`)
  for (const m of figs) {
    const src = (m.match(/src="([^"]+)"/) || [])[1] || ''
    console.log(`  → ${src.split('/').pop().slice(0,55)}`)
  }
}
process.exit(0)
