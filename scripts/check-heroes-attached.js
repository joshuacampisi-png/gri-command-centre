import 'dotenv/config'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const REST = 'https://bdd19a-3.myshopify.com/admin/api/2026-01'
const blogs = await (await fetch(`${REST}/blogs.json`,{headers:{'X-Shopify-Access-Token':TOKEN}})).json()
const blog = blogs.blogs.find(b => b.handle === 'news')
const ids = [566676881497, 566677012569, 566677176409]
for (const id of ids) {
  const a = await (await fetch(`${REST}/blogs/${blog.id}/articles/${id}.json`,{headers:{'X-Shopify-Access-Token':TOKEN}})).json()
  console.log(`\n${a.article.title}`)
  console.log(`  Image: ${a.article.image?.src || 'NONE'}`)
}
process.exit(0)
