/**
 * Remove the duplicated AS SEEN ON branded image from all 4 blog bodies
 * Replace with a clean text-only credibility line that doesn't repeat visually
 */
import 'dotenv/config'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const REST = 'https://bdd19a-3.myshopify.com/admin/api/2026-01'
async function rest(p,o={}){const r=await fetch(`${REST}${p}`,{...o,headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json',...(o.headers||{})}});return r.json()}

const REPLACEMENT = `<div style="margin:24px 0 32px;padding:18px 24px;background:#fff7f9;border:1px solid #ffd6e2;border-radius:12px;text-align:center;font-size:13px;color:#666;letter-spacing:0.5px">
  <strong style="color:#c44569;font-size:11px;letter-spacing:1.5px;display:block;margin-bottom:4px;text-transform:uppercase">Featured in</strong>
  ABC · Sunrise · 9News · Sea FM · The Bulletin
</div>`

const blogs = await rest('/blogs.json')
const blog = blogs.blogs.find(b => b.handle === 'news')
const IDS = [566587752537, 566587785305, 566587818073, 566587850841]

console.log(`\n=== STRIPPING TRUST BANNER IMAGE FROM 4 BLOGS ===\n`)

for (const id of IDS) {
  const cur = await rest(`/blogs/${blog.id}/articles/${id}.json`)
  let body = cur.article.body_html

  const beforeImgCount = (body.match(/<img/g) || []).length

  // Strip the entire <div class="trust-banner">...</div> block (contains the big GRI_Brand_trust composite)
  body = body.replace(/<div class="trust-banner">[\s\S]*?<\/div>/, REPLACEMENT)

  // Also strip any remaining loose references to the trust banner image URL
  body = body.replace(/<img[^>]*GRI_Brand_trust[^>]*\/?>/g, '')

  const afterImgCount = (body.match(/<img/g) || []).length

  const upd = await rest(`/blogs/${blog.id}/articles/${id}.json`, {
    method: 'PUT',
    body: JSON.stringify({ article: { id, body_html: body }})
  })
  if (upd.errors) console.log(`  ✗ ${id}: ${JSON.stringify(upd.errors)}`)
  else console.log(`  ✓ ${id}: ${beforeImgCount} imgs → ${afterImgCount} imgs (trust banner replaced with text credibility)`)
}

console.log(`\n=== VERIFY ===\n`)
for (const id of IDS) {
  const cur = await rest(`/blogs/${blog.id}/articles/${id}.json`)
  const body = cur.article.body_html
  const figs = body.match(/<figure[^>]*>[\s\S]*?<\/figure>/g) || []
  const trustBannerStill = body.includes('GRI_Brand_trust') || body.includes('trust-banner')
  console.log(`${id}: ${figs.length} figures · trust-banner-image still present: ${trustBannerStill ? '❌ YES' : '✓ NO'}`)
  for (const f of figs) {
    const src = (f.match(/src="([^"]+)"/) || [])[1] || ''
    console.log(`  → ${src.split('/').pop().slice(0,55)}`)
  }
}
process.exit(0)
