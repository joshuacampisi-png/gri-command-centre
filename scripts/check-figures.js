import 'dotenv/config'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN
const blogs = await fetch('https://bdd19a-3.myshopify.com/admin/api/2026-01/blogs.json',{headers:{'X-Shopify-Access-Token':TOKEN}}).then(r=>r.json())
const blogId = blogs.blogs.find(b=>b.handle==='news').id
for (const aid of [566587752537,566587785305,566587818073,566587850841]) {
  const r = await fetch(`https://bdd19a-3.myshopify.com/admin/api/2026-01/blogs/${blogId}/articles/${aid}.json`,{headers:{'X-Shopify-Access-Token':TOKEN}})
  const j = await r.json()
  const body = j.article.body_html
  const figs = body.match(/<figure[^>]*>[\s\S]*?<\/figure>/g) || []
  console.log(`\nArticle ${aid} (${j.article.handle}) — ${figs.length} figures:`)
  for (const m of figs) {
    const src = (m.match(/src="([^"]+)"/) || [])[1] || ''
    const cap = (m.match(/<figcaption>([^<]+)/) || [])[1] || ''
    console.log('  →', src.split('/').pop().slice(0,55), '|', cap.slice(0,60))
  }
}
