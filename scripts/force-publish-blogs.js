import 'dotenv/config'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const REST = 'https://bdd19a-3.myshopify.com/admin/api/2026-01'
async function rest(p,o={}){const r=await fetch(`${REST}${p}`,{...o,headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json',...(o.headers||{})}});return r.json()}

const blogs = await rest('/blogs.json')
const blog = blogs.blogs.find(b => b.handle === 'news')
const IDS = [566587752537, 566587785305, 566587818073, 566587850841]

// Set published_at to 10 minutes ago (guaranteed in the past) so Shopify publishes immediately
const past = new Date(Date.now() - 10*60*1000).toISOString()

for (const id of IDS) {
  const upd = await rest(`/blogs/${blog.id}/articles/${id}.json`, {
    method: 'PUT',
    body: JSON.stringify({ article: { id, published: true, published_at: past }})
  })
  if (upd.errors) {
    console.log(`✗ ${id}: ${JSON.stringify(upd.errors)}`)
  } else {
    const a = upd.article
    console.log(`✓ id ${id}`)
    console.log(`  handle: ${a.handle}`)
    console.log(`  published_at: ${a.published_at}`)
    console.log(`  url: https://genderrevealideas.com.au/blogs/news/${a.handle}`)
    console.log('')
  }
}

// Verify by hitting the public URL
console.log('Verifying live status (HTTP HEAD)...')
for (const id of IDS) {
  const cur = await rest(`/blogs/${blog.id}/articles/${id}.json`)
  const url = `https://genderrevealideas.com.au/blogs/news/${cur.article.handle}`
  const r = await fetch(url, { method: 'HEAD' })
  console.log(`  ${r.status} ${url}`)
}
process.exit(0)
