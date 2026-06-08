/**
 * Publish both citation magnet articles + verify all live URLs
 */
import 'dotenv/config'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const REST = 'https://bdd19a-3.myshopify.com/admin/api/2026-01'
async function rest(p,o={}){const r=await fetch(`${REST}${p}`,{...o,headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json',...(o.headers||{})}});return r.json()}
const sleep = ms => new Promise(r=>setTimeout(r,ms))

const blogs = await rest('/blogs.json')
const blog = blogs.blogs.find(b => b.handle === 'news')
const past = new Date(Date.now() - 10*60*1000).toISOString()

const ARTICLES_TO_PUBLISH = [
  { id: 566676881497, handle: 'best-gender-reveal-products-australia-2026', name: 'Best Gender Reveal Products Australia 2026' },
  { id: 566677012569, handle: 'are-gender-reveal-smoke-bombs-legal-australia-2026', name: 'Are Gender Reveal Smoke Bombs Legal Australia 2026' }
]

console.log('=== PUBLISHING 2 CITATION MAGNET ARTICLES ===\n')
for (const a of ARTICLES_TO_PUBLISH) {
  const upd = await rest(`/blogs/${blog.id}/articles/${a.id}.json`, {
    method: 'PUT',
    body: JSON.stringify({ article: { id: a.id, published: true, published_at: past }})
  })
  if (upd.errors) { console.log(`  ✗ ${a.handle}: ${JSON.stringify(upd.errors)}`); continue }
  console.log(`  ✓ ${a.handle}`)
  console.log(`    https://genderrevealideas.com.au/blogs/news/${a.handle}`)
  await sleep(1000)
}

console.log('\n=== HTTP VERIFICATION ===')
for (const a of ARTICLES_TO_PUBLISH) {
  await sleep(800)
  const url = `https://genderrevealideas.com.au/blogs/news/${a.handle}`
  const r = await fetch(url, { method: 'HEAD' })
  console.log(`  ${r.status} ${url}`)
}

// Also verify location pages, llms.txt, and founder page
console.log('\n=== ALL CRITICAL URLs ===')
const urls = [
  'https://genderrevealideas.com.au/llms.txt',
  'https://genderrevealideas.com.au/llms-full.txt',
  'https://genderrevealideas.com.au/pages/meet-the-founders',
  'https://genderrevealideas.com.au/pages/llms',
  'https://genderrevealideas.com.au/pages/llms-full',
  'https://genderrevealideas.com.au/blogs/news/best-gender-reveal-products-australia-2026',
  'https://genderrevealideas.com.au/blogs/news/are-gender-reveal-smoke-bombs-legal-australia-2026',
  'https://genderrevealideas.com.au/blogs/news/diy-gender-reveal-australia-18-ideas',
  'https://genderrevealideas.com.au/blogs/news/gender-reveal-photoshoot-australia-guide',
  'https://genderrevealideas.com.au/blogs/news/gender-reveal-vs-baby-shower-australian-guide',
  'https://genderrevealideas.com.au/blogs/news/what-is-a-gender-reveal-party-australian-guide',
]
for (const u of urls) {
  const r = await fetch(u, { method: 'HEAD' })
  console.log(`  ${r.status} ${u}`)
  await sleep(400)
}
process.exit(0)
