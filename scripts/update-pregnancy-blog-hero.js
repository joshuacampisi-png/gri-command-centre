/**
 * 1. Download chosen Pexels maternity image (free commercial license)
 * 2. Upload to Shopify Files for stable hosting
 * 3. Update the existing pregnancy blog hero
 */
import 'dotenv/config'
import { writeFileSync, readFileSync, existsSync } from 'fs'
import { Buffer } from 'buffer'

const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const URL = 'https://bdd19a-3.myshopify.com/admin/api/2026-01/graphql.json'
const REST = 'https://bdd19a-3.myshopify.com/admin/api/2026-01'

async function gql(q,v={}){const r=await fetch(URL,{method:'POST',headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query:q,variables:v})});return r.json()}
async function rest(path,opts={}){const r=await fetch(`${REST}${path}`,{...opts,headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json',...(opts.headers||{})}});return r.json()}

// Chosen image: "Outdoor Family Maternity Portrait with Joyful Expecting Mother" — Pexels free commercial license
const PEXELS_URL = 'https://images.pexels.com/photos/33964016/pexels-photo-33964016.jpeg?cs=srgb&dl=pexels-dhemer-33964016.jpg&fm=jpg&w=1600'
const FILENAME = 'pregnancy-announcement-hero-2026.jpg'

console.log('1. Downloading Pexels image...')
const imgRes = await fetch(PEXELS_URL)
if (!imgRes.ok) { console.error('Download failed:', imgRes.status); process.exit(1) }
const buf = Buffer.from(await imgRes.arrayBuffer())
console.log(`   ${buf.length} bytes`)

console.log('\n2. Staged upload to Shopify...')
const staged = await gql(`mutation stagedUploadsCreate($input:[StagedUploadInput!]!){stagedUploadsCreate(input:$input){stagedTargets{url resourceUrl parameters{name value}}userErrors{message}}}`, {
  input:[{ resource:'FILE', filename:FILENAME, mimeType:'image/jpeg', fileSize:String(buf.length), httpMethod:'POST' }]
})
const target = staged.data?.stagedUploadsCreate?.stagedTargets?.[0]
if (!target) { console.error('Stage failed:', JSON.stringify(staged.data?.stagedUploadsCreate?.userErrors)); process.exit(1) }
console.log(`   Stage URL ready`)

console.log('\n3. POSTing image bytes...')
const fd = new FormData()
for (const p of target.parameters) fd.append(p.name, p.value)
fd.append('file', new Blob([buf], { type:'image/jpeg' }), FILENAME)
const upRes = await fetch(target.url, { method:'POST', body: fd })
if (!upRes.ok) { console.error('Upload failed:', upRes.status, await upRes.text()); process.exit(1) }
console.log(`   Uploaded`)

console.log('\n4. fileCreate to register in Files API...')
const created = await gql(`mutation fileCreate($files:[FileCreateInput!]!){fileCreate(files:$files){files{id alt fileStatus ... on MediaImage{image{url}}} userErrors{message}}}`, {
  files:[{ alt:'Pregnant mum maternity announcement photo', contentType:'IMAGE', originalSource: target.resourceUrl }]
})
const fileResult = created.data?.fileCreate?.files?.[0]
console.log('   File created:', JSON.stringify(fileResult, null, 2))

// Poll for the image URL (Shopify processes asynchronously)
console.log('\n5. Polling for CDN URL...')
let cdnUrl = fileResult?.image?.url
const fileId = fileResult?.id
for (let i=0; i<10 && !cdnUrl; i++) {
  await new Promise(r=>setTimeout(r,2000))
  const q = await gql(`{ node(id:"${fileId}") { ... on MediaImage { image{url} fileStatus } } }`)
  cdnUrl = q.data?.node?.image?.url
  console.log(`   poll ${i+1}: status=${q.data?.node?.fileStatus} url=${cdnUrl||'pending'}`)
}
if (!cdnUrl) { console.error('CDN URL not resolved'); process.exit(1) }
console.log(`   ✓ CDN: ${cdnUrl}`)

// Now update the blog article
console.log('\n6. Updating pregnancy announcement blog hero...')
const HANDLE = 'pregnancy-announcement-ideas-australia-2026'
const blogsR = await rest('/blogs.json')
const blog = blogsR.blogs?.[0]
const existing = await rest(`/blogs/${blog.id}/articles.json?handle=${HANDLE}`)
const art = existing.articles?.find(a=>a.handle===HANDLE)
if (!art) { console.error('Article not found'); process.exit(1) }

// Replace the old hero image URL in the body_html
let bodyHtml = art.body_html
const oldHeroPattern = /https:\/\/cdn\.shopify\.com\/s\/files\/1\/0584\/7410\/2873\/files\/MainPhoto_[^"]+|https:\/\/cdn\.shopify\.com\/s\/files\/1\/0584\/7410\/2873\/files\/Pinklauncher[^"]+/g
// Try to find current hero — first <img> in <figure>
const firstImgMatch = bodyHtml.match(/<figure[^>]*>\s*<img\s+src="([^"]+)"/)
console.log(`   Current hero: ${firstImgMatch?.[1]?.slice(0,80)}`)
if (firstImgMatch) {
  bodyHtml = bodyHtml.replace(firstImgMatch[1], cdnUrl)
  console.log(`   Replaced with: ${cdnUrl}`)
}
// Also update alt text in hero
bodyHtml = bodyHtml.replace(/alt="Pregnancy announcement smoke reveal[^"]*"/, 'alt="Pregnant mum maternity announcement photo Australia"')
bodyHtml = bodyHtml.replace(/Photo of a pregnancy announcement reveal moment using coloured smoke/, 'Lifestyle photo of a pregnant mum announcing her pregnancy with family')

// Also update schema image
bodyHtml = bodyHtml.replace(/"image":\s*"[^"]+"/, `"image": "${cdnUrl}"`)

// Update article
const u = await rest(`/blogs/${blog.id}/articles/${art.id}.json`, {
  method:'PUT',
  body: JSON.stringify({ article: {
    id: art.id, body_html: bodyHtml,
    image: { src: cdnUrl, alt: 'Pregnant mum maternity announcement photo Australia' }
  }})
})
console.log(`   ✓ Article updated`)
console.log(`\nBlog URL: https://genderrevealideas.com.au/blogs/news/${HANDLE}`)
console.log(`Hero image now: ${cdnUrl}`)
process.exit(0)
