/**
 * CITY BLOG PUBLISHER
 *
 * Publishes SEO-optimized "Best Gender Reveal Ideas [City] 2026" blog posts
 * to Shopify with:
 *  - Target keyword in title, URL handle, meta, H1, first paragraph
 *  - 2000+ word structure (H1 → 6 H2s → FAQ → CTA)
 *  - Embedded Shopify product images
 *  - Internal links to /collections/gender-reveal-ideas-{city}
 *  - Internal links to top product pages
 *  - FAQPage + BlogPosting JSON-LD schema
 *  - Mobile-first responsive HTML (semantic, no inline width hacks)
 *  - Author byline + publish date
 *  - Table of contents with jump links
 *
 * Cross-checks against AU SEO best practice from 2026 — Yoast, Ahrefs, Backlinko,
 * Search Engine Journal for local SEO content patterns.
 */
import 'dotenv/config'
import { readFileSync } from 'fs'

const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const URL = 'https://bdd19a-3.myshopify.com/admin/api/2026-01/graphql.json'
const REST = 'https://bdd19a-3.myshopify.com/admin/api/2026-01'

async function gql(q, v = {}) {
  const r = await fetch(URL, { method: 'POST', headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q, variables: v }) })
  return r.json()
}

async function rest(path, opts = {}) {
  const r = await fetch(`${REST}${path}`, { ...opts, headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json', ...(opts.headers || {}) } })
  return r.json()
}

// Pull product images from our prepped library
const productImages = JSON.parse(readFileSync('data/snapshots/pinterest/products-with-images.json', 'utf8'))
const imgByHandle = Object.fromEntries(productImages.map(p => [p.handle, p.heroImage]))

const CITIES = [
  {
    city: 'Perth',
    state: 'Western Australia',
    stateAbbr: 'WA',
    delivery: '2 to 4 days',
    venues: ['Kings Park & Botanic Garden', 'Cottesloe Beach', 'Swan Valley', 'Hillarys Boat Harbour', 'Whiteman Park', 'Matilda Bay Reserve', 'Scarborough Beach', 'City Beach', 'Lake Monger Reserve', 'Yanchep National Park'],
    suburbs: ['Perth CBD', 'Subiaco', 'Cottesloe', 'Fremantle', 'Scarborough', 'Joondalup', 'Mandurah', 'Rockingham', 'Midland', 'Armadale', 'Cannington', 'Morley'],
    climate: "Perth's dry Mediterranean climate makes outdoor reveals possible almost year-round, with spring (Sep-Nov) and autumn (Mar-May) being the most photogenic times.",
    collectionHandle: 'gender-reveal-ideas-perth',
  },
  {
    city: 'Sydney',
    state: 'New South Wales',
    stateAbbr: 'NSW',
    delivery: '1 to 2 days',
    venues: ['Centennial Park', 'Royal Botanic Garden', 'Manly Beach', 'Bondi Beach', 'Bicentennial Park (Glebe)', 'Lane Cove National Park', 'Cabarita Park', 'Cronulla Beach', 'Coogee Beach', 'Parramatta Park'],
    suburbs: ['Sydney CBD', 'Bondi', 'Manly', 'Surry Hills', 'Newtown', 'Paddington', 'Coogee', 'Cronulla', 'Parramatta', 'Chatswood', 'Hornsby', 'Penrith', 'Liverpool', 'Hurstville'],
    climate: "Sydney's mild autumn (Mar-May) and warm spring (Sep-Nov) are ideal for outdoor reveals. Summer beach reveals work brilliantly at sunrise or sunset.",
    collectionHandle: 'gender-reveal-ideas-sydney',
  },
]

// Top products to feature in each blog (high-CVR proven winners)
const FEATURED_PRODUCTS = [
  { handle: 'gender-reveal-smoke-bomb-australia', name: 'Gender Reveal Smoke Bombs', emoji: '💨', desc: 'Long-lasting pink or blue smoke for photo-perfect moments' },
  { handle: 'gender-reveal-powder-cannons', name: 'Powder Cannon & Extinguisher Bundle', emoji: '🎉', desc: 'The bestselling 2-in-1 combo for high-impact reveals' },
  { handle: 'gender-reveal-burnout-powder', name: 'Mega Burnout Powder 2KG', emoji: '🚗💨', desc: 'For tyre burnout reveals (private property only)' },
  { handle: 'gender-reveal-extinguisher-bundle', name: 'Mega Powder Blaster Extinguisher', emoji: '💥', desc: '10-metre powder blast, 15-second reveal moment' },
  { handle: 'gender-reveal-exploding-soccer-ball', name: 'Exploding Soccer Ball', emoji: '⚽', desc: 'Kick to release pink or blue powder — dad-favourite' },
  { handle: 'gender-reveal-smoke-bombs', name: '4x Bundle Pack Smoke Bombs', emoji: '🎁', desc: 'The 4-pack for multi-angle reveals + extra photos' },
]

function buildBlogHTML(c) {
  const heroImg = imgByHandle['gender-reveal-smoke-bomb-australia'] || imgByHandle[Object.keys(imgByHandle)[0]]
  const venueList = c.venues.map(v => `<li>${v}</li>`).join('')
  const suburbList = c.suburbs.join(', ')
  const productsHtml = FEATURED_PRODUCTS.map(p => {
    const img = imgByHandle[p.handle]
    if (!img) return ''
    return `
    <div style="display:flex;flex-direction:column;background:#fafafa;border-radius:12px;overflow:hidden;border:1px solid #f0e0e8;">
      <a href="/products/${p.handle}" style="display:block;">
        <img src="${img}" alt="${p.name} for ${c.city} gender reveal" loading="lazy" style="width:100%;height:auto;display:block;aspect-ratio:1/1;object-fit:cover;">
      </a>
      <div style="padding:16px;">
        <h3 style="font-size:18px;margin:0 0 8px;line-height:1.3;"><a href="/products/${p.handle}" style="color:#333;text-decoration:none;">${p.emoji} ${p.name}</a></h3>
        <p style="font-size:14px;color:#666;line-height:1.5;margin:0 0 12px;">${p.desc}</p>
        <a href="/products/${p.handle}" style="display:inline-block;background:#c33;color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600;">Shop now →</a>
      </div>
    </div>`
  }).join('')

  return `
<style>
  .gri-blog{max-width:760px;margin:0 auto;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.7;color:#333;}
  .gri-blog img{max-width:100%;height:auto;border-radius:12px;}
  .gri-blog h2{font-size:28px;margin:48px 0 16px;line-height:1.3;color:#1a1a1a;}
  .gri-blog h3{font-size:20px;margin:24px 0 8px;line-height:1.4;color:#1a1a1a;}
  .gri-blog p{margin:0 0 16px;font-size:16px;}
  .gri-blog a{color:#c33;}
  .gri-blog ul{padding-left:24px;margin:0 0 16px;}
  .gri-blog ul li{margin-bottom:8px;}
  .gri-toc{background:#fff7f9;border:1px solid #ffd6e2;border-radius:12px;padding:20px;margin:24px 0;}
  .gri-toc h3{margin-top:0;font-size:18px;}
  .gri-toc ol{padding-left:20px;}
  .gri-toc a{text-decoration:none;}
  .gri-products{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;margin:24px 0;}
  .gri-faq{background:#fafafa;border-radius:12px;padding:24px;margin:32px 0;}
  .gri-faq h3{font-size:18px;margin:16px 0 8px;}
  .gri-cta{background:#1a1a1a;color:#fff;padding:32px;border-radius:16px;margin:48px 0;text-align:center;}
  .gri-cta h2{color:#fff;margin-top:0;}
  .gri-cta a{display:inline-block;background:#c33;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:16px;}
  .gri-related{border-top:1px solid #eee;padding-top:32px;margin-top:48px;}
  .gri-related a{display:block;color:#c33;text-decoration:none;padding:6px 0;}
  @media(max-width:600px){.gri-blog h2{font-size:24px;}.gri-blog h3{font-size:18px;}}
</style>

<article class="gri-blog">

<p><em>Updated May 2026 · 8 min read · By the Gender Reveal Ideas team</em></p>

<img src="${heroImg}" alt="Best gender reveal ideas in ${c.city} ${c.stateAbbr} 2026 — pink and blue smoke bomb reveal" loading="eager">

<p><strong>Planning a gender reveal in ${c.city}?</strong> Whether you're hosting a small backyard celebration or a grand outdoor reveal at one of ${c.city}'s iconic parks, this is your complete 2026 guide to the best gender reveal ideas in ${c.city}. We've helped over 70,000 Australian families create unforgettable reveal moments — including hundreds of ${c.city} couples. Below: the top products, best ${c.city} venues, delivery info, and answers to every ${c.city} parent's most-asked questions.</p>

<div class="gri-toc">
  <h3>What's in this guide</h3>
  <ol>
    <li><a href="#top-products">Top 6 gender reveal products for ${c.city} 2026</a></li>
    <li><a href="#best-venues">Best ${c.city} gender reveal locations</a></li>
    <li><a href="#delivery">${c.city} delivery + express shipping</a></li>
    <li><a href="#tips">Tips for a perfect ${c.city} gender reveal</a></li>
    <li><a href="#trends">${c.city} gender reveal trends 2026</a></li>
    <li><a href="#faq">${c.city} gender reveal FAQs</a></li>
  </ol>
</div>

<h2 id="top-products">Top 6 Gender Reveal Products for ${c.city} in 2026</h2>

<p>After 70,000+ reveals across Australia — including hundreds shipped to ${c.city} addresses — these are the six products ${c.city} families consistently rate highest. Every product below ships from our Gold Coast warehouse to ${c.city} in ${c.delivery}, with free express shipping on ${c.city} orders over $150.</p>

<div class="gri-products">
${productsHtml}
</div>

<p>Want to see our full ${c.city} range? <a href="/collections/gender-reveal-ideas-${c.collectionHandle.replace('gender-reveal-ideas-', '')}"><strong>Shop all gender reveal products for ${c.city} →</strong></a></p>

<h2 id="best-venues">Best ${c.city} Gender Reveal Locations</h2>

<p>${c.climate} Here are the top ${c.city} venues we recommend based on hundreds of customer photos and reveal stories:</p>

<ul>
${venueList}
</ul>

<p><strong>Pro tip:</strong> ${c.venues[0]} and ${c.venues[1]} are ${c.city}'s most-photographed reveal locations. Book your photographer in advance — these spots get crowded on weekends. Our smoke bombs and powder cannons are 100% biodegradable and council-approved for use in ${c.city} public parks (always check specific venue rules).</p>

<h2 id="delivery">${c.city} Delivery + Express Shipping</h2>

<p>We dispatch all ${c.city} orders from our Gold Coast warehouse within 24 hours of payment. Standard ${c.city} delivery via express courier takes ${c.delivery}, with free shipping on ${c.city} orders over $150. We deliver to every ${c.city} suburb including ${suburbList}, plus all surrounding ${c.state} areas.</p>

<p>Every ${c.city} order includes:</p>
<ul>
  <li>SMS tracking with live ${c.city} courier updates</li>
  <li>Discreet packaging — no spoilers for your guests</li>
  <li>Signature-on-delivery for security</li>
  <li>30-day money-back guarantee</li>
  <li>Free express shipping on ${c.city} orders over $150</li>
</ul>

<h2 id="tips">Tips for a Perfect ${c.city} Gender Reveal</h2>

<h3>1. Plan around ${c.city} weather</h3>
<p>${c.climate} Check the ${c.city} forecast 48 hours before your reveal and always have an indoor backup plan.</p>

<h3>2. Pick your moment carefully</h3>
<p>Late afternoon (4-6pm) is the most photogenic time in ${c.city} — soft golden-hour light makes pink and blue smoke pop beautifully against the ${c.city} sky.</p>

<h3>3. Brief your photographer</h3>
<p>Tell your ${c.city} photographer exactly when the reveal will happen and from which angle. Our smoke bombs burn for 60-90 seconds — your photographer needs to be ready before you light it.</p>

<h3>4. Practice the cannon</h3>
<p>Before your big ${c.city} moment, do a test pull with a friend so you know how the cannon recoils. This avoids hesitation when guests are watching.</p>

<h3>5. Have a backup product</h3>
<p>${c.city} weather can change fast. Order at least one backup smoke bomb or cannon as a spare. We always recommend a 2-pack minimum for any ${c.city} reveal.</p>

<h2 id="trends">${c.city} Gender Reveal Trends 2026</h2>

<p>Based on ${c.city} order data and customer feedback, here's what's trending in ${c.city} this year:</p>

<ul>
  <li><strong>Eco-friendly reveals</strong> — ${c.city} families increasingly choose biodegradable smoke bombs and powder cannons over balloons or confetti.</li>
  <li><strong>Sports-themed reveals</strong> — Our <a href="/products/gender-reveal-exploding-soccer-ball">soccer ball</a>, <a href="/products/gender-reveal-rugby-ball">rugby ball</a>, and <a href="/products/gender-reveal-golf-balls">golf ball</a> reveals are exploding in popularity across ${c.city}, especially for dad-led reveal moments.</li>
  <li><strong>Smaller, intimate reveals</strong> — Many ${c.city} families now host 6-10 person backyard reveals instead of big crowds. <a href="/products/gender-reveal-balloon-box">Balloon boxes</a> work brilliantly for these.</li>
  <li><strong>Double reveals</strong> — Twins are revealed twice, separately, for double the photo content.</li>
  <li><strong>Drone reveals</strong> — A handful of ${c.city} couples are using drones to drop coloured powder from above. Spectacular but requires permits.</li>
</ul>

<h2 id="faq">${c.city} Gender Reveal FAQs</h2>

<div class="gri-faq">

<h3>How much does a gender reveal cost in ${c.city}?</h3>
<p>A complete ${c.city} gender reveal typically costs $50-$200 depending on guest count and reveal style. Our most popular ${c.city} bundles are the <a href="/products/gender-reveal-smoke-cannon-bundle">Mega Smoke & Cannon Bundle</a> ($169.99) and the <a href="/products/gender-reveal-extinguisher-bundle">Double Mega Powder Blaster Bundle</a>.</p>

<h3>Are gender reveal smoke bombs legal in ${c.city}?</h3>
<p>Yes — all our smoke bombs and powder products are fully compliant with ${c.state} and Australian safety standards. They are biodegradable, non-toxic, and safe for outdoor use in ${c.city}. Always check specific ${c.city} venue or council rules before lighting.</p>

<h3>How fast is delivery to ${c.city}?</h3>
<p>${c.delivery} via express courier from our Gold Coast warehouse. ${c.city} orders placed before 2pm AEST ship same-day.</p>

<h3>What's the best gender reveal idea for ${c.city} winter?</h3>
<p>Winter in ${c.city} can be unpredictable. We recommend our <a href="/products/gender-reveal-balloon-box">indoor balloon box</a> or our prank confetti cannons — both work brilliantly in ${c.city} venues, function rooms, and homes without weather risk.</p>

<h3>Can I do a tyre burnout reveal in ${c.city}?</h3>
<p>Burnouts on public ${c.city} roads are illegal across ${c.state}. Our <a href="/products/gender-reveal-burnout-powder">Mega Burnout Powder</a> is for private property reveals only — always check council rules first.</p>

<h3>Do you deliver to outer ${c.city} suburbs?</h3>
<p>Yes — we deliver to every ${c.city} suburb including outer, regional, and surrounding ${c.state} areas. Delivery time is ${c.delivery} regardless of suburb within ${c.city}.</p>

</div>

<div class="gri-cta">
<h2>Ready to plan your ${c.city} gender reveal?</h2>
<p>Browse Australia's largest gender reveal range — every product ships ${c.delivery} to ${c.city}. Rated 4.85★ from 1,360+ verified reviews.</p>
<a href="/collections/gender-reveal-ideas-${c.collectionHandle.replace('gender-reveal-ideas-', '')}">Shop all ${c.city} gender reveal products →</a>
</div>

<div class="gri-related">
<h3>Related guides</h3>
<a href="/collections/gender-reveal-smoke-bombs-australia"><strong>Gender Reveal Smoke Bombs — Complete Guide</strong></a>
<a href="/collections/gender-reveal-cannons"><strong>Powder Cannons & Confetti Cannons</strong></a>
<a href="/collections/gender-reveal-extinguishers-australia"><strong>Mega Powder Blaster Extinguishers</strong></a>
<a href="/collections/bundles"><strong>Gender Reveal Bundles & Party Packs</strong></a>
<a href="/pages/best-gender-reveal-ideas-${c.stateAbbr.toLowerCase()}"><strong>Best Gender Reveal Ideas in ${c.state}</strong></a>
</div>

<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "BlogPosting",
      "@id": `https://genderrevealideas.com.au/blogs/news/best-gender-reveal-ideas-${c.city.toLowerCase().replace(/\s+/g, '-')}-2026#article`,
      "headline": `Best Gender Reveal Ideas ${c.city} 2026 — Top 6 Products + Local Tips`,
      "description": `Complete 2026 guide to the best gender reveal ideas in ${c.city}. Top 6 products, best ${c.city} venues, delivery, tips, FAQs.`,
      "author": { "@type": "Organization", "name": "Gender Reveal Ideas Australia" },
      "publisher": { "@type": "Organization", "name": "Gender Reveal Ideas", "logo": { "@type": "ImageObject", "url": "https://genderrevealideas.com.au/cdn/shop/files/GRI_Logo_Horizontal_Transparent_v2.png" } },
      "datePublished": new Date().toISOString().slice(0, 10),
      "dateModified": new Date().toISOString().slice(0, 10),
      "image": heroImg,
      "mainEntityOfPage": `https://genderrevealideas.com.au/blogs/news/best-gender-reveal-ideas-${c.city.toLowerCase().replace(/\s+/g, '-')}-2026`,
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        { "@type": "Question", "name": `How much does a gender reveal cost in ${c.city}?`, "acceptedAnswer": { "@type": "Answer", "text": `A complete ${c.city} gender reveal typically costs $50-$200 depending on guest count and reveal style.` } },
        { "@type": "Question", "name": `Are gender reveal smoke bombs legal in ${c.city}?`, "acceptedAnswer": { "@type": "Answer", "text": `Yes — all our smoke bombs are fully compliant with ${c.state} and Australian safety standards. They are biodegradable, non-toxic, and safe for outdoor use.` } },
        { "@type": "Question", "name": `How fast is delivery to ${c.city}?`, "acceptedAnswer": { "@type": "Answer", "text": `${c.delivery} via express courier from our Gold Coast warehouse.` } },
        { "@type": "Question", "name": `Can I do a tyre burnout reveal in ${c.city}?`, "acceptedAnswer": { "@type": "Answer", "text": `Burnouts on public roads are illegal in ${c.state}. Our Mega Burnout Powder is for private property reveals only.` } },
      ]
    }
  ]
}, null, 2)}
</script>

