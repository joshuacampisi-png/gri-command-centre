import 'dotenv/config'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN
const REST = 'https://bdd19a-3.myshopify.com/admin/api/2026-01'
async function rest(p,o={}){const r=await fetch(`${REST}${p}`,{...o,headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json',...(o.headers||{})}});return r.json()}

const blogs = await rest('/blogs.json')
const blog = blogs.blogs.find(b => b.handle === 'news')
const articleId = 566587785305 // Photoshoot

const cur = await rest(`/blogs/${blog.id}/articles/${articleId}.json`)
let body = cur.article.body_html

// Find the TNT figure and remove it
const re = /<figure class="bf">[^<]*<img[^>]*tnt_hire[^>]*\/>[\s\S]*?<\/figure>/
if (re.test(body)) {
  body = body.replace(re, '')
  console.log('✓ Found and removed TNT figure')
} else {
  console.log('⚠ TNT figure regex did not match — trying alternate')
  // Look for any figure containing "tnt_hire"
  const idx = body.indexOf('tnt_hire')
  if (idx >= 0) {
    const startTag = body.lastIndexOf('<figure', idx)
    const endTag = body.indexOf('</figure>', idx) + 9
    if (startTag >= 0 && endTag > startTag) {
      body = body.slice(0, startTag) + body.slice(endTag)
      console.log('✓ Removed via slice')
    }
  }
}

const upd = await rest(`/blogs/${blog.id}/articles/${articleId}.json`, {
  method: 'PUT',
  body: JSON.stringify({ article: { id: articleId, body_html: body }})
})
if (upd.errors) console.log('✗', upd.errors)
else console.log('✓ Saved')

// Verify
const v = await rest(`/blogs/${blog.id}/articles/${articleId}.json`)
const figs = v.article.body_html.match(/<figure class="bf">[\s\S]*?<\/figure>/g) || []
console.log(`Photoshoot blog now has ${figs.length} figures:`)
for (const m of figs) {
  const src = (m.match(/src="([^"]+)"/) || [])[1]
  console.log('  →', src.split('/').pop())
}
process.exit(0)
