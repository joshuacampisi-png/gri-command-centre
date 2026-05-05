/**
 * rebuild-location-pages.js
 * Rebuilds all 10 Shopify location collection pages with optimised UX.
 *
 * Usage:
 *   node scripts/rebuild-location-pages.js --dry-run              # preview to /tmp
 *   node scripts/rebuild-location-pages.js --dry-run --city=gold-coast  # single city
 *   node scripts/rebuild-location-pages.js                         # push all 10 live
 *   node scripts/rebuild-location-pages.js --city=brisbane          # push single city
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

// Load .env
const envText = fs.readFileSync(path.join(ROOT, '.env'), 'utf8')
for (const line of envText.split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
}

const STORE = process.env.SHOPIFY_STORE_DOMAIN
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN
const API = `https://${STORE}/admin/api/2026-01`

// ── CLI flags ──
const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const cityFlag = args.find(a => a.startsWith('--city='))?.split('=')[1] || null

// ── Shopify helpers ──
async function shopFetch(urlPath) {
  const res = await fetch(`${API}${urlPath}`, {
    headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' }
  })
  if (!res.ok) throw new Error(`Shopify GET ${urlPath}: ${res.status}`)
  return res.json()
}

async function shopPut(urlPath, body) {
  const res = await fetch(`${API}${urlPath}`, {
    method: 'PUT',
    headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Shopify PUT ${urlPath}: ${res.status} — ${txt.slice(0, 300)}`)
  }
  return res.json()
}

async function getCollectionByHandle(handle) {
  const custom = await shopFetch(`/custom_collections.json?handle=${encodeURIComponent(handle)}&limit=1`)
  if (custom.custom_collections?.length) return { type: 'custom_collections', id: custom.custom_collections[0].id }
  const smart = await shopFetch(`/smart_collections.json?handle=${encodeURIComponent(handle)}&limit=1`)
  if (smart.smart_collections?.length) return { type: 'smart_collections', id: smart.smart_collections[0].id }
  return null
}

// ── Curated product handles (12 best sellers) ──
const CURATED_HANDLES = [
  'gender-reveal-extinguisher-australia',
  'mini-powder-gender-reveal-blaster',
  'gender-reveal-cannons',
  'gender-reveal-smoke-bomb-australia',
  'gender-reveal-powder-cannons',
  'double-trouble-twins-reveal-bundle',
  'the-grandparent-moment-bundle',
  'pokemon-gender-reveal',
  'gender-reveal-powder-basketball',
  'gender-reveal-burnout-powder',
  'official-gender-reveal-pet-bandana',
  'gender-reveal-cricket-ball',
]

const THREE_MONTHS_AGO = new Date('2026-01-09')

async function fetchCuratedProducts() {
  console.log('Fetching products from Shopify...')
  const data = await shopFetch('/products.json?limit=250&fields=id,title,handle,images,variants,status')
  const products = (data.products || []).filter(p => p.status === 'active')
  const curated = []
  for (const handle of CURATED_HANDLES) {
    const p = products.find(x => x.handle === handle)
    if (!p) { console.warn(`  [SKIP] ${handle} not found`); continue }
    const recentImgs = (p.images || []).filter(i => new Date(i.created_at) >= THREE_MONTHS_AGO)
    const img = recentImgs.length ? recentImgs[0] : p.images[0]
    const imgUrl = img?.src?.split('?')[0] + '?width=400&height=400&crop=center' || ''
    const price = p.variants?.[0]?.price || '0'
    const comparePrice = p.variants?.[0]?.compare_at_price || null
    curated.push({ handle, title: p.title, price, comparePrice, imgUrl })
  }
  console.log(`  ${curated.length} curated products loaded`)
  return curated
}

// ── City data ──
const CITIES = [
  {
    name: 'Gold Coast',
    handle: 'gender-reveal-ideas-gold-coast',
    deliveryTime: 'next day',
    heroLine: 'Your local store, based right here on the Gold Coast. Same day dispatch with next day delivery to your door.',
    localSpots: 'Burleigh Heads, Broadbeach parklands, or the Currumbin Valley hinterland',
    weatherTip: 'The Gold Coast\'s subtropical climate means year round reveals, with May to October offering the driest conditions.',
    faq1: { q: 'How fast is delivery on the Gold Coast?', a: 'We\'re based on the Gold Coast so you get next day delivery on all orders dispatched before 2pm. Most Gold Coast orders arrive within 24 hours.' },
    faq2: { q: 'Where\'s the best place for a gender reveal on the Gold Coast?', a: 'Burleigh Heads lookout, Broadwater Parklands, and the Currumbin Valley hinterland are all popular spots. Our products are 100% safe, eco friendly, and designed for outdoor celebrations at any venue.' },
  },
  {
    name: 'Brisbane',
    handle: 'gender-reveal-ideas-brisbane',
    deliveryTime: 'next day',
    heroLine: 'Brisbane\'s biggest range of gender reveal products, shipped express from our Gold Coast warehouse with next day delivery.',
    localSpots: 'New Farm Park, South Bank, or the Mt Coot-tha lookout',
    weatherTip: 'Brisbane\'s dry season from May to October is ideal for outdoor reveals.',
    faq1: { q: 'How fast is delivery to Brisbane?', a: 'We ship from the Gold Coast so Brisbane orders arrive next day on everything dispatched before 2pm. Metro and Greater Brisbane covered.' },
    faq2: { q: 'Best spots for a gender reveal in Brisbane?', a: 'New Farm Park, Kangaroo Point Cliffs, South Bank, and Roma Street Parklands are all crowd favourites. Our products are Australian standard, eco friendly, and perfect for any outdoor celebration.' },
  },
  {
    name: 'Queensland',
    handle: 'gender-reveal-ideas-queensland',
    deliveryTime: '1 to 3 business days',
    heroLine: 'Queensland\'s biggest range of gender reveal products. Express shipping from our Gold Coast warehouse to anywhere in QLD.',
    localSpots: 'your local park, beach, or backyard',
    weatherTip: 'Queensland\'s warm climate means outdoor reveals work year round. Avoid the wet season (Dec to Feb) in the tropics.',
    faq1: { q: 'How fast is delivery across Queensland?', a: 'SEQ (Brisbane, Gold Coast, Sunshine Coast) gets next day delivery. Regional QLD including Cairns, Townsville, and Mackay receives orders in 2 to 3 business days.' },
    faq2: { q: 'Can I use gender reveal products in Queensland parks?', a: 'Absolutely! Our products meet Australian safety standards, are 100% biodegradable, and are designed for outdoor celebrations. Perfect for parks, backyards, beaches, and private venues across Queensland.' },
  },
  {
    name: 'Sydney',
    handle: 'gender-reveal-ideas-sydney',
    deliveryTime: '1 to 2 business days',
    heroLine: 'Sydney\'s biggest range of gender reveal products. Express shipping from the Gold Coast with 1 to 2 business day delivery.',
    localSpots: 'Centennial Park, the Royal Botanic Garden, or Manly Beach',
    weatherTip: 'Sydney\'s mild autumn (March to May) and spring (September to November) are ideal for outdoor reveals.',
    faq1: { q: 'How fast is delivery to Sydney?', a: 'Sydney metro orders arrive in 1 to 2 business days. We also cover the Blue Mountains, Central Coast, and Wollongong in the same timeframe.' },
    faq2: { q: 'Where can I do a gender reveal in Sydney?', a: 'Centennial Park, the Royal Botanic Garden, and Manly Beach are crowd favourites. Our products are Australian standard, safe for outdoor use, and 100% biodegradable. Perfect for any Sydney venue.' },
  },
  {
    name: 'New South Wales',
    handle: 'gender-reveal-ideas-new-south-wales',
    deliveryTime: '1 to 3 business days',
    heroLine: 'New South Wales\' biggest range of gender reveal products. Express shipping from the Gold Coast to anywhere in NSW.',
    localSpots: 'your local park, beach, or backyard',
    weatherTip: 'NSW offers great conditions year round. Spring and autumn are the sweet spot for outdoor reveals.',
    faq1: { q: 'How fast is delivery across NSW?', a: 'Sydney metro and surrounding areas receive orders in 1 to 2 business days. Regional NSW including Newcastle, Wollongong, and the Hunter Valley arrive in 2 to 3 business days.' },
    faq2: { q: 'Are gender reveal products safe to use?', a: 'Yes! All our products meet Australian safety standards and are designed for safe, fun outdoor celebrations. They are 100% non toxic, biodegradable, and trusted by over 70,000 Australian families.' },
  },
  {
    name: 'Melbourne',
    handle: 'gender-reveal-ideas-melbourne',
    deliveryTime: '1 to 2 business days',
    heroLine: 'Melbourne\'s biggest range of gender reveal products. Express shipping from the Gold Coast with 1 to 2 business day delivery.',
    localSpots: 'the Royal Botanic Gardens, Princes Park, or the Yarra Trail',
    weatherTip: 'Melbourne weather is unpredictable. Spring (September to November) gives you the best chance of sunshine for an outdoor reveal.',
    faq1: { q: 'How fast is delivery to Melbourne?', a: 'Melbourne metro orders arrive in 1 to 2 business days. We also cover Geelong, the Mornington Peninsula, and outer suburbs in the same timeframe.' },
    faq2: { q: 'Best places for a gender reveal in Melbourne?', a: 'Royal Botanic Gardens, Princes Park, Fitzroy Gardens, and the Yarra Trail are all crowd favourites. Our products are safe, eco friendly, and designed for unforgettable outdoor celebrations.' },
  },
  {
    name: 'Victoria',
    handle: 'gender-reveal-ideas-victoria',
    deliveryTime: '1 to 3 business days',
    heroLine: 'Victoria\'s biggest range of gender reveal products. Express shipping from the Gold Coast to anywhere in VIC.',
    localSpots: 'your local park, garden, or backyard',
    weatherTip: 'Spring and early autumn offer the most reliable weather across Victoria.',
    faq1: { q: 'How fast is delivery across Victoria?', a: 'Melbourne metro receives orders in 1 to 2 business days. Regional Victoria including Ballarat, Bendigo, and the Mornington Peninsula arrives in 2 to 3 business days.' },
    faq2: { q: 'Are your products safe for outdoor celebrations?', a: 'Yes! Every product meets Australian safety standards, is 100% non toxic, and fully biodegradable. Trusted by over 70,000 families across Australia. Perfect for parks, gardens, and backyards.' },
  },
  {
    name: 'Perth',
    handle: 'gender-reveal-ideas-perth',
    deliveryTime: '2 to 3 business days',
    heroLine: 'Perth\'s biggest range of gender reveal products. Express shipping from the Gold Coast with 2 to 3 business day delivery.',
    localSpots: 'Kings Park, Cottesloe Beach, or the Swan Valley',
    weatherTip: 'Perth\'s dry summer and mild winter mean almost any time of year works for an outdoor reveal.',
    faq1: { q: 'How fast is delivery to Perth?', a: 'Perth metro orders arrive in 2 to 3 business days. We ship from the Gold Coast so WA orders take a little longer than east coast but we always dispatch same day.' },
    faq2: { q: 'Where can I do a gender reveal in Perth?', a: 'Kings Park, Cottesloe Beach, and the Swan Valley are all crowd favourites. Our products are safe, eco friendly, and designed for beautiful outdoor celebrations at any Perth venue.' },
  },
  {
    name: 'Adelaide',
    handle: 'gender-reveal-ideas-adelaide',
    deliveryTime: '2 to 3 business days',
    heroLine: 'Adelaide\'s biggest range of gender reveal products. Express shipping from the Gold Coast with 2 to 3 business day delivery.',
    localSpots: 'the Adelaide Botanic Garden, Glenelg Beach, or the Adelaide Hills',
    weatherTip: 'Adelaide\'s mild spring and autumn are ideal for outdoor reveals.',
    faq1: { q: 'How fast is delivery to Adelaide?', a: 'Adelaide metro orders arrive in 2 to 3 business days. Same day dispatch from our Gold Coast warehouse on all orders before 2pm.' },
    faq2: { q: 'Best spots for a gender reveal in Adelaide?', a: 'The Botanic Garden, Glenelg Beach, and the Adelaide Hills are all crowd favourites. Our products are Australian standard, fully biodegradable, and perfect for creating unforgettable celebration moments.' },
  },
  {
    name: 'Darwin',
    handle: 'gender-reveal-ideas-darwin',
    deliveryTime: '3 to 5 business days',
    heroLine: 'Darwin\'s biggest range of gender reveal products. Express shipping from the Gold Coast to the Top End.',
    localSpots: 'Mindil Beach, East Point Reserve, or the Esplanade',
    weatherTip: 'The dry season (May to October) is best for outdoor reveals in Darwin. Avoid the wet season for outdoor events.',
    faq1: { q: 'How fast is delivery to Darwin?', a: 'Darwin orders arrive in 3 to 5 business days. We always dispatch same day from our Gold Coast warehouse.' },
    faq2: { q: 'Can I use gender reveal products outdoors in Darwin?', a: 'Absolutely! Our products are designed for outdoor celebrations and meet Australian safety standards. 100% non toxic, biodegradable, and trusted by thousands of families. The dry season is especially stunning for smoke and powder reveals.' },
  },
]

// ── HTML Template ──
function buildPageHtml(city, products) {
  const productCards = products.map(p => {
    const onSale = p.comparePrice && parseFloat(p.comparePrice) > parseFloat(p.price)
    return `
      <a href="/products/${p.handle}" class="loc-card">
        <div class="loc-card-img">
          <img src="${p.imgUrl}" alt="${p.title}" loading="lazy" width="400" height="400">
        </div>
        <div class="loc-card-info">
          <h3>${p.title}</h3>
          <div class="loc-price">
            <span class="loc-price-now">$${parseFloat(p.price).toFixed(2)}</span>
            ${onSale ? `<span class="loc-price-was">$${parseFloat(p.comparePrice).toFixed(2)}</span>` : ''}
          </div>
        </div>
      </a>`
  }).join('\n')

  const faqSchema = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'How fast is shipping?', acceptedAnswer: { '@type': 'Answer', text: `We dispatch same day from the Gold Coast. ${city.name} orders arrive in ${city.deliveryTime}. Free standard shipping on orders over $150.` } },
      { '@type': 'Question', name: 'Are your products eco friendly?', acceptedAnswer: { '@type': 'Answer', text: 'Yes! All our products are 100% biodegradable, non toxic, and meet Australian safety standards. The powder is food grade cornstarch that washes away with water. Trusted by over 70,000 Australian families.' } },
      { '@type': 'Question', name: city.faq1.q, acceptedAnswer: { '@type': 'Answer', text: city.faq1.a } },
      { '@type': 'Question', name: city.faq2.q, acceptedAnswer: { '@type': 'Answer', text: city.faq2.a } },
    ]
  })

  return `<style>
/* Break out of theme's narrow collection description container */
.collection-hero__description.rte{max-width:100%!important;width:100%!important}
.collection-hero__text-wrapper{max-width:100%!important;width:100%!important;padding-left:0!important;padding-right:0!important}
.section-template--22088318681177__main-padding{padding-top:0!important}
.collection-hero__title{font-size:clamp(1.6rem,4vw,2.4rem)!important;text-transform:uppercase!important;letter-spacing:0.5px!important;text-align:center!important}
.loc-wrap{max-width:1400px;margin:0 auto;padding:0 24px;font-family:inherit}
.loc-wrap *{font-size:inherit}
.loc-hero{text-align:center;padding:8px 24px 28px}
.loc-hero p{font-size:1.38rem!important;color:#555;max-width:800px;margin:0 auto;line-height:1.7}
.loc-trust{display:flex;justify-content:center;gap:32px;flex-wrap:wrap;padding:18px 24px;background:#65c4c0;color:#fff;border-radius:12px;margin:0 0 36px;font-size:1.26rem!important;font-weight:600}
.loc-trust span{display:flex;align-items:center;gap:6px;white-space:nowrap}
@media(max-width:639px){.loc-trust{gap:12px 20px;font-size:1.14rem!important;padding:14px 12px}.loc-trust span{font-size:1.14rem!important}}
.loc-section-title{text-align:center;font-size:clamp(1.4rem,3vw,2rem)!important;margin:0 0 28px;text-transform:uppercase;letter-spacing:0.3px;font-weight:700}
.loc-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin:0 0 48px}
@media(min-width:640px){.loc-grid{gap:20px;grid-template-columns:repeat(3,1fr)}}
@media(min-width:960px){.loc-grid{gap:24px;grid-template-columns:repeat(4,1fr)}}
.loc-card{text-decoration:none;color:inherit;border-radius:12px;overflow:hidden;background:#f9f9f9;transition:transform 0.2s,box-shadow 0.2s;display:block}
.loc-card:hover{transform:translateY(-4px);box-shadow:0 8px 24px rgba(0,0,0,0.1)}
@media(max-width:639px){.loc-card:hover{transform:none}}
.loc-card-img{aspect-ratio:1;overflow:hidden;background:#f0f0f0}
.loc-card-img img{width:100%;height:100%;object-fit:cover;display:block}
.loc-card-info{padding:12px 14px}
.loc-card-info h3{font-size:1.2rem!important;margin:0 0 6px;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
@media(min-width:640px){.loc-card-info h3{font-size:1.2rem!important}}
@media(min-width:960px){.loc-card-info h3{font-size:1.26rem!important}.loc-card-info{padding:14px 16px}}
.loc-price{display:flex;align-items:center;gap:8px}
.loc-price-now{font-weight:700;font-size:1.38rem!important}
.loc-price-was{text-decoration:line-through;color:#999;font-size:1.14rem!important}
.loc-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin:0 0 40px;text-align:center}
@media(max-width:639px){.loc-steps{grid-template-columns:1fr;gap:12px}}
.loc-step{padding:24px 16px;background:#f9f9f9;border-radius:12px}
.loc-step-num{font-size:2rem;font-weight:800;color:#65c4c0;margin:0 0 8px}
.loc-step h3{font-size:1.38rem!important;margin:0 0 8px;font-weight:700}
.loc-step p{font-size:1.2rem!important;color:#666;margin:0;line-height:1.6}
.loc-local{max-width:900px;margin:0 auto 32px;text-align:center;padding:28px 32px;background:#f9f9f9;border-radius:12px}
.loc-local h2{font-size:1.8rem!important;margin:0 0 14px;font-weight:700}
.loc-local p{font-size:1.26rem!important;color:#555;line-height:1.7;margin:0}
.loc-faq{max-width:900px;margin:0 auto 40px;padding:0 4px}
.loc-faq details{border-bottom:1px solid #e0e0e0;padding:16px 0}
.loc-faq summary{font-weight:600;cursor:pointer;font-size:1.32rem!important;list-style:none;display:flex;justify-content:space-between;align-items:center;gap:12px}
.loc-faq summary::-webkit-details-marker{display:none}
.loc-faq summary::after{content:'+';font-size:1.4rem;font-weight:300;transition:transform 0.2s;flex-shrink:0}
.loc-faq details[open] summary::after{transform:rotate(45deg)}
.loc-faq .loc-faq-answer{padding:12px 0 4px;font-size:1.26rem!important;color:#555;line-height:1.7}
@media(max-width:639px){.loc-hero p{font-size:1.32rem!important;line-height:1.7}.loc-local p{font-size:1.3rem!important;line-height:1.7}.loc-local h2{font-size:1.56rem!important}.loc-step p{font-size:1.26rem!important}.loc-step h3{font-size:1.32rem!important}.loc-faq summary{font-size:1.26rem!important}.loc-faq .loc-faq-answer{font-size:1.26rem!important}.loc-cta h2{font-size:1.68rem!important}}
.loc-cta{text-align:center;padding:32px 16px;margin:0 0 24px}
.loc-cta h2{font-size:2.16rem!important;margin:0 0 18px;font-weight:700}
.loc-cta a{display:inline-block;padding:16px 44px;background:#65c4c0;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:1.38rem!important;transition:background 0.2s}
.loc-cta a:hover{background:#54b3af}
@media(max-width:639px){.loc-cta a{padding:14px 32px;width:100%;box-sizing:border-box}}
</style>

<div class="loc-wrap">

  <div class="loc-hero">
    <p>${city.heroLine} Whether you're looking for gender reveal cannons, smoke bombs, powder blasters, confetti poppers, or sports reveal products in ${city.name}, we have Australia's biggest range with free shipping.</p>
  </div>

  <div class="loc-trust">
    <span>&#11088; 70,000+ Happy Families</span>
    <span>&#128666; Free Standard Shipping $150+</span>
    <span>&#128230; Same Day Dispatch</span>
    <span>&#127462;&#127482; 100% Australian Owned</span>
  </div>

  <h2 class="loc-section-title">Most Popular Gender Reveals in ${city.name}</h2>

  <div class="loc-grid">
    ${productCards}
  </div>

  <div class="loc-local" style="background:#f0faf9">
    <h2>Buy Gender Reveal Products in ${city.name}</h2>
    <p>Gender Reveal Ideas is ${city.name === 'Gold Coast' ? 'your local Gold Coast store' : `the most trusted online gender reveal store delivering to ${city.name}`}. We stock eco friendly gender reveal cannons, biodegradable smoke bombs, powder extinguisher blasters, confetti poppers, gender reveal balloons, and unique sports reveal products including AFL balls, cricket balls, basketballs, and soccer balls. Every product ships with express delivery to ${city.name} and comes with our 5 star customer guarantee. Looking for gender reveal ideas in ${city.name}? Browse our curated range above or shop the full catalogue below.</p>
  </div>

  <div class="loc-steps">
    <div class="loc-step">
      <div class="loc-step-num">1</div>
      <h3>Pick Your Reveal</h3>
      <p>Shop Australia's biggest range of gender reveal products. Cannons, smoke bombs, blasters, bundles, and sports reveals.</p>
    </div>
    <div class="loc-step">
      <div class="loc-step-num">2</div>
      <h3>Express Delivery to ${city.name}</h3>
      <p>Same day dispatch from the Gold Coast. ${city.name} orders arrive in ${city.deliveryTime}. Free shipping on orders over $150.</p>
    </div>
    <div class="loc-step">
      <div class="loc-step-num">3</div>
      <h3>Celebrate!</h3>
      <p>100% biodegradable, non toxic, and Australian standard. Safe for kids, pets, and the environment. Trusted by 70,000+ families.</p>
    </div>
  </div>

  <div class="loc-local">
    <h2>Gender Reveal Locations in ${city.name}</h2>
    <p>Planning a gender reveal party in ${city.name}? ${city.weatherTip} Popular gender reveal locations in ${city.name} include ${city.localSpots}. All our gender reveal products meet Australian safety standards, are 100% eco friendly and biodegradable, and leave no trace behind. Celebrate at any ${city.name} park, beach, or backyard with confidence. Trusted by over 70,000 Australian families.</p>
  </div>

  <div class="loc-faq">
    <h2 class="loc-section-title">Frequently Asked Questions</h2>

    <details>
      <summary>How fast is shipping to ${city.name}?</summary>
      <div class="loc-faq-answer">We dispatch same day from the Gold Coast. ${city.name} orders arrive in ${city.deliveryTime}. Free standard shipping on orders over $150.</div>
    </details>

    <details>
      <summary>Are your products eco friendly?</summary>
      <div class="loc-faq-answer">Yes! All our products are 100% biodegradable, non toxic, and meet Australian safety standards. The powder is food grade cornstarch that washes away with water. Trusted by over 70,000 Australian families and backed by 1,000+ five star reviews.</div>
    </details>

    <details>
      <summary>${city.faq1.q}</summary>
      <div class="loc-faq-answer">${city.faq1.a}</div>
    </details>

    <details>
      <summary>${city.faq2.q}</summary>
      <div class="loc-faq-answer">${city.faq2.a}</div>
    </details>
  </div>

  <div class="loc-cta">
    <h2>Ready to Celebrate in ${city.name}?</h2>
    <a href="/collections/all">Shop the Full Range</a>
  </div>

</div>

<script type="application/ld+json">${faqSchema}</script>`
}

// ── Main ──
async function main() {
  const products = await fetchCuratedProducts()
  if (products.length < 8) {
    console.error('ABORT: Only found', products.length, 'curated products. Need at least 8.')
    process.exit(1)
  }

  const citiesToProcess = cityFlag
    ? CITIES.filter(c => c.handle.includes(cityFlag))
    : CITIES

  if (!citiesToProcess.length) {
    console.error(`No city found matching --city=${cityFlag}`)
    console.log('Available:', CITIES.map(c => c.handle).join(', '))
    process.exit(1)
  }

  console.log(`\nProcessing ${citiesToProcess.length} location page(s)... ${DRY_RUN ? '[DRY RUN]' : '[LIVE PUSH]'}\n`)

  for (const city of citiesToProcess) {
    console.log(`── ${city.name} (${city.handle}) ──`)
    const html = buildPageHtml(city, products)

    if (DRY_RUN) {
      const outFile = `/tmp/location-page-${city.handle}.html`
      fs.writeFileSync(outFile, `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${city.name} Preview</title><style>body{margin:0;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif}</style></head><body>${html}</body></html>`)
      console.log(`  Wrote preview → ${outFile} (${(html.length / 1024).toFixed(1)} KB)`)
      continue
    }

    // Live push
    const col = await getCollectionByHandle(city.handle)
    if (!col) {
      console.log(`  [SKIP] Collection not found: ${city.handle}`)
      continue
    }
    const typeSingular = col.type === 'custom_collections' ? 'custom_collection' : 'smart_collection'
    await shopPut(`/${col.type}/${col.id}.json`, { [typeSingular]: { id: col.id, body_html: html } })
    console.log(`  ✅ Pushed (${(html.length / 1024).toFixed(1)} KB)`)

    // Rate limit: 500ms between writes
    await new Promise(r => setTimeout(r, 500))
  }

  console.log('\nDone.')
}

main().catch(e => { console.error('FATAL:', e.message || e); process.exit(1) })
