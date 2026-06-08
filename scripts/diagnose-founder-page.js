import 'dotenv/config'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const REST = 'https://bdd19a-3.myshopify.com/admin/api/2026-01'
async function rest(p,o={}){const r=await fetch(`${REST}${p}`,{...o,headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json',...(o.headers||{})}});return r.json()}

const all = await rest('/pages.json?limit=250')
const hub = all.pages.find(p => p.handle === 'about-the-founders')
console.log(`\n=== /pages/about-the-founders ===`)
console.log(`ID: ${hub.id}`)
console.log(`Template suffix: ${hub.template_suffix || '(null/default)'}`)
console.log(`Body length: ${hub.body_html.length}`)
console.log(`\n=== Body start (first 800 chars) ===`)
console.log(hub.body_html.slice(0, 800))
console.log(`\n=== Body end (last 600 chars) ===`)
console.log(hub.body_html.slice(-600))

// Inspect the template file
const themes = await rest('/themes.json')
const main = themes.themes.find(t => t.role === 'main')
const tmpl = await rest(`/themes/${main.id}/assets.json?asset[key]=templates/page.contact.json`)
console.log(`\n=== templates/page.contact.json ===`)
console.log(tmpl.asset?.value?.slice(0, 2000) || 'not found')
process.exit(0)
