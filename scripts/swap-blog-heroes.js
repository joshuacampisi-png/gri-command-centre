/**
 * Upload 4 new AI-generated lifestyle hero images to Shopify Files
 * Then update each draft blog with its unique hero (featured image + first figure)
 */
import 'dotenv/config'
import { readFileSync, writeFileSync } from 'fs'

const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const GQL = 'https://bdd19a-3.myshopify.com/admin/api/2026-01/graphql.json'
const REST = 'https://bdd19a-3.myshopify.com/admin/api/2026-01'
async function gql(q,v={}){const r=await fetch(GQL,{method:'POST',headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query:q,variables:v})});return r.json()}
async function rest(p,o={}){const r=await fetch(`${REST}${p}`,{...o,headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json',...(o.headers||{})}});return r.json()}

const HEROES = [
  { local:'/Users/wogbot/Downloads/blog-hero-1.png', filename:'lifestyle-couple-golden-hour-bump.png', alt:'Pregnant Australian couple at golden hour in eucalyptus backyard — lifestyle gender reveal photo', blogHandle:'diy-gender-reveal-australia-18-ideas', articleId:566587752537 },
  { local:'/Users/wogbot/Downloads/blog-hero-2.png', filename:'lifestyle-beach-sunset-reveal.png',      alt:'Australian beach gender reveal photoshoot — pink and blue smoke at sunset',                blogHandle:'gender-reveal-photoshoot-australia-guide', articleId:566587785305 },
  { local:'/Users/wogbot/Downloads/blog-hero-3.png', filename:'lifestyle-baby-shower-celebration.png', alt:'Australian backyard baby shower celebration with female friends',                            blogHandle:'gender-reveal-vs-baby-shower-australian-guide', articleId:566587818073 },
  { local:'/Users/wogbot/Downloads/blog-hero-4.png', filename:'lifestyle-couple-sealed-envelope.png',  alt:'Australian couple at home with sealed gender reveal envelope — intimate emotional moment',  blogHandle:'what-is-a-gender-reveal-party-australian-guide', articleId:566587850841 },
]

async function uploadImage(localPath, filename, alt) {
  const buf = readFileSync(localPath)
  const sq = await gql(`mutation($input:[StagedUploadInput!]!){stagedUploadsCreate(input:$input){stagedTargets{url resourceUrl parameters{name value}}}}`, {
    input:[{filename, mimeType:'image/png', httpMethod:'POST', resource:'FILE', fileSize:String(buf.length)}]
  })
  const target = sq.data.stagedUploadsCreate.stagedTargets[0]
  const fd = new FormData()
  for (const p of target.parameters) fd.append(p.name, p.value)
  fd.append('file', new Blob([buf], { type: 'image/png' }), filename)
  await fetch(target.url, { method: 'POST', body: fd })
  const fc = await gql(`mutation($files:[FileCreateInput!]!){fileCreate(files:$files){files{id ... on MediaImage{image{url} fileStatus}}}}`, {
    files:[{originalSource: target.resourceUrl, alt, contentType:'IMAGE'}]
  })
  const fileId = fc.data.fileCreate.files[0].id
  for (let i = 0; i < 12; i++) {
    await new Promise(r=>setTimeout(r, 1500))
    const q = await gql(`query($id:ID!){node(id:$id){... on MediaImage{image{url} fileStatus}}}`, { id: fileId })
    if (q.data?.node?.fileStatus === 'READY') return q.data.node.image.url
  }
  return null
}

console.log(`\n=== UPLOADING 4 LIFESTYLE HEROES + SWAPPING INTO BLOGS ===\n`)

// Upload all 4
console.log('Step 1: Uploading new heroes to Shopify Files...')
for (const h of HEROES) {
  process.stdout.write(`  ${h.filename} ... `)
  h.url = await uploadImage(h.local, h.filename, h.alt)
  console.log(`✓ ${h.url}`)
}

// Find blog id
const blogs = await rest('/blogs.json')
const blog = blogs.blogs?.find(b => b.handle === 'news') || blogs.blogs?.[0]

// Update each article: swap hero image (featured image + the first <figure> in body_html)
console.log(`\nStep 2: Updating each blog with unique hero...`)
for (const h of HEROES) {
  // Pull current article
  const cur = await rest(`/blogs/${blog.id}/articles/${h.articleId}.json`)
  const article = cur.article
  if (!article) { console.log(`  ✗ Could not load article ${h.articleId}`); continue }

  // Replace OLD smoke bomb hero in body HTML with new hero
  // The hero image is the first <figure class="bf"> with img src containing "SocMEd"
  let body = article.body_html
  // Match the first <figure class="bf">...</figure> and replace its img src with new URL
  body = body.replace(
    /<figure class="bf">\s*<img src="[^"]+SocMEd[^"]+"[^>]*\/>/,
    `<figure class="bf"><img src="${h.url}" alt="${h.alt}" loading="lazy"/>`
  )
  // Also update the article's featured image (the image shown in blog index + Open Graph)
  const upd = await rest(`/blogs/${blog.id}/articles/${h.articleId}.json`, {
    method: 'PUT',
    body: JSON.stringify({ article: {
      id: h.articleId,
      body_html: body,
      image: { src: h.url, alt: h.alt },
    }})
  })
  if (upd.errors || upd.article?.id !== h.articleId) {
    console.log(`  ✗ ${h.blogHandle}: ${JSON.stringify(upd.errors||upd)}`)
  } else {
    console.log(`  ✓ ${h.blogHandle} → hero swapped + featured image updated`)
  }
}

console.log(`\n=== DONE — 4 unique lifestyle heroes live across drafts ===\n`)
console.log(`Each blog now has its own unique editorial hero image.`)
console.log(`Refresh /admin → Online Store → Blog Posts to see the new featured images.`)
process.exit(0)
