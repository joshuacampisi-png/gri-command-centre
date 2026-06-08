/**
 * Robust regen with error handling
 */
import 'dotenv/config'
import { writeFileSync } from 'fs'
const FAL_KEY = process.env.FAL_KEY
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const REST = 'https://bdd19a-3.myshopify.com/admin/api/2026-01'
const GQL = 'https://bdd19a-3.myshopify.com/admin/api/2026-01/graphql.json'
async function rest(p,o={}){const r=await fetch(`${REST}${p}`,{...o,headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json',...(o.headers||{})}});return r.json()}
async function gql(q,v){const r=await fetch(GQL,{method:'POST',headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query:q,variables:v})});return r.json()}
const sleep = ms => new Promise(r=>setTimeout(r,ms))

async function genFlux(prompt, attempt) {
  console.log(`\nAttempt ${attempt}: ${prompt.slice(0,80)}...`)
  const submit = await fetch('https://queue.fal.run/fal-ai/flux/dev', {
    method:'POST', headers:{'Authorization':`Key ${FAL_KEY}`,'Content-Type':'application/json'},
    body: JSON.stringify({ prompt, image_size:{width:1600,height:900}, num_inference_steps:28, guidance_scale:3.5, num_images:1, enable_safety_checker:false })
  }).then(r=>r.json())
  if (!submit.request_id) { console.log('  ✗ Submit:', JSON.stringify(submit).slice(0,200)); return null }
  console.log(`  Job: ${submit.request_id}`)

  for (let i = 0; i < 30; i++) {
    await sleep(3000)
    try {
      const sr = await fetch(`https://queue.fal.run/fal-ai/flux/dev/requests/${submit.request_id}/status`, { headers:{Authorization:`Key ${FAL_KEY}`}})
      if (sr.status !== 200) { process.stdout.write('!'); continue }
      const text = await sr.text()
      if (!text) { process.stdout.write('?'); continue }
      let status
      try { status = JSON.parse(text) } catch(e) { process.stdout.write('x'); continue }
      if (status.status === 'COMPLETED') {
        const rr = await fetch(`https://queue.fal.run/fal-ai/flux/dev/requests/${submit.request_id}`, { headers:{Authorization:`Key ${FAL_KEY}`}})
        const result = await rr.json()
        const url = result.images?.[0]?.url
        if (!url) return null
        const buf = Buffer.from(await (await fetch(url)).arrayBuffer())
        console.log(`\n  ✓ ${(buf.length/1024).toFixed(0)} KB`)
        return buf
      }
      process.stdout.write('.')
    } catch(e) { process.stdout.write('e') }
  }
  console.log('\n  ⚠ Timeout')
  return null
}

// Try 2 different prompts, take whichever produces a non-trivial image
const PROMPTS = [
  'Flat lay overhead photograph of gender reveal party supplies on a clean white marble surface. A pink twist-pop party cannon and a blue twist-pop party cannon arranged side by side. Scattered pink and blue paper confetti. Pastel pink balloon and pastel blue balloon. A roll of pink ribbon and blue ribbon. A small open kraft cardboard box. Bright soft natural daylight from above. Pastel pink and blue palette, clean minimal aesthetic, lifestyle product photography, 16:9 aspect ratio, photo-realistic, magazine quality. No text, no logos, no faces, no people.',
  'A cozy modern Australian living room scene at golden hour with party preparations. On a wooden coffee table: pink and blue confetti party cannons standing upright, pastel pink and blue balloons floating above tied with ribbon, an open gift box with pink tissue paper, a small folded greeting card. Warm soft natural light streams through a large window. Welcoming home aesthetic, pastel palette, lifestyle photography, magazine quality, 16:9 widescreen, photo-realistic. No people, no faces, no text, no logos.'
]

let buf
for (let i = 0; i < PROMPTS.length; i++) {
  buf = await genFlux(PROMPTS[i], i+1)
  if (buf && buf.length > 80000) break  // Found a good one
  buf = null
}

if (!buf) { console.log('\n✗ All attempts failed'); process.exit(1) }

writeFileSync('/Users/wogbot/Desktop/google ads /hero-3-cost-data.png', buf)
console.log('\n✓ Saved local')

const filename = `gri-blog-hero-cost-au-2026-v3-${Date.now()}.png`
const staged = await gql(`mutation($input:[StagedUploadInput!]!) { stagedUploadsCreate(input:$input) { stagedTargets { url parameters { name value } resourceUrl } } }`, { input: [{ filename, mimeType:'image/png', httpMethod:'POST', resource:'FILE', fileSize:String(buf.length) }]})
const t = staged.data.stagedUploadsCreate.stagedTargets[0]
const fd = new FormData()
for (const p of t.parameters) fd.append(p.name, p.value)
fd.append('file', new Blob([buf], { type:'image/png' }), filename)
await fetch(t.url, { method:'POST', body:fd })
await sleep(2500)
const create = await gql(`mutation($files:[FileCreateInput!]!) { fileCreate(files:$files) { files { ... on MediaImage { id image { url } fileStatus } } } }`, { files:[{ originalSource:t.resourceUrl, alt:'Gender reveal party supplies', contentType:'IMAGE' }]})
const fid = create.data.fileCreate.files[0].id
let url
for (let i = 0; i < 20; i++) {
  await sleep(2000)
  const q = await gql(`query { node(id:"${fid}") { ... on MediaImage { image { url } fileStatus } } }`)
  if (q.data.node?.image?.url && q.data.node.fileStatus === 'READY') { url = q.data.node.image.url; break }
}
console.log(`✓ Shopify URL: ${url}`)

const blogs = await rest('/blogs.json')
const blog = blogs.blogs.find(b => b.handle === 'news')
const upd = await rest(`/blogs/${blog.id}/articles/566677176409.json`, {
  method:'PUT', body: JSON.stringify({ article:{ id:566677176409, image:{ src:url, alt:'Pink and blue gender reveal party supplies' }}})
})
console.log(upd.errors ? `✗ ${JSON.stringify(upd.errors)}` : `✓ Attached to cost article`)
process.exit(0)
