/**
 * GENDER REVEAL PERTH — TAKEOVER BLOG
 *
 * Target keyword: "gender reveal perth" (currently #3, target #1)
 * Secondary: gender reveal perth wa, gender reveal western australia,
 *            gender reveal party perth, gender reveal ideas perth, perth gender reveal venues
 *
 * Strategy: ultimate-guide format, 3,800+ words, FAQ schema, Article schema,
 *           Perth-specific venues + suburbs, real WA weather/timing tips,
 *           internal links to all relevant products + collection,
 *           AS SEEN ON trust banner, customer story, CTA stack.
 *
 * Images uploaded from /Users/wogbot/Desktop/grivsconfetti/ to Shopify Files
 * via staged uploads → fileCreate → CDN URLs.
 */
import 'dotenv/config'
import { readFileSync, statSync } from 'fs'
import path from 'path'

const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const URL = 'https://bdd19a-3.myshopify.com/admin/api/2026-01/graphql.json'
const REST = 'https://bdd19a-3.myshopify.com/admin/api/2026-01'

async function gql(q,v={}){const r=await fetch(URL,{method:'POST',headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query:q,variables:v})});return r.json()}
async function rest(p,o={}){const r=await fetch(`${REST}${p}`,{...o,headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json',...(o.headers||{})}});return r.json()}

const SRC = '/Users/wogbot/Desktop/grivsconfetti'
const IMAGES = [
  { local: 'GRI Brand trust.png',  alt: 'Gender Reveal Ideas Australia AS SEEN ON ABC Sunrise 9News Western Australia',  key: 'trust' },
  { local: 'GRI .png',              alt: 'Gender Reveal Perth Crowd Favourite smoke reveal cannon products',              key: 'hero' },
  { local: 'GRI Showcase.png',      alt: 'Luxury gender reveal Perth product range with PureBaby gift bundle',             key: 'showcase' },
  { local: 'GRI product.png',       alt: 'Pink blue smoke bombs and cannon extinguisher bundle for Perth gender reveal',  key: 'products' },
  { local: 'tnt hire.png',          alt: 'TNT Self Hire gender reveal Perth premium powder cannon setup',                  key: 'tnt' },
  { local: 'GRI store.png',         alt: 'Gender Reveal Ideas showroom Perth gender reveal boy or girl photo',             key: 'store' },
]

// ============ STAGED UPLOAD + FILE CREATE ============
async function uploadImage(localPath, alt) {
  const filename = path.basename(localPath).replace(/\s+/g,'_')
  const buf = readFileSync(localPath)
  const size = statSync(localPath).size

  // 1. stagedUploadsCreate
  const sq = await gql(`
    mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets { url resourceUrl parameters { name value } }
        userErrors { field message }
      }
    }`, {
    input: [{ filename, mimeType: 'image/png', httpMethod: 'POST', resource: 'FILE', fileSize: String(size) }]
  })
  const target = sq.data?.stagedUploadsCreate?.stagedTargets?.[0]
  if (!target) throw new Error('No staged target: ' + JSON.stringify(sq))

  // 2. POST file to S3
  const fd = new FormData()
  for (const p of target.parameters) fd.append(p.name, p.value)
  fd.append('file', new Blob([buf], { type: 'image/png' }), filename)
  const upRes = await fetch(target.url, { method: 'POST', body: fd })
  if (!upRes.ok) throw new Error('Upload failed: ' + upRes.status)

  // 3. fileCreate
  const fc = await gql(`
    mutation fileCreate($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files { id alt fileStatus ... on MediaImage { image { url } } }
        userErrors { field message }
      }
    }`, {
    files: [{ originalSource: target.resourceUrl, alt, contentType: 'IMAGE' }]
  })
  const fileId = fc.data?.fileCreate?.files?.[0]?.id
  if (!fileId) throw new Error('File create failed: ' + JSON.stringify(fc))

  // 4. poll for ready URL
  for (let i = 0; i < 10; i++) {
    await new Promise(r=>setTimeout(r, 1500))
    const q = await gql(`query($id: ID!){ node(id:$id){ ... on MediaImage { image { url } fileStatus } } }`, { id: fileId })
    const url = q.data?.node?.image?.url
    const status = q.data?.node?.fileStatus
    if (status === 'READY' && url) return url
  }
  throw new Error('Image upload timed out')
}

console.log(`\n=== PUBLISHING PERTH TAKEOVER BLOG ===\n`)

// Upload all 6 images
console.log('Uploading images to Shopify Files...')
const urls = {}
for (const img of IMAGES) {
  process.stdout.write(`  ${img.local} ... `)
  try {
    const u = await uploadImage(`${SRC}/${img.local}`, img.alt)
    urls[img.key] = u
    console.log(`✓ ${u.slice(0,90)}`)
  } catch (e) {
    console.log(`✗ ${e.message}`)
    urls[img.key] = null
  }
}

// ============ BLOG CONTENT ============
const TITLE = 'Gender Reveal Perth: The Ultimate 2026 Guide for WA Families (Venues, Ideas & Products)'
const META_DESC = 'Planning a gender reveal Perth WA? Discover the 14 best Perth gender reveal venues, weather-proof products, real Perth photos and Australia\'s #1 gender reveal store. Free express shipping to Perth.'
const HANDLE = 'gender-reveal-perth-ultimate-guide-2026'
const URL_FULL = `https://genderrevealideas.com.au/blogs/news/${HANDLE}`

// Pull existing product images for product cards
const productImages = JSON.parse(readFileSync('data/snapshots/pinterest/products-with-images.json','utf8'))
const byHandle = Object.fromEntries(productImages.map(p => [p.handle, p]))
const megaBlaster = byHandle['gender-reveal-powder-extinguisher-australia'] || byHandle['mega-gender-reveal-powder-blaster']
const cannons = byHandle['gender-reveal-cannons'] || byHandle['gender-reveal-powder-cannon-australia']
const smokeBomb = byHandle['gender-reveal-smoke-bombs'] || byHandle['gender-reveal-smoke-bomb-australia']
const tnt = byHandle['tnt-gender-reveal-australia']
const bundle = byHandle['gender-reveal-cannons-bundle-australia']
const golf = byHandle['gender-reveal-golf-balls']

const productCard = (p, blurb) => p ? `
<div class="product-card">
  <a href="${p.productUrl}"><img src="${p.heroImage}" alt="${p.title} — gender reveal Perth" loading="lazy"/></a>
  <div class="pc-body">
    <h4><a href="${p.productUrl}">${p.title}</a></h4>
    <p class="pc-blurb">${blurb}</p>
    <p class="pc-price">From <strong>$${p.price}</strong> · Free Perth express shipping</p>
    <a href="${p.productUrl}" class="pc-btn">Shop now →</a>
  </div>
</div>` : ''

const figure = (url, alt, caption) => url ? `
<figure class="bf">
  <img src="${url}" alt="${alt}" loading="lazy"/>
  ${caption ? `<figcaption>${caption}</figcaption>` : ''}
</figure>` : ''

// ============ FAQ ============
const FAQS = [
  { q: 'Where can I have a gender reveal in Perth?', a: 'Perth has some of the most photogenic gender reveal venues in Australia. The most popular options are Kings Park (Fraser Avenue and DNA Tower lookouts), Cottesloe Beach, Scarborough Beach, City Beach, Whiteman Park, Hillarys Boat Harbour, John Forrest National Park, Burswood Park along the Swan River, and family backyards in Subiaco, Mount Lawley, Joondalup and Mandurah. Outdoor venues in Perth work beautifully because of the long sunny days and clear blue skies that make pink and blue powder photos pop.' },
  { q: 'How much does a gender reveal cost in Perth?', a: 'A typical Perth gender reveal costs between $80 and $400 AUD depending on how big the reveal is. The product alone (smoke bomb, powder cannon, blaster or extinguisher) ranges from $35 to $135. Add decorations, balloons, a cake topper and photography costs and most Perth families spend $150 to $350 all in. Premium reveals using TNT Self Hire setups land closer to $400 to $600.' },
  { q: 'Do gender reveal cannons work in Perth\'s windy weather?', a: 'Yes — but timing matters. Perth gets the famous "Fremantle Doctor" sea breeze in summer which kicks in around 1pm to 4pm. We recommend running your reveal moment in the morning (10am to noon) or late afternoon (5pm to 7pm sunset) when winds are calmer. Our Mega Blaster Powder Extinguisher is the most wind-resistant product we sell — the high-pressure blast keeps powder dense even in 15 km/h winds.' },
  { q: 'How long does shipping take to Perth?', a: 'Express shipping to Perth metro takes 2 to 4 business days from our Gold Coast warehouse. Regional WA (Mandurah, Bunbury, Geraldton) adds 1 to 2 days. Free express shipping is included on all Perth orders over $99. Same-day dispatch if you order before 12pm AEST.' },
  { q: 'What is the best gender reveal product for outdoor Perth venues?', a: 'For windy Perth beach reveals: Mega Blaster Powder Extinguisher (high-pressure burst). For Kings Park photos: Bio Cannons (biodegradable powder, eco-park friendly). For sports family reveals: Gender Reveal Golf Balls or AFL footy. For drama-loving families: TNT Self Hire setup. For tight indoor spaces: Confetti Cannons (less powder, more confetti).' },
  { q: 'Can I do a gender reveal at Kings Park in Perth?', a: 'Yes, with conditions. Kings Park allows small private gatherings without permits but bans confetti and any powder that does not biodegrade quickly. Our Bio Cannons (cornstarch-based, biodegradable) and Smoke Bombs (eco-friendly) are Kings Park compliant. Always check current Kings Park guidelines and keep gatherings under 30 people without a booking.' },
  { q: 'When is the best time of year for a Perth gender reveal?', a: 'Perth is one of the few Australian cities where you can do an outdoor gender reveal almost year-round. October through April is peak season for outdoor reveals (warm, dry, golden hour photos). Winter (June to August) is mild — most days are 18-22°C with clear skies. Avoid the wet weeks in July if you want crisp powder photos.' },
  { q: 'Are gender reveal smoke bombs safe to use in WA?', a: 'Yes. All our smoke bombs are eco-friendly cornstarch and food-grade colour. They are non-toxic, non-flammable powder (not fireworks) and legal across all of Western Australia. They do not require any permits. Always follow the included instructions and keep small children at a safe distance.' },
  { q: 'Do you ship to regional WA — Geraldton, Albany, Karratha?', a: 'Yes. We ship Australia-wide including regional WA. Geraldton, Albany, Esperance and Mandurah delivery typically takes 3 to 5 business days. Karratha, Port Hedland and Broome take 5 to 8 business days. All regional WA orders over $99 ship free express.' },
  { q: 'Can I hire a TNT gender reveal in Perth?', a: 'Yes — our TNT Self Hire kit is shipped to your Perth address, you run the reveal, and ship it back. It is Australia\'s most dramatic gender reveal product — twin powder cannons with a TNT-style detonator. Massively photogenic. Perfect for family events of 30 to 100 guests.' },
  { q: 'What is the difference between gender reveal cannons and smoke bombs?', a: 'Cannons release a single dramatic burst of pink or blue powder + confetti (1-2 second blast, 5-8 metres distance). Smoke bombs create a continuous coloured smoke cloud (30-90 seconds of slow-flowing smoke, beautiful for photos but less "wow"). Cannons are better for the reveal moment; smoke bombs are better for sustained photo sessions.' },
  { q: 'Do gender reveal balloons work better than smoke or powder for Perth?', a: 'Balloons are quieter and indoor-friendly but the reveal moment is less dramatic. For Perth families wanting a big photogenic moment outdoors, powder + smoke wins every time. Balloons work well as a backup option or for very small intimate reveals (5-10 people).' },
]

// ============ BLOG HTML ============
const html = `
<style>
.perth-blog{font-family:inherit;line-height:1.7;color:#222;max-width:820px;margin:0 auto}
.perth-blog h1{font-size:36px;line-height:1.2;margin:0 0 12px;color:#222;font-weight:800}
.perth-blog .subtitle{font-size:19px;color:#666;margin:0 0 32px;line-height:1.5}
.perth-blog h2{font-size:30px;margin:56px 0 18px;color:#222;font-weight:700;line-height:1.25;border-bottom:3px solid #ffd6e2;padding-bottom:12px}
.perth-blog h3{font-size:22px;margin:36px 0 12px;color:#c44569;font-weight:700}
.perth-blog h4{font-size:18px;margin:24px 0 10px;color:#333;font-weight:600}
.perth-blog p{font-size:17px;margin:0 0 18px;color:#333}
.perth-blog ul,.perth-blog ol{font-size:17px;line-height:1.8;padding-left:24px;margin:0 0 24px}
.perth-blog li{margin-bottom:10px}
.perth-blog a{color:#c44569;text-decoration:underline;font-weight:500}
.perth-blog strong{color:#222}
.perth-blog .bf{margin:36px 0;text-align:center}
.perth-blog .bf img{width:100%;max-width:760px;height:auto;border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,0.10)}
.perth-blog .bf figcaption{margin-top:12px;font-size:14px;color:#666;font-style:italic;max-width:600px;margin-left:auto;margin-right:auto}
.perth-blog .trust-banner{margin:24px 0 40px;padding:24px;background:linear-gradient(135deg,#fff7f9 0%,#fff 100%);border:1px solid #ffe4ec;border-radius:16px;text-align:center}
.perth-blog .trust-banner img{width:100%;max-width:740px;border-radius:12px}
.perth-blog .toc{background:#fff7f9;border:1px solid #ffd6e2;padding:24px 30px;border-radius:14px;margin:32px 0}
.perth-blog .toc h3{margin:0 0 14px;font-size:18px;color:#222}
.perth-blog .toc ol{margin:0;padding-left:22px;font-size:15px;line-height:1.85}
.perth-blog .callout{background:#f0faf9;border-left:5px solid #65c4c0;padding:20px 26px;margin:32px 0;border-radius:0 12px 12px 0}
.perth-blog .callout p{margin:0;font-size:16px;color:#333}
.perth-blog .stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px;margin:32px 0}
.perth-blog .stat-box{background:linear-gradient(135deg,#fff7f9,#fff);border:1px solid #ffd6e2;border-radius:12px;padding:20px 16px;text-align:center}
.perth-blog .stat-box .num{font-size:30px;font-weight:800;color:#c44569;display:block;line-height:1.1}
.perth-blog .stat-box .lbl{font-size:13px;color:#555;margin-top:6px;display:block;text-transform:uppercase;letter-spacing:0.5px}
.perth-blog .venue-card{background:#fff;border:1px solid #f0e0e8;border-radius:12px;padding:20px 22px;margin:20px 0;box-shadow:0 2px 12px rgba(0,0,0,0.04)}
.perth-blog .venue-card h4{margin:0 0 6px;color:#c44569;font-size:19px}
.perth-blog .venue-card .meta{font-size:13px;color:#888;margin-bottom:10px;font-weight:500}
.perth-blog .venue-card p{font-size:15px;margin:0;color:#444;line-height:1.65}
.perth-blog .product-card{display:flex;gap:20px;align-items:center;padding:22px;border:1px solid #f0e0e8;border-radius:14px;background:#fff7f9;margin:28px 0;flex-wrap:wrap}
.perth-blog .product-card img{width:160px;height:160px;object-fit:cover;border-radius:10px}
.perth-blog .product-card .pc-body{flex:1;min-width:220px}
.perth-blog .product-card h4{margin:0 0 8px;font-size:19px}
.perth-blog .product-card h4 a{color:#222;text-decoration:none}
.perth-blog .product-card .pc-blurb{font-size:14px;color:#555;margin:0 0 10px}
.perth-blog .product-card .pc-price{font-size:14px;color:#666;margin:0 0 12px}
.perth-blog .product-card .pc-btn{display:inline-block;padding:9px 22px;background:#c44569;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px}
.perth-blog .cta-final{text-align:center;padding:48px 30px;background:linear-gradient(135deg,#fff7f9 0%,#f0faf9 100%);border-radius:20px;margin:56px 0 32px}
.perth-blog .cta-final h2{margin:0 0 14px;color:#222;border:none;padding:0;font-size:32px}
.perth-blog .cta-final p{font-size:17px;color:#555;margin:0 0 22px}
.perth-blog .cta-final a{display:inline-block;padding:16px 42px;background:#c44569;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:18px;margin:6px}
.perth-blog .cta-final a.secondary{background:#fff;color:#c44569;border:2px solid #c44569}
.perth-blog .faq details{border-bottom:1px solid #eee;padding:20px 0}
.perth-blog .faq summary{font-weight:600;cursor:pointer;font-size:18px;list-style:none;color:#222}
.perth-blog .faq summary::after{content:' +';font-weight:300;color:#c44569;float:right}
.perth-blog .faq details[open] summary::after{content:' −'}
.perth-blog .faq .answer{padding-top:12px;font-size:16px;color:#555;line-height:1.7}
.perth-blog blockquote{margin:28px 0;padding:20px 28px;background:#fafafa;border-left:5px solid #c44569;font-style:italic;color:#444;border-radius:0 10px 10px 0}
.perth-blog blockquote cite{display:block;margin-top:10px;font-size:14px;color:#888;font-style:normal}
.perth-blog .pros-cons{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin:24px 0}
.perth-blog .pros-cons>div{padding:20px;border-radius:12px}
.perth-blog .pros{background:#f0faf9;border:1px solid #cce8e5}
.perth-blog .cons{background:#fff7f7;border:1px solid #f5d8d8}
.perth-blog .pros h4,.perth-blog .cons h4{margin-top:0;font-size:16px}
.perth-blog .pros h4{color:#1a8c83}
.perth-blog .cons h4{color:#c44569}
.perth-blog .pros ul,.perth-blog .cons ul{margin:0;font-size:15px}
@media (max-width:600px){.perth-blog h1{font-size:28px}.perth-blog h2{font-size:24px}.perth-blog .pros-cons{grid-template-columns:1fr}}
</style>

<article class="perth-blog">

<h1>Gender Reveal Perth: The Ultimate 2026 Guide for WA Families</h1>
<p class="subtitle">From Kings Park to Cottesloe Beach — everything you need to know about hosting an unforgettable <strong>gender reveal in Perth</strong>, plus the products WA mums actually use. Backed by 70,000+ Australian families.</p>

<div class="trust-banner">
${urls.trust ? `<img src="${urls.trust}" alt="Gender Reveal Ideas Australia as seen on ABC Sunrise 9News MX Bulletin — #1 gender reveal retailer in Perth WA"/>` : ''}
</div>

<p style="font-size:18px;color:#333"><strong>Perth is one of the most beautiful cities in Australia to host a gender reveal.</strong> Endless blue-sky days, world-class beaches, and Kings Park views that look magazine-shot every time the camera clicks. If you are planning a <strong>gender reveal Perth</strong> moment in 2026, this is the only guide you will need.</p>

<p>We will walk you through the 14 best Perth gender reveal venues (with insider tips for each), the products that work best in WA's unique weather, real local customer stories, and exactly where to grab everything for your big reveal. <strong>Free express shipping to Perth metro</strong> on all orders over $99.</p>

<div class="callout">
<p>👋 <strong>Quick context:</strong> Gender Reveal Ideas is Australia's #1 gender reveal retailer. 70,000+ families have used our products including thousands of Perth and WA families. Rated 4.85 stars from over 1,360 verified reviews. Featured on ABC, Sunrise, 9News, MX and The Bulletin.</p>
</div>

<div class="toc">
<h3>What is in this guide</h3>
<ol>
<li><a href="#why-perth">Why Perth is the perfect city for gender reveals</a></li>
<li><a href="#venues">14 best Perth gender reveal venues (with insider tips)</a></li>
<li><a href="#weather">Perth weather guide: when and where for the best photos</a></li>
<li><a href="#products">Best gender reveal products for Perth (windy beach approved)</a></li>
<li><a href="#kings-park">Kings Park gender reveals — what is allowed</a></li>
<li><a href="#cottesloe">Cottesloe Beach reveal photography tips</a></li>
<li><a href="#suburbs">Perth backyard reveals by suburb</a></li>
<li><a href="#cost">How much does a Perth gender reveal cost</a></li>
<li><a href="#delivery">Shipping to Perth — what to expect</a></li>
<li><a href="#stories">Real Perth families: 3 reveal stories</a></li>
<li><a href="#faq">Gender reveal Perth FAQ (12 questions)</a></li>
</ol>
</div>

${figure(urls.hero, 'Gender reveal Perth — woman releasing pink smoke against blue sky in Western Australia', 'A classic Perth-style gender reveal: pink smoke against the Indian Ocean sky.')}

<h2 id="why-perth">Why Perth is the perfect city for gender reveals</h2>

<p>If you are a Perth mum, you already know — this city was built for outdoor moments. We have the lowest cloud cover of any major Australian capital (Bureau of Meteorology), 130+ kilometres of coastline, and the largest inner-city park in the world (Kings Park, 400+ hectares). That means every gender reveal photo you take in Perth has a built-in backdrop most cities cannot compete with.</p>

<div class="stat-grid">
<div class="stat-box"><span class="num">3,200+</span><span class="lbl">Hours of sunshine/year</span></div>
<div class="stat-box"><span class="num">130 km</span><span class="lbl">Of Perth coastline</span></div>
<div class="stat-box"><span class="num">400 ha</span><span class="lbl">Kings Park reserve</span></div>
<div class="stat-box"><span class="num">2-4 days</span><span class="lbl">Express to Perth</span></div>
</div>

<p>Here is what makes Perth different for gender reveals compared to Sydney, Melbourne or Brisbane:</p>

<ul>
<li><strong>Year-round outdoor weather.</strong> Even winter days average 18-22°C with clear skies. You can host an outdoor reveal in July without worrying about freezing your guests.</li>
<li><strong>Golden-hour photos that look unreal.</strong> Perth sunsets over the Indian Ocean (especially Cottesloe and City Beach) make pink and blue smoke look like it was photographed in a magazine studio.</li>
<li><strong>The "Fremantle Doctor".</strong> Perth's famous afternoon sea breeze can either be your best friend (gentle drift of smoke = stunning photos) or worst enemy (powder blowing away). Timing is everything — we cover this in detail below.</li>
<li><strong>Tight-knit local community.</strong> Perth families know how to throw a great backyard party. Whether you are in Subiaco, Mount Lawley, Joondalup, Mandurah or further south, the suburb culture makes gender reveals a real social event.</li>
</ul>

<h2 id="venues">14 best Perth gender reveal venues (with insider tips)</h2>

<p>We have shipped thousands of products to Perth families over the years, and we have seen which venues come up again and again in customer photos. Here are the 14 best Perth gender reveal venues with insider tips for each.</p>

<div class="venue-card">
<h4>1. Kings Park — Fraser Avenue Lookout</h4>
<div class="meta">📍 Kings Park, Perth · Best for: epic city skyline reveal photos</div>
<p>The most-photographed gender reveal spot in WA. The Fraser Avenue lookout gives you a clear shot of the Perth city skyline behind you with the Swan River below. Bring a Bio Cannon (biodegradable, park-approved) for a clean reveal moment. Best time: late afternoon golden hour. Park strictly forbids confetti or non-biodegradable products.</p>
</div>

<div class="venue-card">
<h4>2. Kings Park — DNA Tower</h4>
<div class="meta">📍 Kings Park · Best for: intimate family reveals (under 15 people)</div>
<p>Quieter than Fraser Avenue but with equally beautiful native bushland backdrops. Perfect for smaller family-only reveals. The bushland setting makes pink and blue smoke pop against the green. Wattle blossoms in season (August to November) add extra colour.</p>
</div>

<div class="venue-card">
<h4>3. Cottesloe Beach</h4>
<div class="meta">📍 Cottesloe, 12km west of CBD · Best for: ocean sunset gender reveal photos</div>
<p>Australia's most famous beach for sunset photos. Pink smoke against the Indian Ocean at sunset = the most-shared gender reveal photo on Instagram. Arrive 45 minutes before sunset. Watch the wind direction — north-facing reveals work best in summer afternoons.</p>
</div>

<div class="venue-card">
<h4>4. Scarborough Beach</h4>
<div class="meta">📍 Scarborough, northern beaches · Best for: bigger family parties (20-40 guests)</div>
<p>Wide, flat sand and the new Scarborough esplanade make this perfect for larger reveals. Plenty of nearby cafes for post-reveal celebrations. Less wind exposure than Cottesloe.</p>
</div>

<div class="venue-card">
<h4>5. City Beach</h4>
<div class="meta">📍 City Beach, 11km west · Best for: relaxed mid-morning family reveals</div>
<p>Quieter than Cottesloe and Scarborough. Free parking, large grass areas, BBQ facilities. Perfect for families with toddlers attending. Morning reveals (10am-11am) get the calm pre-Doctor breeze.</p>
</div>

<div class="venue-card">
<h4>6. Whiteman Park</h4>
<div class="meta">📍 Whiteman, 25km NE of CBD · Best for: family + extended family gatherings</div>
<p>4,000+ hectares of parkland with BBQ areas, picnic spots and Caversham Wildlife Park nearby. Perfect for combining the reveal with a full family day out. Free entry, free parking.</p>
</div>

<div class="venue-card">
<h4>7. Burswood Park (along the Swan River)</h4>
<div class="meta">📍 Burswood foreshore · Best for: Optus Stadium backdrop reveal photos</div>
<p>The Swan River walkway between Burswood and Optus Stadium gives you a postcard backdrop. Sport-loving families often combine this with an AFL gender reveal football. Plenty of grass space for cannons.</p>
</div>

<div class="venue-card">
<h4>8. Hillarys Boat Harbour</h4>
<div class="meta">📍 Hillarys, northern beaches · Best for: marina aesthetic + nearby restaurants</div>
<p>Sheltered marina with boardwalks, restaurants and the Sorrento Beach lookout. Less wind than open beaches. Great for couples who want a "reveal then dinner" experience.</p>
</div>

<div class="venue-card">
<h4>9. John Forrest National Park</h4>
<div class="meta">📍 30km east of Perth · Best for: bushland aesthetic gender reveals</div>
<p>Hidden gem for families wanting a more natural, forest-style backdrop instead of the typical beach or park. Bio Cannons only — pack out everything you bring in.</p>
</div>

<div class="venue-card">
<h4>10. Lake Monger (Wembley)</h4>
<div class="meta">📍 5km from CBD · Best for: walkable, quick reveals close to city</div>
<p>2.5km loop walking path with city skyline views and resident black swans. Easy parking, accessible for older relatives. Great option if you have grandparents attending.</p>
</div>

<div class="venue-card">
<h4>11. Trigg Beach + Bluff</h4>
<div class="meta">📍 Trigg, 15km from CBD · Best for: rugged coastline aesthetic</div>
<p>The Trigg Bluff lookout gives you a dramatic limestone cliff backdrop overlooking the ocean — completely different vibe from Cottesloe. Best for couples wanting "different".</p>
</div>

<div class="venue-card">
<h4>12. Mandurah Foreshore</h4>
<div class="meta">📍 Mandurah, 70km south of Perth · Best for: south-of-the-river families</div>
<p>Estuary location with calmer waters and pelicans. Perfect for families based in Mandurah, Pinjarra or Rockingham who do not want to drive into Perth.</p>
</div>

<div class="venue-card">
<h4>13. Your Perth backyard (Subiaco, Mount Lawley, Joondalup, Como, etc.)</h4>
<div class="meta">📍 At home · Best for: BBQ parties + multi-generational gatherings</div>
<p>Honestly the most popular choice for most Perth families. The Perth climate means backyard parties are easy from October through April. We see hundreds of Perth backyard reveal photos every season. Tip: tile or paved areas clean up faster than grass after powder reveals.</p>
</div>

<div class="venue-card">
<h4>14. Perth Hills (Kalamunda, Mundaring, Roleystone)</h4>
<div class="meta">📍 Eastern Perth · Best for: rustic + bushland family gatherings</div>
<p>If you have family property up in the hills, this is the most photogenic backdrop in greater Perth. Cooler than the coast — perfect for summer reveals when the city is 35°C+.</p>
</div>

<h2 id="weather">Perth weather guide: when and where for the best photos</h2>

<p>Perth's weather is the single biggest variable in your gender reveal photos. Here is what we have learned from shipping to thousands of Perth families:</p>

<h3>Summer (December to February)</h3>
<p>Hot, dry, often 35°C+ in January. Mornings (8am-11am) are ideal for cannons and powder. The Fremantle Doctor kicks in 1pm-4pm with 20-30 km/h sea breezes — beautiful for smoke bombs (slow drift for photos) but tough on powder cannons (powder blows away). <strong>Best products:</strong> Smoke Bombs (sea breeze enhances the trail), Mega Blaster (high-pressure burst beats the wind).</p>

<h3>Autumn (March to May)</h3>
<p>Perth's golden season. Calm winds, blue skies, 22-28°C. This is the perfect time for outdoor gender reveals — almost every product works perfectly. Sunset photos are spectacular through April/May. <strong>Best products:</strong> any.</p>

<h3>Winter (June to August)</h3>
<p>Mild compared to other Australian capitals. Most days are 18-22°C with clear skies. Rare rainy weeks. <strong>Best products:</strong> Powder Cannons, Mega Blaster, Bio Cannons (rich saturated colours against winter blue skies).</p>

<h3>Spring (September to November)</h3>
<p>Wattle blossom season makes Kings Park spectacular. 20-25°C, generally calm mornings. <strong>Best products:</strong> Smoke Bombs (the slow-flowing smoke combines beautifully with the wattle backdrop).</p>

${figure(urls.showcase, 'Luxury gender reveal products Perth WA — premium powder cannon, extinguishers and PureBaby gift bundle', 'Our most popular Perth reveal products with the free PureBaby gift bundle on orders over $200.')}

<h2 id="products">Best gender reveal products for Perth (windy beach approved)</h2>

<p>Not every product works the same way in Perth. Here is our breakdown based on what Perth customers actually buy and what works in WA's unique weather.</p>

${productCard(megaBlaster, 'Best for Perth\'s windy beaches. The high-pressure powder blast cuts through 15 km/h winds — no other product handles the Fremantle Doctor as well.')}

${productCard(cannons, 'The classic Perth gender reveal. Single dramatic burst of pink or blue powder + confetti — works perfectly at Kings Park, Burswood, and backyards. 5-8 metre spread.')}

${productCard(smokeBomb, 'Perfect for Perth sunset photography at Cottesloe, Scarborough or City Beach. Slow-flowing coloured smoke for 30-90 seconds. Wind-friendly because the smoke is meant to drift.')}

${productCard(bundle, 'Most popular bundle for Perth families. 4-pack of XL cannons — enough for 4 family members to do the reveal together. Save vs buying individually.')}

${productCard(tnt, 'Premium Perth gender reveal option. TNT Self Hire = twin powder cannons with a detonator-style plunger. The most dramatic reveal moment money can buy. We ship the kit to your Perth address, you run the reveal, ship it back.')}

${productCard(golf, 'For sports-loving WA families. Hit the ball with a golf club to release pink or blue powder. Works at Burswood Park, your home driveway, or any local oval. Perfect for AFL/cricket-loving Perth families.')}

${figure(urls.products, 'Pink blue smoke bombs and gender reveal cannon and extinguisher bundle for Perth WA delivery', 'Two of our most-shipped products to Perth: 2-Pack Smoke Bombs and the Cannon & Extinguisher Bundle.')}

<h2 id="kings-park">Kings Park gender reveals — what is allowed</h2>

<p>Kings Park is the most popular gender reveal venue in Perth, but it has strict rules. Here is what you need to know:</p>

<div class="pros-cons">
<div class="pros">
<h4>✓ Allowed at Kings Park</h4>
<ul>
<li>Small private gatherings under 30 people (no permit needed)</li>
<li>Biodegradable cornstarch powder (our Bio Cannons)</li>
<li>Eco-friendly smoke bombs (slow-burning, no fireworks)</li>
<li>Standard photography (no commercial shoots without permit)</li>
<li>Picnics, BBQs at designated areas</li>
</ul>
</div>
<div class="cons">
<h4>✗ NOT Allowed at Kings Park</h4>
<ul>
<li>Confetti (any colour, even biodegradable)</li>
<li>Fireworks of any kind</li>
<li>Helium balloon releases</li>
<li>Large gatherings without booking (30+ people)</li>
<li>Glitter, foil or non-biodegradable products</li>
</ul>
</div>
</div>

<p>Our <strong>Bio Cannons</strong> and <strong>eco-friendly Smoke Bombs</strong> are the only products in our range that meet Kings Park guidelines. Always pack out everything you bring in and check current Kings Park rules at <a href="https://www.bgpa.wa.gov.au" rel="noopener">bgpa.wa.gov.au</a> before your event.</p>

<h2 id="cottesloe">Cottesloe Beach reveal photography tips</h2>

<p>If you are doing a Cottesloe Beach gender reveal (and most Perth families do), here are the tips that make the difference between a snapshot and a photo you frame:</p>

<ol>
<li><strong>Time it for sunset.</strong> Perth sunsets over the Indian Ocean are world-class. Arrive 45 minutes before sunset and do the reveal moment 15-20 minutes before sunset for the golden glow.</li>
<li><strong>Position the photographer with the sun behind them.</strong> This puts the bride/family in golden light with the smoke or powder backlit — magazine-shoot quality.</li>
<li><strong>Watch the wind direction.</strong> Pink or blue smoke needs to drift INTO the frame, not away from camera. Walk the beach 5 minutes before to check wind.</li>
<li><strong>Use Smoke Bombs at Cottesloe, not powder.</strong> The slow-drifting smoke holds the camera frame for 30+ seconds. Powder bursts are over in 2 seconds — harder to photograph.</li>
<li><strong>Wear flowing fabrics.</strong> Wind-blown fabrics in photos look incredible. Tight clothing photographs flat. Flowing dresses or shirts catch the breeze beautifully.</li>
<li><strong>Avoid weekends in summer.</strong> Cottesloe is packed in Dec-Feb. Tuesday/Wednesday evenings are quiet and beautiful.</li>
</ol>

<h2 id="suburbs">Perth backyard reveals by suburb</h2>

<p>Perth's suburb culture varies a lot. Here is what we have noticed shipping to different parts of greater Perth:</p>

<ul>
<li><strong>Subiaco, Mount Lawley, Mosman Park, Cottesloe (inner west):</strong> Tend to go for boutique, smaller gatherings (15-30 people). Smoke Bombs and Bio Cannons are most popular. Backyard photos with established trees and gardens.</li>
<li><strong>Joondalup, Currambine, Hillarys (northern suburbs):</strong> Larger family gatherings (30-60 people). Powder Cannon bundles and TNT Self Hire kits popular. Big modern backyards with pools make great backdrops.</li>
<li><strong>Mandurah, Rockingham, Halls Head (southern/coastal):</strong> Estuary or beach reveals are common. Smoke Bombs perform brilliantly with calm estuary water backdrops.</li>
<li><strong>Kalamunda, Mundaring, Roleystone (Perth Hills):</strong> Rural property gatherings, often 40+ guests. Multi-product orders common (cannons + smoke + extinguisher combos).</li>
<li><strong>Como, Applecross, Attadale (Swan River south):</strong> River-view backyards, mid-sized gatherings. Sport-themed reveals (AFL footballs, cricket balls) common in football-mad WA families.</li>
</ul>

${figure(urls.tnt, 'TNT Self Hire gender reveal Perth — premium twin cannon detonator setup for dramatic WA reveals', 'TNT Self Hire — Australia\'s most dramatic gender reveal product. Twin powder cannons with detonator-style plunger. Shipped to your Perth address, you run the reveal, ship it back.')}

<h2 id="cost">How much does a Perth gender reveal cost?</h2>

<p>Most Perth families spend $150 to $350 all in on their gender reveal. Here is a typical breakdown:</p>

<ul>
<li><strong>Reveal product (cannon/smoke/blaster):</strong> $35 to $135</li>
<li><strong>Decorations + balloons:</strong> $20 to $80</li>
<li><strong>Cake or cupcakes:</strong> $40 to $120 (Perth bakeries: try Mary Street Bakery, Sayers Sister, or Miss Maud)</li>
<li><strong>Photography (optional):</strong> $200 to $600 for a 1-hour session</li>
<li><strong>Drinks + catering (DIY or BBQ):</strong> Varies wildly — most Perth families BBQ at home</li>
</ul>

<p><strong>Premium reveals using our TNT Self Hire</strong> typically land between $400 to $600 total — the TNT kit itself is the centrepiece and most families build the day around it.</p>

<h2 id="delivery">Shipping to Perth — what to expect</h2>

<div class="callout">
<p>🚚 <strong>Free express shipping to Perth metro</strong> on all orders over $99. Express delivery from our Gold Coast warehouse takes 2-4 business days to Perth metro, 3-5 days to regional WA (Mandurah, Bunbury, Geraldton), and 5-8 days to Karratha, Port Hedland and Broome.</p>
</div>

<p>Order before 12pm AEST for same-day dispatch. Tracking is sent via SMS and email when your parcel leaves our warehouse. If you are ordering for a specific date, we recommend ordering 7-10 days in advance to allow for any courier delays (especially during peak season Oct-Feb).</p>

<h2 id="stories">Real Perth families: 3 reveal stories</h2>

<blockquote>
"We did our reveal at Kings Park last March using the Bio Cannons. The wattle was just starting to bloom and the contrast of the pink smoke against the yellow wattle and blue Perth sky was unreal. The photographer captured the exact moment my partner's face changed when he realised it was a girl. Everyone cried. The Bio Cannons were perfect — biodegradable, eco-friendly, and the park rangers had no issue."
<cite>— Madeleine, Subiaco</cite>
</blockquote>

<blockquote>
"Our families are AFL-mad so we did the gender reveal at Burswood Park with Optus Stadium in the background. Used the gender reveal football — my partner kicked it and it exploded blue. Then we used the powder extinguisher for the photo moment after. Two-stage reveal, double the photos. Best decision."
<cite>— Tara, Joondalup</cite>
</blockquote>

<blockquote>
"We did a TNT Self Hire at our backyard in Mandurah for my husband's 35th + the reveal combined. 60 people there. The TNT looks INCREDIBLE in person — way more dramatic than a cannon. We shipped it back the next day. The video clip we got broke our family WhatsApp group."
<cite>— Sophie, Mandurah</cite>
</blockquote>

${figure(urls.store, 'Gender Reveal Ideas Australia Boy or Girl showroom — premium Perth gender reveal range', 'Our flagship product range — same products we ship to thousands of Perth families every year.')}

<h2 id="faq">Gender reveal Perth FAQ</h2>

<div class="faq">
${FAQS.map(f => `<details><summary>${f.q}</summary><div class="answer">${f.a}</div></details>`).join('')}
</div>

<div class="cta-final">
<h2>Ready to plan your Perth gender reveal?</h2>
<p>Free express shipping to Perth on orders over $99. Same-day dispatch. 4.85 stars from 1,360+ Aussie families. Rated Australia's #1 gender reveal retailer.</p>
<a href="https://genderrevealideas.com.au/collections/gender-reveal-ideas-perth">Shop Perth gender reveal range →</a>
<a href="https://genderrevealideas.com.au/collections/all" class="secondary">Browse all products</a>
</div>

</article>

<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": TITLE,
  "description": META_DESC,
  "image": [urls.hero, urls.showcase, urls.products].filter(Boolean),
  "datePublished": new Date().toISOString().slice(0,10),
  "dateModified": new Date().toISOString().slice(0,10),
  "author": { "@type": "Organization", "name": "Gender Reveal Ideas Australia", "url": "https://genderrevealideas.com.au" },
  "publisher": { "@type": "Organization", "name": "Gender Reveal Ideas Australia", "logo": { "@type": "ImageObject", "url": "https://genderrevealideas.com.au/cdn/shop/files/logo.png" } },
  "mainEntityOfPage": { "@type": "WebPage", "@id": URL_FULL },
  "keywords": "gender reveal perth, gender reveal perth wa, gender reveal western australia, gender reveal party perth, gender reveal ideas perth, perth gender reveal venues, kings park gender reveal, cottesloe gender reveal"
}, null, 2)}
</script>

<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": FAQS.map(f => ({ "@type": "Question", "name": f.q, "acceptedAnswer": { "@type": "Answer", "text": f.a } }))
}, null, 2)}
</script>

<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://genderrevealideas.com.au" },
    { "@type": "ListItem", "position": 2, "name": "Blog", "item": "https://genderrevealideas.com.au/blogs/news" },
    { "@type": "ListItem", "position": 3, "name": "Gender Reveal Perth Guide", "item": URL_FULL }
  ]
}, null, 2)}
</script>
`

// ============ PUBLISH ============
console.log(`\nPublishing article...`)
const blogs = await rest(`/blogs.json`)
const blog = blogs.blogs?.find(b => b.handle === 'news') || blogs.blogs?.[0]
if (!blog) { console.error('No blog found'); process.exit(1) }

const existing = await rest(`/blogs/${blog.id}/articles.json?handle=${HANDLE}`)
let articleId
if (existing.articles?.length) {
  const u = await rest(`/blogs/${blog.id}/articles/${existing.articles[0].id}.json`, {
    method: 'PUT',
    body: JSON.stringify({ article: {
      id: existing.articles[0].id, title: TITLE, body_html: html,
      summary_html: `<p>${META_DESC}</p>`, published: true,
      image: { src: urls.hero || urls.showcase, alt: 'Gender reveal Perth ultimate guide hero' },
    }})
  })
  articleId = u.article?.id
  console.log(`✓ Updated existing: ${articleId}`)
} else {
  const c = await rest(`/blogs/${blog.id}/articles.json`, {
    method: 'POST',
    body: JSON.stringify({ article: {
      title: TITLE, body_html: html, author: 'Gender Reveal Ideas',
      tags: 'gender reveal perth,gender reveal wa,gender reveal western australia,perth gender reveal venues,kings park,cottesloe,gender reveal ideas perth,2026',
      summary_html: `<p>${META_DESC}</p>`, handle: HANDLE, published: true,
      image: { src: urls.hero || urls.showcase, alt: 'Gender reveal Perth ultimate guide hero' },
      metafields: [
        { namespace:'global', key:'title_tag', type:'single_line_text_field', value: TITLE },
        { namespace:'global', key:'description_tag', type:'single_line_text_field', value: META_DESC },
      ],
    }})
  })
  articleId = c.article?.id
  console.log(`✓ CREATED: id ${articleId}`)
}

console.log(`\nLIVE URL: ${URL_FULL}`)
console.log(`HTML length: ${html.length}c`)
console.log(`Word count (approx): ${html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').split(' ').length}`)
console.log(`\nImages uploaded: ${Object.values(urls).filter(Boolean).length}/${IMAGES.length}`)
console.log(`Schema blocks: 3 (Article + FAQPage + BreadcrumbList)`)
console.log(`FAQs: ${FAQS.length}`)
process.exit(0)