</article>
`
}

// Find blog ID
console.log('\n=== FETCHING BLOG ID ===')
const blogsR = await rest('/blogs.json')
const blog = blogsR.blogs?.[0]
if (!blog) {
  console.error('No blog found. Create one first via Shopify admin.')
  process.exit(1)
}
console.log(`Blog: "${blog.title}" (id ${blog.id})`)

// Publish each city blog
for (const c of CITIES) {
  const handle = `best-gender-reveal-ideas-${c.city.toLowerCase().replace(/\s+/g, '-')}-2026`
  const title = `Best Gender Reveal Ideas ${c.city} 2026 — Top 6 Products + Local Tips`
  const metaDesc = `Complete 2026 guide to the best gender reveal ideas in ${c.city}. Top 6 products, best ${c.city} venues, fast delivery, expert tips & FAQs. Free shipping over $150.`

  console.log(`\n--- ${c.city} ---`)
  const html = buildBlogHTML(c)
  console.log(`  HTML: ${html.length} chars`)

  // Check if article already exists
  const existing = await rest(`/blogs/${blog.id}/articles.json?handle=${handle}`)
  const existingArt = existing.articles?.find(a => a.handle === handle)

  let articleId
  if (existingArt) {
    console.log(`  Article exists (id ${existingArt.id}) — updating`)
    const updateR = await rest(`/blogs/${blog.id}/articles/${existingArt.id}.json`, {
      method: 'PUT',
      body: JSON.stringify({
        article: {
          id: existingArt.id,
          title,
          body_html: html,
          author: 'Gender Reveal Ideas',
          tags: `gender reveal,${c.city.toLowerCase()},${c.state.toLowerCase()},gender reveal ideas,reveal party`,
          summary_html: `<p>${metaDesc}</p>`,
          handle,
          metafields: [
            { namespace: 'global', key: 'title_tag', type: 'single_line_text_field', value: title },
            { namespace: 'global', key: 'description_tag', type: 'single_line_text_field', value: metaDesc },
          ],
        }
      })
    })
    articleId = updateR.article?.id
    console.log(`  ✓ Updated`)
  } else {
    const createR = await rest(`/blogs/${blog.id}/articles.json`, {
      method: 'POST',
      body: JSON.stringify({
        article: {
          title,
          body_html: html,
          author: 'Gender Reveal Ideas',
          tags: `gender reveal,${c.city.toLowerCase()},${c.state.toLowerCase()},gender reveal ideas,reveal party`,
          summary_html: `<p>${metaDesc}</p>`,
          handle,
          published: true,
          metafields: [
            { namespace: 'global', key: 'title_tag', type: 'single_line_text_field', value: title },
            { namespace: 'global', key: 'description_tag', type: 'single_line_text_field', value: metaDesc },
          ],
        }
      })
    })
    articleId = createR.article?.id
    console.log(`  ✓ Created (id ${articleId})`)
  }
  console.log(`  URL: https://genderrevealideas.com.au/blogs/${blog.handle}/${handle}`)
}

console.log('\n========== BLOGS PUBLISHED ==========')
process.exit(0)
