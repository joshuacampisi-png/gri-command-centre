/**
 * Fix product card layout in pregnancy announcement blog.
 * - Square product images (object-fit:contain so they don't crop)
 * - Buy box matches image height on desktop
 * - Properly stacked on mobile
 * - Bigger images on desktop, cleaner padding, better visual hierarchy
 */
import 'dotenv/config'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const REST = 'https://bdd19a-3.myshopify.com/admin/api/2026-01'
async function rest(p,o={}){const r=await fetch(`${REST}${p}`,{...o,headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json',...(o.headers||{})}});return r.json()}

const HANDLE = 'pregnancy-announcement-ideas-australia-2026'
const blogsR = await rest('/blogs.json')
const blog = blogsR.blogs?.[0]
const ex = await rest(`/blogs/${blog.id}/articles.json?handle=${HANDLE}`)
const art = ex.articles?.find(a=>a.handle===HANDLE)
if (!art) { console.error('Not found'); process.exit(1) }

let html = art.body_html
const before = html.length
console.log(`Current HTML: ${before}c`)

// Add NEW product-card CSS to the <style> block + replace existing card HTML
// The current cards use inline flex styles. Replace them with .pa-card class structure.

// 1. Inject new CSS for .pa-card right before the closing </style>
const newCss = `
.pa-card{display:grid;grid-template-columns:1fr;gap:0;margin:32px 0;border:1px solid #f0e0e8;border-radius:14px;overflow:hidden;background:#fff;box-shadow:0 2px 12px rgba(0,0,0,0.04)}
@media(min-width:640px){.pa-card{grid-template-columns:240px 1fr}}
@media(min-width:960px){.pa-card{grid-template-columns:280px 1fr}}
.pa-card-img{aspect-ratio:1;background:#fafafa;display:flex;align-items:center;justify-content:center;padding:16px}
.pa-card-img img{max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;display:block}
.pa-card-body{padding:24px 28px;display:flex;flex-direction:column;justify-content:center;gap:10px}
.pa-card-body h4{margin:0;font-size:20px;line-height:1.35;font-weight:700}
@media(min-width:640px){.pa-card-body h4{font-size:22px}}
.pa-card-body h4 a{color:#222;text-decoration:none}
.pa-card-body h4 a:hover{color:#c44569}
.pa-card-meta{margin:0;color:#666;font-size:15px;line-height:1.55}
.pa-card-meta strong{color:#222}
.pa-card-cta{display:inline-block;align-self:flex-start;margin-top:8px;padding:10px 24px;background:#c44569;color:#fff !important;text-decoration:none !important;border-radius:8px;font-weight:700;font-size:15px;transition:background .2s,transform .2s}
.pa-card-cta:hover{background:#a83555;transform:translateY(-1px)}
`
html = html.replace('</style>', newCss + '</style>')

// 2. Replace each old inline-flex product card with the new .pa-card structure.
// The old pattern: a <div> with `border:1px solid #f0e0e8;border-radius:12px;background:#fff7f9;display:flex;...`
// Match and extract: image src, product url, product title, price.
const oldCardRegex = /<div style="margin:24px 0;padding:20px;border:1px solid #f0e0e8[\s\S]*?<a href="([^"]+)"[\s\S]*?<img src="([^"]+)" alt="([^"]*)"[\s\S]*?<h4[^>]*>[\s\S]*?<a href="[^"]+"[^>]*>([^<]+)<\/a>[\s\S]*?From <strong>\$([0-9.]+)<\/strong>[\s\S]*?<\/div>\s*<\/div>/g

let count = 0
html = html.replace(oldCardRegex, (m, url, img, alt, title, price) => {
  count++
  return `<div class="pa-card">
  <a href="${url}" class="pa-card-img"><img src="${img}" alt="${alt}" loading="lazy" /></a>
  <div class="pa-card-body">
    <h4><a href="${url}">${title}</a></h4>
    <p class="pa-card-meta">From <strong>$${price}</strong> &middot; Free shipping over $150 &middot; Same-day dispatch from the Gold Coast</p>
    <a href="${url}" class="pa-card-cta">Shop now &rarr;</a>
  </div>
</div>`
})

console.log(`Replaced ${count} product cards`)
console.log(`New HTML: ${html.length}c (${html.length-before>0?'+':''}${html.length-before})`)

if (count === 0) {
  console.log('\n⚠ Regex did not match. Dumping a 1500-char sample around the first "F1 inline product card"...')
  const idx = html.indexOf('margin:24px 0;padding:20px;border:1px solid #f0e0e8')
  if (idx>=0) console.log(html.slice(idx, idx+1500))
  process.exit(1)
}

// 3. Update article
const u = await rest(`/blogs/${blog.id}/articles/${art.id}.json`, {
  method:'PUT',
  body: JSON.stringify({ article: { id: art.id, body_html: html } })
})
console.log(`✓ Article updated (id ${u.article?.id})`)
console.log(`URL: https://genderrevealideas.com.au/blogs/news/${HANDLE}`)
process.exit(0)
