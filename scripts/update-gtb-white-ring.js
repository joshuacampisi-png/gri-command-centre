/**
 * Upload white-ring logo + point BOTH BADGE_IMG and POPUP_IMG at it
 * Also bumps DISMISS_KEY so previously-dismissed sessions see the badge again
 */
import 'dotenv/config'
import { readFileSync, writeFileSync } from 'fs'

const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const GQL = 'https://bdd19a-3.myshopify.com/admin/api/2026-01/graphql.json'
const REST = 'https://bdd19a-3.myshopify.com/admin/api/2026-01'
async function gql(q,v={}){const r=await fetch(GQL,{method:'POST',headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query:q,variables:v})});return r.json()}
async function rest(p,o={}){const r=await fetch(`${REST}${p}`,{...o,headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json',...(o.headers||{})}});return r.json()}

const log = JSON.parse(readFileSync('data/snapshots/google-trust-badge/log.json','utf8'))

// 1. Upload
console.log('Uploading clean white-ring logo...')
const buf = readFileSync('/tmp/newgooglelogo_white_ring.png')
const filename = 'google_2026_best_white_ring.png'
const sq = await gql(`mutation($input:[StagedUploadInput!]!){stagedUploadsCreate(input:$input){stagedTargets{url resourceUrl parameters{name value}}}}`, {
  input:[{filename, mimeType:'image/png', httpMethod:'POST', resource:'FILE', fileSize:String(buf.length)}]
})
const target = sq.data.stagedUploadsCreate.stagedTargets[0]
const fd = new FormData()
for (const p of target.parameters) fd.append(p.name, p.value)
fd.append('file', new Blob([buf], { type: 'image/png' }), filename)
await fetch(target.url, { method: 'POST', body: fd })
const fc = await gql(`mutation($files:[FileCreateInput!]!){fileCreate(files:$files){files{id ... on MediaImage{image{url} fileStatus}}}}`, {
  files:[{originalSource: target.resourceUrl, alt:'Google 2026 Best gender reveal retailer badge — Australia', contentType:'IMAGE'}]
})
const fileId = fc.data.fileCreate.files[0].id
let newUrl = null
for (let i = 0; i < 12; i++) {
  await new Promise(r=>setTimeout(r, 1500))
  const q = await gql(`query($id:ID!){node(id:$id){... on MediaImage{image{url} fileStatus}}}`, { id: fileId })
  if (q.data?.node?.fileStatus === 'READY') { newUrl = q.data.node.image.url; break }
}
console.log(`✓ Uploaded: ${newUrl}`)
log.popupLogoUrl = newUrl
log.badgeImgUrl  = newUrl
writeFileSync('data/snapshots/google-trust-badge/log.json', JSON.stringify(log, null, 2))

// 2. Pull JS + swap both image vars + bump DISMISS_KEY
const themeId = log.themeId
const cur = await rest(`/themes/${themeId}/assets.json?asset[key]=assets/gri-google-trust-badge.js`)
let js = cur.asset?.value
if (!js) { console.error('JS not found'); process.exit(1) }

js = js.replace(/BADGE_IMG="[^"]+"/, `BADGE_IMG=${JSON.stringify(newUrl)}`)
js = js.replace(/POPUP_IMG="[^"]+"/, `POPUP_IMG=${JSON.stringify(newUrl)}`)
js = js.replace(/var BADGE_IMG = "[^"]+";/, `var BADGE_IMG = ${JSON.stringify(newUrl)};`)
js = js.replace(/var POPUP_IMG = "[^"]+";/, `var POPUP_IMG = ${JSON.stringify(newUrl)};`)

const m = js.match(/DISMISS_KEY="gri_gtb_dismissed_v(\d+)"/) || js.match(/DISMISS_KEY = 'gri_gtb_dismissed_v(\d+)'/)
const cur_v = m ? parseInt(m[1]) : 1
const next_v = cur_v + 1
js = js.replace(/DISMISS_KEY="gri_gtb_dismissed_v\d+"/, `DISMISS_KEY="gri_gtb_dismissed_v${next_v}"`)
js = js.replace(/DISMISS_KEY = 'gri_gtb_dismissed_v\d+';/, `DISMISS_KEY = 'gri_gtb_dismissed_v${next_v}';`)

const r = await rest(`/themes/${themeId}/assets.json`, {
  method: 'PUT',
  body: JSON.stringify({ asset: { key: 'assets/gri-google-trust-badge.js', value: js } })
})
if (r.errors) { console.error(r.errors); process.exit(1) }
console.log(`✓ Badge + popup now use clean white-ring logo`)
console.log(`✓ DISMISS_KEY bumped: v${cur_v} → v${next_v} (anyone who dismissed will see badge again)`)
console.log(`Asset: ${r.asset?.public_url || r.asset?.key}`)
process.exit(0)
