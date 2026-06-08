/**
 * Clone the EXACT Dawn main-page section but rename it to founders-page
 * Then point our template at it
 */
import 'dotenv/config'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const REST = 'https://bdd19a-3.myshopify.com/admin/api/2026-01'
async function rest(p,o={}){const r=await fetch(`${REST}${p}`,{...o,headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json',...(o.headers||{})}});return r.json()}
const sleep = ms => new Promise(r=>setTimeout(r,ms))

const themes = await rest('/themes.json')
const main = themes.themes.find(t => t.role === 'main')

// Read the EXACT main-page.liquid section content
const orig = await rest(`/themes/${main.id}/assets.json?asset[key]=${encodeURIComponent('sections/main-page.liquid')}`)
const mainPageLiquid = orig.asset.value
console.log('Original main-page.liquid:')
console.log(mainPageLiquid)
console.log('\n---')

// Replace section name to "Founders Page" and remove the H1 title (we have our own)
// Keep the page.content rendering exactly as Dawn does it
let cloned = mainPageLiquid
  .replace(/"name":\s*"t:sections.main-page.name"/, '"name": "Founders Page"')
  .replace(/{{ page.title \| escape }}/, '') // remove duplicate title since our body has one

console.log('\nDeploying cloned section as sections/founders-page.liquid')
const sec = await rest(`/themes/${main.id}/assets.json`, {
  method: 'PUT',
  body: JSON.stringify({ asset: { key: 'sections/founders-page.liquid', value: cloned }})
})
console.log(sec.errors ? '✗' : `✓ Cloned (hash: ${sec.asset?.checksum?.slice(0,12)})`)
await sleep(3000)

// Re-touch page
const all = await rest('/pages.json?limit=250')
const hub = all.pages.find(p => p.handle === 'about-the-founders')
const body = hub.body_html.replace(/<!-- v\d+ -->/g, '')
const upd = await rest(`/pages/${hub.id}.json`, {
  method: 'PUT',
  body: JSON.stringify({ page: { id: hub.id, body_html: body, template_suffix: 'founders' }})
})
console.log(upd.errors ? '✗' : `✓ Page touched (${upd.page.body_html.length} chars)`)

await sleep(5000)
const r = await fetch(`https://genderrevealideas.com.au/pages/about-the-founders?cb=${Date.now()}`)
const html = await r.text()
console.log(`\nStatus: ${r.status}`)
console.log(`  Has "Mallu Campisi":     ${html.includes('Mallu Campisi') ? '✓' : '✗'}`)
console.log(`  Has "main-page-title":   ${html.includes('main-page-title') ? '✓' : '✗'}`)
console.log(`  Has FAQ:                 ${html.includes('GENDER REVEAL IDEAS FAQ') ? '⚠' : '✓ gone'}`)
console.log(`  Has packing image:       ${html.includes('mallu-campisi-packing') ? '✓' : '✗'}`)
process.exit(0)
