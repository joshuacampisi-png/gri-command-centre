/**
 * Upload Mallu's photo to Shopify Files + rewire Author Hub to use the real image
 */
import 'dotenv/config'
import { readFileSync, existsSync } from 'fs'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const REST = 'https://bdd19a-3.myshopify.com/admin/api/2026-01'
const GQL  = 'https://bdd19a-3.myshopify.com/admin/api/2026-01/graphql.json'
async function rest(p,o={}){const r=await fetch(`${REST}${p}`,{...o,headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json',...(o.headers||{})}});return r.json()}
async function gql(query, variables){
  const r = await fetch(GQL, { method:'POST', headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json'}, body: JSON.stringify({query, variables}) })
  return r.json()
}
const sleep = ms => new Promise(r=>setTimeout(r,ms))

const LOCAL = '/Users/wogbot/Desktop/google ads /founder-mallu.png'
if (!existsSync(LOCAL)) { console.log('✗ Image not at:', LOCAL); process.exit(1) }

const fileBuffer = readFileSync(LOCAL)
console.log(`Image found: ${fileBuffer.length} bytes`)

// 1. stagedUploadsCreate
console.log('\n→ Staged upload...')
const staged = await gql(`mutation($input:[StagedUploadInput!]!) {
  stagedUploadsCreate(input:$input) {
    stagedTargets { url parameters { name value } resourceUrl }
    userErrors { field message }
  }
}`, { input: [{ filename: 'founder-mallu-campisi.png', mimeType: 'image/png', httpMethod: 'POST', resource: 'FILE', fileSize: String(fileBuffer.length) }] })
const t = staged.data?.stagedUploadsCreate?.stagedTargets?.[0]
if (!t) { console.log('✗ staged failed', JSON.stringify(staged)); process.exit(1) }

// 2. POST file to staged URL
console.log('→ Uploading to staged URL...')
const formData = new FormData()
for (const p of t.parameters) formData.append(p.name, p.value)
formData.append('file', new Blob([fileBuffer], { type: 'image/png' }), 'founder-mallu-campisi.png')
const upRes = await fetch(t.url, { method: 'POST', body: formData })
console.log(`  Upload status: ${upRes.status}`)
await sleep(2000)

// 3. fileCreate
console.log('→ Creating file record...')
const create = await gql(`mutation($files:[FileCreateInput!]!) {
  fileCreate(files:$files) {
    files { ... on MediaImage { id image { url } fileStatus } }
    userErrors { field message }
  }
}`, { files: [{ originalSource: t.resourceUrl, alt: 'Mallu Campisi Co-Founder Gender Reveal Ideas Australia', contentType: 'IMAGE' }] })
console.log('  Created:', JSON.stringify(create.data?.fileCreate?.files?.[0] || create.data?.fileCreate?.userErrors))

// 4. Poll for URL
console.log('→ Polling for processed URL...')
let founderUrl = null
for (let i = 0; i < 15; i++) {
  await sleep(2500)
  const q = await gql(`query { files(first:5, query:"alt:Mallu") { nodes { ... on MediaImage { id image { url } fileStatus } } } }`)
  const f = q.data?.files?.nodes?.find(n => n?.image?.url && n?.fileStatus === 'READY')
  if (f) { founderUrl = f.image.url; console.log(`  ✓ Ready: ${founderUrl}`); break }
  process.stdout.write('.')
}
if (!founderUrl) { console.log('\n  ⚠ Still processing — will retry'); process.exit(1) }

console.log(`\n=== UPDATING AUTHOR HUB + LLMs-FULL WITH REAL IMAGE ===\n`)

const TODAY_DISPLAY = 'Tuesday, May 26, 2026'

// Update Author Hub page
const allPages = await rest('/pages.json?limit=250')
const hub = allPages.pages.find(p => p.handle === 'about-the-founders')
if (hub) {
  // Re-fetch full body and swap the placeholder URL
  const cur = await rest(`/pages/${hub.id}.json`)
  let body = cur.page.body_html
  body = body.replace(/https:\/\/genderrevealideas\.com\.au\/cdn\/shop\/files\/founder-placeholder\.png/g, founderUrl)
  // Also patch the schema JSON-LD image references
  body = body.replace(/"image":"https:\/\/genderrevealideas\.com\.au\/cdn\/shop\/files\/founder-placeholder\.png"/g, `"image":"${founderUrl}"`)
  const upd = await rest(`/pages/${hub.id}.json`, { method:'PUT', body: JSON.stringify({ page: { id: hub.id, body_html: body }})})
  console.log(`✓ Author Hub updated with real photo`)
}

console.log(`\n=== FOUNDER IMAGE LIVE ===`)
console.log(`URL: ${founderUrl}`)
console.log(`\nVerify Author Hub: https://genderrevealideas.com.au/pages/about-the-founders`)
process.exit(0)
