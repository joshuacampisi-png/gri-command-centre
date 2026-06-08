import 'dotenv/config'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const REST = 'https://bdd19a-3.myshopify.com/admin/api/2026-01'
async function rest(p,o={}){const r=await fetch(`${REST}${p}`,{headers:{'X-Shopify-Access-Token':TOKEN}});return r.json()}
const blogs = await rest('/blogs.json')
const blog = blogs.blogs.find(b => b.handle === 'news')
const cur = await rest(`/blogs/${blog.id}/articles/566587818073.json`)
const text = cur.article.body_html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ')
// search for product-relevant terms
const terms = ['cannon','blaster','smoke','TNT','burn','topper','Mega','Bio','reveal','party','shower','DIY','photo']
for (const t of terms) {
  const re = new RegExp(`[^.!?]*\\b${t}\\b[^.!?]*[.!?]`,'gi')
  const matches = text.match(re) || []
  console.log(`\n[${t}] ${matches.length} sentences`)
  matches.slice(0,3).forEach(s => console.log(`  • ${s.trim().slice(0,140)}`))
}
process.exit(0)
