/**
 * Rename to a completely fresh handle that Shopify has never cached
 * /pages/meet-the-founders → /pages/our-story-mallu-josh-campisi
 */
import 'dotenv/config'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const REST = 'https://bdd19a-3.myshopify.com/admin/api/2026-01'
async function rest(p,o={}){const r=await fetch(`${REST}${p}`,{...o,headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json',...(o.headers||{})}});return r.json()}
const sleep = ms => new Promise(r=>setTimeout(r,ms))

const all = await rest('/pages.json?limit=250')
const hub = all.pages.find(p => p.handle === 'meet-the-founders')

const NEW_HANDLE = 'our-story'
console.log(`Renaming /pages/${hub.handle} → /pages/${NEW_HANDLE}`)
const upd = await rest(`/pages/${hub.id}.json`, {
  method: 'PUT',
  body: JSON.stringify({ page: { id: hub.id, handle: NEW_HANDLE, template_suffix: 'founders' }})
})
if (upd.errors) { console.log('✗', JSON.stringify(upd.errors)); process.exit(1) }
console.log(`✓ Now at /pages/${upd.page.handle}`)
await sleep(3000)

const url = `https://genderrevealideas.com.au/pages/${NEW_HANDLE}`
const r = await fetch(url)
const html = await r.text()
console.log(`\nVerification of ${url}:`)
console.log(`  Status: ${r.status}`)
console.log(`  Mallu Campisi: ${html.includes('Mallu Campisi') ? '✓' : '✗'}`)
console.log(`  Packing photo: ${html.includes('mallu-campisi-packing') ? '✓' : '✗'}`)
console.log(`  FAQ gone: ${html.includes('GENDER REVEAL IDEAS FAQ') ? '⚠ FAQ STILL THERE' : '✓ no FAQ'}`)

// Add redirect from old handles
await sleep(1000)
for (const oldPath of ['/pages/about-the-founders', '/pages/meet-the-founders']) {
  try {
    const red = await rest('/redirects.json', {
      method: 'POST',
      body: JSON.stringify({ redirect: { path: oldPath, target: `/pages/${NEW_HANDLE}` }})
    })
    console.log(`  Redirect ${oldPath} → /pages/${NEW_HANDLE}: ${red.errors ? 'exists' : 'created'}`)
  } catch(e) {}
  await sleep(500)
}
console.log(`\n📋 New URL: https://genderrevealideas.com.au/pages/${NEW_HANDLE}`)
process.exit(0)
