import 'dotenv/config'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const REST = 'https://bdd19a-3.myshopify.com/admin/api/2026-01'
async function rest(p){const r=await fetch(`${REST}${p}`,{headers:{'X-Shopify-Access-Token':TOKEN}});return r.json()}

const themes = await rest('/themes.json')
const main = themes.themes.find(t => t.role === 'main')

// Check each candidate template for `main-page` section type (which renders content)
const candidates = ['page.json','page.rental-agreement.json','page.wholesale.json','page.tba-form.json','page.review-form.json','page.gri-locations.json']
for (const c of candidates) {
  const r = await rest(`/themes/${main.id}/assets.json?asset[key]=templates/${c}`)
  if (!r.asset) { console.log(`${c}: NOT FOUND`); continue }
  const value = r.asset.value || ''
  const hasMainPage = /main-page|page-main|"type":\s*"page"|page.content/i.test(value)
  console.log(`\n=== ${c} (${value.length} chars, hasMainPage:${hasMainPage}) ===`)
  // Show section types
  const matches = [...value.matchAll(/"type":\s*"([^"]+)"/g)].map(m=>m[1]).filter((v,i,a)=>a.indexOf(v)===i)
  console.log('  Section types:', matches.join(', '))
  await new Promise(r=>setTimeout(r,400))
}
process.exit(0)
