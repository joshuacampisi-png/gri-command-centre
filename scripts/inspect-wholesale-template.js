/**
 * Inspect what the WORKING wholesale template uses, and compare to our founders template
 */
import 'dotenv/config'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const REST = 'https://bdd19a-3.myshopify.com/admin/api/2026-01'
async function rest(p){const r=await fetch(`${REST}${p}`,{headers:{'X-Shopify-Access-Token':TOKEN}});return r.json()}

const themes = await rest('/themes.json')
const main = themes.themes.find(t => t.role === 'main')
console.log(`Theme: ${main.name} (id ${main.id})`)

for (const key of ['templates/page.wholesale.json', 'templates/page.founders.json', 'templates/page.json', 'sections/main-page.liquid']) {
  const r = await rest(`/themes/${main.id}/assets.json?asset[key]=${encodeURIComponent(key)}`)
  console.log(`\n=== ${key} ===`)
  if (!r.asset) { console.log('  NOT FOUND'); continue }
  console.log(`  Length: ${r.asset.value.length} chars`)
  console.log(`  ---`)
  console.log(r.asset.value.slice(0, 1500))
  await new Promise(r=>setTimeout(r,400))
}
process.exit(0)
