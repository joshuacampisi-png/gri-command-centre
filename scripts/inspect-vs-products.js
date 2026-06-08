import 'dotenv/config'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const REST = 'https://bdd19a-3.myshopify.com/admin/api/2026-01'
const blogs = await (await fetch(`${REST}/blogs.json`,{headers:{'X-Shopify-Access-Token':TOKEN}})).json()
const blog = blogs.blogs.find(b => b.handle === 'news')
const r = await fetch(`${REST}/blogs/${blog.id}/articles/566587818073.json`,{headers:{'X-Shopify-Access-Token':TOKEN}})
const j = await r.json()
const body = j.article.body_html
const start = body.indexOf('id="products"')
const end = body.indexOf('id="faq"')
console.log(body.slice(start-30, end+30))
process.exit(0)
