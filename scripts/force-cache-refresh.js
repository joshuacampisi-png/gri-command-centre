/**
 * Force Shopify to refresh: tiny update to the section file (changes the asset hash)
 * Plus update page (triggers page cache invalidation)
 */
import 'dotenv/config'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const REST = 'https://bdd19a-3.myshopify.com/admin/api/2026-01'
async function rest(p,o={}){const r=await fetch(`${REST}${p}`,{...o,headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json',...(o.headers||{})}});return r.json()}
const sleep = ms => new Promise(r=>setTimeout(r,ms))

const themes = await rest('/themes.json')
const main = themes.themes.find(t => t.role === 'main')

// Update section with a timestamp comment to force new file hash
const SECTION = `<style>
  .founders-page-wrap{max-width:1100px;margin:0 auto;padding:40px 20px;}
</style>
<div class="founders-page-wrap" data-updated="${Date.now()}">
  {{ page.content }}
</div>
{% comment %} v=${Date.now()} {% endcomment %}
{% schema %}
{
  "name": "Founders Page",
  "tag": "section",
  "class": "section-founders",
  "settings": []
}
{% endschema %}
`
console.log('Step 1: Touch sections/founders-page.liquid (force new asset hash)')
const sec = await rest(`/themes/${main.id}/assets.json`, {
  method: 'PUT',
  body: JSON.stringify({ asset: { key: 'sections/founders-page.liquid', value: SECTION }})
})
console.log(sec.errors ? '✗' : `✓ Updated (asset hash: ${sec.asset?.checksum?.slice(0,12)})`)
await sleep(2000)

// Touch the page record to invalidate page cache
console.log('\nStep 2: Touch page record to invalidate page cache')
const all = await rest('/pages.json?limit=250')
const hub = all.pages.find(p => p.handle === 'about-the-founders')
const body = hub.body_html
const upd = await rest(`/pages/${hub.id}.json`, {
  method: 'PUT',
  body: JSON.stringify({ page: { id: hub.id, body_html: body + '<!-- v' + Date.now() + ' -->', template_suffix: 'founders' }})
})
console.log(upd.errors ? '✗' : `✓ Page touched, length: ${upd.page.body_html.length}`)

await sleep(4000)
console.log('\nStep 3: Fresh fetch')
const url = `https://genderrevealideas.com.au/pages/about-the-founders?cb=${Date.now()}`
const r = await fetch(url, { headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' } })
const html = await r.text()
console.log(`  Status: ${r.status}`)
console.log(`  Has "Mallu Campisi":     ${html.includes('Mallu Campisi') ? '✓' : '✗'}`)
console.log(`  Has "founders-page-wrap": ${html.includes('founders-page-wrap') ? '✓' : '✗'}`)
console.log(`  Has "GENDER REVEAL IDEAS FAQ": ${html.includes('GENDER REVEAL IDEAS FAQ') ? '⚠ STILL THERE' : '✓ GONE'}`)
console.log(`  Has packing image: ${html.includes('mallu-campisi-packing') ? '✓' : '✗'}`)
process.exit(0)
