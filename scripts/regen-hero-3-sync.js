import 'dotenv/config'
import { writeFileSync } from 'fs'
const FAL_KEY = process.env.FAL_KEY
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const REST = 'https://bdd19a-3.myshopify.com/admin/api/2026-01'
const GQL = 'https://bdd19a-3.myshopify.com/admin/api/2026-01/graphql.json'
async function rest(p,o={}){const r=await fetch(`${REST}${p}`,{...o,headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json',...(o.headers||{})}});return r.json()}
async function gql(q,v){const r=await fetch(GQL,{method:'POST',headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query:q,variables:v})});return r.json()}
const sleep = ms => new Promise(r=>setTimeout(r,ms))

const prompt = 'Editorial 16:9 wide flat lay overhead photograph of gender reveal party supplies arranged neatly on a clean white marble surface. Pink twist-pop confetti cannon and blue twist-pop confetti cannon side by side standing upright. Pastel pink and blue paper confetti scattered around. One pastel pink balloon and one pastel blue balloon. A coil of pink ribbon. Soft bright natural daylight. Pastel pink and blue palette, minimal, premium lifestyle product photography, magazine quality, photo-realistic. No people, no faces, no text, no logos.'

console.log('Generating via SYNC endpoint...')
const r = await fetch('https://fal.run/fal-ai/flux/dev', {
  method:'POST',
  headers:{'Authorization':`Key ${FAL_KEY}`,'Content-Type':'application/json'},
  body: JSON.stringify({ prompt, image_size:{width:1600,height:900}, num_inference_steps:28, guidance_scale:3.5, num_images:1 })
})
const result = await r.json()
console.log('Status:', r.status, 'Keys:', Object.keys(result).join(','))
const imgUrl = result.images?.[0]?.url
if (!imgUrl) { console.log('✗ No image:', JSON.stringify(result).slice(0,300)); process.exit(1) }
console.log('✓ Image URL:', imgUrl)

const buf = Buffer.from(await (await fetch(imgUrl)).arrayBuffer())
console.log('Buffer size:', (buf.length/1024).toFixed(0), 'KB')
if (buf.length < 80000) { console.log('⚠ Likely safety-filtered. Saving anyway.') }
writeFileSync('/Users/wogbot/Desktop/google ads /hero-3-cost-data.png', buf)
console.log('✓ Saved')

const filename = `gri-blog-hero-cost-au-2026-${Date.now()}.png`
const staged = await gql(`mutation($input:[StagedUploadInput!]!) { stagedUploadsCreate(input:$input) { stagedTargets { url parameters { name value } resourceUrl } } }`, { input: [{ filename, mimeType:'image/png', httpMethod:'POST', resource:'FILE', fileSize:String(buf.length) }]})
const t = staged.data.stagedUploadsCreate.stagedTargets[0]
const fd = new FormData()
for (const p of t.parameters) fd.append(p.name, p.value)
fd.append('file', new Blob([buf], { type:'image/png' }), filename)
await fetch(t.url, { method:'POST', body:fd })
await sleep(2500)
const create = await gql(`mutation($files:[FileCreateInput!]!) { fileCreate(files:$files) { files { ... on MediaImage { id image { url } fileStatus } } } }`, { files:[{ originalSource:t.resourceUrl, alt:'Gender reveal party supplies flat lay', contentType:'IMAGE' }]})
const fid = create.data.fileCreate.files[0].id
let url
for (let i = 0; i < 20; i++) {
  await sleep(2000)
  const q = await gql(`query { node(id:"${fid}") { ... on MediaImage { image { url } fileStatus } } }`)
  if (q.data.node?.image?.url && q.data.node.fileStatus === 'READY') { url = q.data.node.image.url; break }
}
console.log('✓ Shopify URL:', url)
const blogs = await rest('/blogs.json')
const blog = blogs.blogs.find(b => b.handle === 'news')
const upd = await rest(`/blogs/${blog.id}/articles/566677176409.json`, { method:'PUT', body: JSON.stringify({ article:{ id:566677176409, image:{ src:url, alt:'Pink and blue gender reveal party supplies' }}})})
console.log(upd.errors ? `✗ ${JSON.stringify(upd.errors)}` : `✓ ATTACHED to cost article`)
process.exit(0)
