/**
 * Upload new circular logo + swap the POPUP HEADER image (keep main badge as-is)
 */
import 'dotenv/config'
import { readFileSync, writeFileSync } from 'fs'

const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const GQL = 'https://bdd19a-3.myshopify.com/admin/api/2026-01/graphql.json'
const REST = 'https://bdd19a-3.myshopify.com/admin/api/2026-01'
async function gql(q,v={}){const r=await fetch(GQL,{method:'POST',headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query:q,variables:v})});return r.json()}
async function rest(p,o={}){const r=await fetch(`${REST}${p}`,{...o,headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json',...(o.headers||{})}});return r.json()}

const log = JSON.parse(readFileSync('data/snapshots/google-trust-badge/log.json','utf8'))

// 1. Upload new image
console.log('Uploading new popup logo...')
const buf = readFileSync('/tmp/newgooglelogo_circle.png')
const filename = 'google_2026_best_badge_circle.png'

const sq = await gql(`mutation($input:[StagedUploadInput!]!){stagedUploadsCreate(input:$input){stagedTargets{url resourceUrl parameters{name value}}}}`, {
  input:[{filename, mimeType:'image/png', httpMethod:'POST', resource:'FILE', fileSize:String(buf.length)}]
})
const target = sq.data.stagedUploadsCreate.stagedTargets[0]
const fd = new FormData()
for (const p of target.parameters) fd.append(p.name, p.value)
fd.append('file', new Blob([buf], { type: 'image/png' }), filename)
await fetch(target.url, { method: 'POST', body: fd })
const fc = await gql(`mutation($files:[FileCreateInput!]!){fileCreate(files:$files){files{id ... on MediaImage{image{url} fileStatus}}}}`, {
  files:[{originalSource: target.resourceUrl, alt:'Google 2026 Best gender reveal retailer badge', contentType:'IMAGE'}]
})
const fileId = fc.data.fileCreate.files[0].id
let newUrl = null
for (let i = 0; i < 12; i++) {
  await new Promise(r=>setTimeout(r, 1500))
  const q = await gql(`query($id:ID!){node(id:$id){... on MediaImage{image{url} fileStatus}}}`, { id: fileId })
  if (q.data?.node?.fileStatus === 'READY') { newUrl = q.data.node.image.url; break }
}
console.log(`✓ Uploaded: ${newUrl}`)

// 2. Save to log for future reference
log.popupLogoUrl = newUrl
writeFileSync('data/snapshots/google-trust-badge/log.json', JSON.stringify(log, null, 2))

// 3. Pull current JS, swap popup header image
console.log('Fetching current JS asset...')
const themeId = log.themeId
const assetResp = await rest(`/themes/${themeId}/assets.json?asset[key]=assets/gri-google-trust-badge.js`)
let js = assetResp.asset?.value
if (!js) { console.error('Could not read JS asset'); process.exit(1) }

// Add POPUP_IMG constant + swap the popup header img src
if (!js.includes('var POPUP_IMG =')) {
  js = js.replace(/var BADGE_IMG = .*?;/, m => m + `\n  var POPUP_IMG = ${JSON.stringify(newUrl)};`)
} else {
  js = js.replace(/var POPUP_IMG = .*?;/, `var POPUP_IMG = ${JSON.stringify(newUrl)};`)
}
// Swap only the popup-header img (inside .gri-gtb-popup-header)
js = js.replace(
  /(<div class="gri-gtb-popup-header">'\s*\+\s*'\s*<img src="' \+ )BADGE_IMG( \+ '"[^>]*\/>)/,
  '$1POPUP_IMG$2'
)
// Fallback regex if the above didn't match (different concat style)
js = js.replace(
  /(<div class="gri-gtb-popup-header">'\s*\n?\s*\+\s*'\s*<img src="'\s*\+\s*)BADGE_IMG(\s*\+\s*'"[^>]*\/>)/,
  '$1POPUP_IMG$2'
)

// 4. Push updated JS
console.log('Pushing JS update...')
const r = await rest(`/themes/${themeId}/assets.json`, {
  method: 'PUT',
  body: JSON.stringify({ asset: { key: 'assets/gri-google-trust-badge.js', value: js } })
})
if (r.errors) { console.error(r.errors); process.exit(1) }
console.log('✓ Popup logo updated')
console.log(`Asset: ${r.asset?.public_url || r.asset?.key}`)
process.exit(0)
