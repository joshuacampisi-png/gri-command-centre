import 'dotenv/config'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const REST = 'https://bdd19a-3.myshopify.com/admin/api/2026-01'

async function rest(path, opts = {}) {
  const r = await fetch(`${REST}${path}`, { ...opts, headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json', ...(opts.headers || {}) } })
  return r.json()
}

// Find vertical / hero quality Shopify product images that work as feature images
const FEATURES = [
  {
    blogId: 80885907545,
    articleId: 566492463193,
    city: 'Perth',
    handle: 'best-gender-reveal-ideas-perth-2026',
    imageUrl: 'https://genderrevealideas.com.au/cdn/shop/files/Gender_Reveal_Smoke_Bombs_Pink_and_Blue_Smoke_Bombs.jpg',
    alt: 'Pink and blue gender reveal smoke bombs — best gender reveal ideas Perth 2026',
  },
  {
    blogId: 80885907545,
    articleId: 566492495961,
    city: 'Sydney',
    handle: 'best-gender-reveal-ideas-sydney-2026',
    imageUrl: 'https://genderrevealideas.com.au/cdn/shop/files/Gender_Reveal_Powder_Cannons_Pink_and_Blue_Confetti_Cannon.jpg',
    alt: 'Pink and blue gender reveal powder cannons — best gender reveal ideas Sydney 2026',
  },
]

// First, get a list of valid Shopify product images via product fetch
console.log('\n=== FETCHING REAL SHOPIFY IMAGE URLS FOR FEATURES ===')
const fs = await import('fs')
const products = JSON.parse(fs.readFileSync('data/snapshots/pinterest/products-with-images.json', 'utf8'))
const findImg = (handle) => products.find(p => p.handle === handle)?.heroImage
const smokeImg = findImg('gender-reveal-smoke-bomb-australia')
const cannonsImg = findImg('gender-reveal-powder-cannons')
const balloonImg = findImg('gender-reveal-balloon-box')

console.log('Smoke bomb hero:', smokeImg)
console.log('Cannons hero:', cannonsImg)

FEATURES[0].imageUrl = smokeImg
FEATURES[1].imageUrl = cannonsImg

for (const f of FEATURES) {
  console.log(`\n--- ${f.city} (article ${f.articleId}) ---`)
  console.log(`  Feature image: ${f.imageUrl}`)
  const r = await rest(`/blogs/${f.blogId}/articles/${f.articleId}.json`, {
    method: 'PUT',
    body: JSON.stringify({
      article: {
        id: f.articleId,
        image: { src: f.imageUrl, alt: f.alt },
      }
    })
  })
  if (r.article?.image?.src) {
    console.log(`  ✓ Feature image set: ${r.article.image.src}`)
  } else {
    console.log(`  ✗ Failed:`, JSON.stringify(r).slice(0, 300))
  }
  await new Promise(r => setTimeout(r, 800))
}

console.log('\n========== FEATURE IMAGES SHIPPED ==========')
process.exit(0)
