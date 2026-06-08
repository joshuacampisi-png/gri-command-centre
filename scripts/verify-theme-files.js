import 'dotenv/config'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const REST = 'https://bdd19a-3.myshopify.com/admin/api/2026-01'
async function rest(p){const r=await fetch(`${REST}${p}`,{headers:{'X-Shopify-Access-Token':TOKEN}});return r.json()}
const themes = await rest('/themes.json')
const main = themes.themes.find(t => t.role === 'main')

for (const key of ['templates/page.founders.json','sections/founders-page.liquid']) {
  const r = await rest(`/themes/${main.id}/assets.json?asset[key]=${encodeURIComponent(key)}`)
  console.log(`\n=== ${key} ===`)
  if (!r.asset) { console.log('  NOT FOUND'); continue }
  console.log(r.asset.value)
}

// Also verify page record
const all = await rest('/pages.json?limit=250')
const hub = all.pages.find(p => p.handle === 'about-the-founders')
console.log(`\n=== Page record ===`)
console.log(`template_suffix: ${hub.template_suffix}`)
console.log(`body_html length: ${hub.body_html.length}`)
console.log(`Has "Mallu Campisi" in body: ${hub.body_html.includes('Mallu Campisi')}`)
console.log(`Has packing img in body: ${hub.body_html.includes('mallu-campisi-packing-warehouse')}`)
process.exit(0)
