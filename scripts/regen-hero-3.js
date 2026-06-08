/**
 * Regenerate hero 3 with a safer prompt (FLUX safety filter rejected previous)
 */
import 'dotenv/config'
import { writeFileSync, readFileSync } from 'fs'
const FAL_KEY = process.env.FAL_KEY
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const REST = 'https://bdd19a-3.myshopify.com/admin/api/2026-01'
const GQL = 'https://bdd19a-3.myshopify.com/admin/api/2026-01/graphql.json'
async function rest(p,o={}){const r=await fetch(`${REST}${p}`,{...o,headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json',...(o.headers||{})}});return r.json()}
async function gql(q,v){const r=await fetch(GQL,{method:'POST',headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query:q,variables:v})});return r.json()}
const sleep = ms => new Promise(r=>setTimeout(r,ms))

// Safer prompt — products-only, no pregnant person
const prompt = `Wide editorial 16:9 photograph for a magazine lifestyle feature. Top-down flat lay product photography on a clean white marble kitchen island. Arranged neatly: a pink powder cannon standing upright on the left, a blue powder cannon standing upright on the right, pastel pink and blue confetti scattered between them, two small balloons (one pink, one blue) in the background, an open kraft cardboard box at the back with pink tissue paper, a small pink and blue ribbon. Pastel pink and blue color palette. Bright natural daylight. Magazine-quality lifestyle product photography, premium, clean composition. Photo-realistic. No text, no logos, no branded packaging.`

console.log('→ Regenerating hero 3 with safe prompt...')
const submit = await fetch('https://queue.fal.run/fal-ai/flux/dev', {
  method:'POST', headers:{'Authorization':`Key ${FAL_KEY}`,'Content-Type':'application/json'},
  body: JSON.stringify({
    prompt,
    image_size: { width: 1600, height: 900 },
    num_inference_steps: 28,
    guidance_scale: 3.5,
    num_images: 1,
    enable_safety_checker: true
  })
}).then(r=>r.json())

if (!submit.request_id) { console.log('✗', JSON.stringify(submit)); process.exit(1) }
console.log(`  Job: ${submit.request_id}`)

let imgUrl
for (let i = 0; i < 30; i++) {
  await sleep(3000)
  const status = await fetch(`https://queue.fal.run/fal-ai/flux/dev/requests/${submit.request_id}/status`, { headers: {Authorization:`Key ${FAL_KEY}`}}).then(r=>r.json())
  if (status.status === 'COMPLETED') {
    const result = await fetch(`https://queue.fal.run/fal-ai/flux/dev/requests/${submit.request_id}`, { headers: {Authorization:`Key ${FAL_KEY}`}}).then(r=>r.json())
    imgUrl = result.images?.[0]?.url
    break
  }
  process.stdout.write('.')
}
if (!imgUrl) { console.log('\n✗ Timeout'); process.exit(1) }
console.log(`\n  ✓ Generated: ${imgUrl}`)

const buf = Buffer.from(await (await fetch(imgUrl)).arrayBuffer())
console.log(`  Size: ${(buf.length/1024).toFixed(0)} KB`)
if (buf.length < 50000) {
  console.log('  ⚠ Safety filter may have triggered again. Retrying with different angle...')
  // Try one more time with even safer prompt
  process.exit(1)
}
writeFileSync('/Users/wogbot/Desktop/google ads /hero-3-cost-data.png', buf)
console.log('  ✓ Saved local')

// Upload to Shopify
const filename = 'gri-blog-hero-gender-reveal-cost-australia-2026-v2.png'
const staged = await gql(`mutation($input:[StagedUploadInput!]!) { stagedUploadsCreate(input:$input) { stagedTargets { url parameters { name value } resourceUrl } } }`, { input: [{ filename, mimeType: 'image/png', httpMethod: 'POST', resource: 'FILE', fileSize: String(buf.length) }]})
const t = staged.data.stagedUploadsCreate.stagedTargets[0]
const fd = new FormData()
for (const p of t.parameters) fd.append(p.name, p.value)
fd.append('file', new Blob([buf], { type: 'image/png' }), filename)
await fetch(t.url, { method:'POST', body:fd })
await sleep(2000)
const create = await gql(`mutation($files:[FileCreateInput!]!) { fileCreate(files:$files) { files { ... on MediaImage { id image { url } fileStatus } } } }`, { files:[{ originalSource: t.resourceUrl, alt:'Flat lay of pink and blue gender reveal party supplies on a marble kitchen island', contentType:'IMAGE' }]})
const fid = create.data.fileCreate.files[0].id

let shopifyUrl
for (let i = 0; i < 15; i++) {
  await sleep(2000)
  const q = await gql(`query { node(id:"${fid}") { ... on MediaImage { image { url } fileStatus } } }`)
  if (q.data.node?.image?.url && q.data.node.fileStatus === 'READY') { shopifyUrl = q.data.node.image.url; break }
}
console.log(`  ✓ Shopify URL: ${shopifyUrl}`)

// Attach to article
const blogs = await rest('/blogs.json')
const blog = blogs.blogs.find(b => b.handle === 'news')
const upd = await rest(`/blogs/${blog.id}/articles/566677176409.json`, {
  method: 'PUT',
  body: JSON.stringify({ article: { id: 566677176409, image: { src: shopifyUrl, alt: 'Pink and blue gender reveal party supplies on marble kitchen island' }}})
})
console.log(upd.errors ? `✗ ${JSON.stringify(upd.errors)}` : `✓ Attached to cost article`)
process.exit(0)
