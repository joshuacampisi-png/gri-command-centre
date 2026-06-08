import 'dotenv/config'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const REST = 'https://bdd19a-3.myshopify.com/admin/api/2026-01'
const blogs = await (await fetch(`${REST}/blogs.json`,{headers:{'X-Shopify-Access-Token':TOKEN}})).json()
const blog = blogs.blogs.find(b => b.handle === 'news')
const r = await fetch(`${REST}/blogs/${blog.id}/articles/566587818073.json`,{headers:{'X-Shopify-Access-Token':TOKEN}})
const j = await r.json()
const body = j.article.body_html
const h2s = body.match(/<h2[^>]*>[^<]+<\/h2>/g) || []
console.log('H2s:')
h2s.forEach(h=>console.log(' •', h))
console.log('\nlast 1200 chars:')
console.log(body.slice(-1200))
process.exit(0)
