/**
 * Generate 3 blog hero images via FAL.ai FLUX, upload to Shopify, attach as featured images.
 * No Chrome dependency. Full automation.
 */
import 'dotenv/config'
import { writeFileSync, readFileSync, existsSync } from 'fs'

const FAL_KEY = process.env.FAL_KEY || process.env.FAL_API_KEY
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const REST = 'https://bdd19a-3.myshopify.com/admin/api/2026-01'
const GQL = 'https://bdd19a-3.myshopify.com/admin/api/2026-01/graphql.json'
async function rest(p,o={}){const r=await fetch(`${REST}${p}`,{...o,headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json',...(o.headers||{})}});return r.json()}
async function gql(query, variables){const r = await fetch(GQL, { method:'POST', headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json'}, body: JSON.stringify({query, variables}) });return r.json()}
const sleep = ms => new Promise(r=>setTimeout(r,ms))

if (!FAL_KEY) { console.log('✗ FAL_KEY missing'); process.exit(1) }

const IMAGES = [
  {
    file: '/Users/wogbot/Desktop/google ads /hero-1-best-products.png',
    name: 'gri-blog-hero-best-products-australia-2026.png',
    alt: 'Australian couple celebrating with pink and blue powder cannons in a sunlit backyard',
    articleId: 566676881497,
    articleHandle: 'best-gender-reveal-products-australia-2026',
    prompt: 'Wide editorial 16:9 photograph for a magazine cover. A radiant young Australian pregnant woman in a soft blush pink maternity dress and her partner in a pale powder-blue linen shirt stand in their sunlit suburban backyard, both popping powder cannons at the exact moment of release. Vivid pink and blue powder bursts into a swirling cloud above them. Golden hour lighting, warm tones, soft bokeh background of green eucalyptus trees and white timber fence. Premium lifestyle photography, joyful, magazine quality, photo-realistic. No text, no logos, no branded packaging.'
  },
  {
    file: '/Users/wogbot/Desktop/google ads /hero-2-smoke-bomb-legality.png',
    name: 'gri-blog-hero-smoke-bombs-legal-australia-2026.png',
    alt: 'Australian couple with pink and blue gender reveal smoke bombs at golden hour backyard',
    articleId: 566677012569,
    articleHandle: 'are-gender-reveal-smoke-bombs-legal-australia-2026',
    prompt: 'Wide editorial 16:9 photograph for a magazine. A young Australian couple stand in their open grassy backyard at golden hour. The pregnant woman wears a flowing white maternity dress and holds aloft a lit smoke bomb producing a dramatic thick PINK smoke cloud on the left side of the frame. Her partner in a casual white linen shirt holds another lit smoke bomb producing a thick BLUE smoke cloud on the right. Soft golden hour light, gum trees in the background, magical wholesome moment. Family-safe, cinematic, photo-realistic, premium lifestyle photography. No text, no logos, no branded packaging.'
  },
  {
    file: '/Users/wogbot/Desktop/google ads /hero-3-cost-data.png',
    name: 'gri-blog-hero-gender-reveal-cost-australia-2026.png',
    alt: 'Pregnant Australian mum smiling while unboxing pink and blue gender reveal party supplies on a white kitchen island',
    articleId: 566677176409,
    articleHandle: 'how-much-does-gender-reveal-cost-australia-2026',
    prompt: 'Wide editorial 16:9 photograph for a magazine lifestyle feature. A happy pregnant Australian mum in her mid-thirties, wearing a soft cream knit sweater dress, stands smiling at a clean modern white kitchen island. On the island in front of her are neatly arranged gender reveal party supplies: pink and blue powder cannons standing upright, pastel pink and blue balloons, decorative tissue paper, and an open kraft cardboard delivery box. She is mid-laugh holding one cannon up to admire it. Natural daylight streaming in from a large kitchen window, modern bright contemporary Australian home, pastel pink and blue palette, magazine quality, photo-realistic. No text, no logos, no branded packaging.'
  }
]

// ============== STEP 1: Generate 3 images via FAL.ai FLUX ==============
console.log('\n=== STEP 1: GENERATING 3 IMAGES VIA FAL.ai FLUX ===\n')

async function generateImage(prompt, name) {
  console.log(`→ Submitting: ${name}`)

  // Submit job
  const submit = await fetch('https://queue.fal.run/fal-ai/flux/dev', {
    method: 'POST',
    headers: { 'Authorization': `Key ${FAL_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      image_size: { width: 1600, height: 900 },  // 16:9
      num_inference_steps: 28,
      guidance_scale: 3.5,
      num_images: 1,
      enable_safety_checker: true
    })
  }).then(r => r.json())

  if (!submit.request_id) {
    console.log(`  ✗ Submit failed: ${JSON.stringify(submit)}`)
    return null
  }
  console.log(`  ✓ Job submitted: ${submit.request_id}`)

  // Poll for completion
  for (let i = 0; i < 30; i++) {
    await sleep(3000)
    const statusUrl = submit.status_url || `https://queue.fal.run/fal-ai/flux/dev/requests/${submit.request_id}/status`
    const status = await fetch(statusUrl, { headers: { 'Authorization': `Key ${FAL_KEY}` }}).then(r => r.json())
    if (status.status === 'COMPLETED') {
      // Fetch result
      const resUrl = submit.response_url || `https://queue.fal.run/fal-ai/flux/dev/requests/${submit.request_id}`
      const result = await fetch(resUrl, { headers: { 'Authorization': `Key ${FAL_KEY}` }}).then(r => r.json())
      const imgUrl = result.images?.[0]?.url
      if (!imgUrl) { console.log(`  ✗ No image URL in result`); return null }
      console.log(`  ✓ Generated: ${imgUrl.slice(0,80)}`)
      // Download to local
      const imgRes = await fetch(imgUrl)
      const buf = Buffer.from(await imgRes.arrayBuffer())
      return buf
    }
    if (status.status === 'IN_QUEUE' || status.status === 'IN_PROGRESS') {
      process.stdout.write('.')
      continue
    }
    if (status.status === 'FAILED') { console.log(`\n  ✗ Failed: ${JSON.stringify(status)}`); return null }
  }
  console.log(`\n  ⚠ Timeout`)
  return null
}

for (const img of IMAGES) {
  if (existsSync(img.file)) {
    console.log(`  Skipping ${img.name} — already exists`)
    continue
  }
  const buf = await generateImage(img.prompt, img.name)
  if (!buf) { console.log(`  ✗ Failed for ${img.name}`); continue }
  writeFileSync(img.file, buf)
  console.log(`  ✓ Saved: ${img.file} (${(buf.length/1024).toFixed(0)} KB)`)
  await sleep(1000)
}

// ============== STEP 2: Upload to Shopify Files via GraphQL ==============
console.log('\n\n=== STEP 2: UPLOADING TO SHOPIFY FILES ===\n')

async function uploadToShopify(localPath, alt, displayName) {
  const fileBuffer = readFileSync(localPath)
  // Staged upload
  const staged = await gql(`mutation($input:[StagedUploadInput!]!) {
    stagedUploadsCreate(input:$input) {
      stagedTargets { url parameters { name value } resourceUrl }
    }
  }`, { input: [{ filename: displayName, mimeType: 'image/png', httpMethod: 'POST', resource: 'FILE', fileSize: String(fileBuffer.length) }]})
  const t = staged.data?.stagedUploadsCreate?.stagedTargets?.[0]
  if (!t) return null
  const formData = new FormData()
  for (const p of t.parameters) formData.append(p.name, p.value)
  formData.append('file', new Blob([fileBuffer], { type: 'image/png' }), displayName)
  await fetch(t.url, { method: 'POST', body: formData })
  await sleep(2000)
  const create = await gql(`mutation($files:[FileCreateInput!]!) {
    fileCreate(files:$files) { files { ... on MediaImage { id image { url } fileStatus } } }
  }`, { files: [{ originalSource: t.resourceUrl, alt, contentType: 'IMAGE' }]})
  const fileId = create.data?.fileCreate?.files?.[0]?.id
  if (!fileId) return null
  // Poll for URL
  for (let i = 0; i < 15; i++) {
    await sleep(2000)
    const q = await gql(`query { node(id:"${fileId}") { ... on MediaImage { image { url width height } fileStatus } } }`)
    const f = q.data?.node
    if (f?.image?.url && f.fileStatus === 'READY') return f.image.url
  }
  return null
}

for (const img of IMAGES) {
  if (!existsSync(img.file)) { console.log(`  ✗ ${img.name}: local file missing`); continue }
  console.log(`→ Uploading ${img.name}`)
  const url = await uploadToShopify(img.file, img.alt, img.name)
  if (!url) { console.log(`  ✗ Upload failed`); continue }
  img.shopifyUrl = url
  console.log(`  ✓ Live: ${url}`)
}

// ============== STEP 3: Attach as featured image to each article ==============
console.log('\n=== STEP 3: ATTACHING FEATURED IMAGES TO ARTICLES ===\n')

const blogs = await rest('/blogs.json')
const blog = blogs.blogs.find(b => b.handle === 'news')

for (const img of IMAGES) {
  if (!img.shopifyUrl) { console.log(`  ✗ ${img.articleHandle}: no shopify URL`); continue }
  console.log(`→ Attaching to ${img.articleHandle}`)
  const upd = await rest(`/blogs/${blog.id}/articles/${img.articleId}.json`, {
    method: 'PUT',
    body: JSON.stringify({
      article: {
        id: img.articleId,
        image: { src: img.shopifyUrl, alt: img.alt }
      }
    })
  })
  if (upd.errors) console.log(`  ✗ ${JSON.stringify(upd.errors)}`)
  else console.log(`  ✓ Featured image set on /blogs/news/${img.articleHandle}`)
  await sleep(800)
}

// ============== STEP 4: Re-submit to IndexNow ==============
console.log('\n=== STEP 4: RE-SUBMITTING TO INDEXNOW ===\n')
const indexnowR = await fetch('https://api.indexnow.org/IndexNow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({
    host: 'genderrevealideas.com.au',
    key: 'gri2026aisearchdominationkey',
    keyLocation: 'https://genderrevealideas.com.au/gri2026aisearchdominationkey.txt',
    urlList: IMAGES.map(img => `https://genderrevealideas.com.au/blogs/news/${img.articleHandle}`)
  })
})
console.log(`  IndexNow: ${indexnowR.status} ${indexnowR.statusText}`)

console.log('\n=== ✓ DONE ===\n')
for (const img of IMAGES) {
  console.log(`  📄 https://genderrevealideas.com.au/blogs/news/${img.articleHandle}`)
  if (img.shopifyUrl) console.log(`     Hero: ${img.shopifyUrl}`)
}
process.exit(0)
