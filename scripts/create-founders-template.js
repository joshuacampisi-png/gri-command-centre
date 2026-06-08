/**
 * Create a clean page.founders.json template that ONLY renders page content
 * (no FAQ, no contact form, no email signup — just the body_html)
 */
import 'dotenv/config'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const REST = 'https://bdd19a-3.myshopify.com/admin/api/2026-01'
async function rest(p,o={}){const r=await fetch(`${REST}${p}`,{...o,headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json',...(o.headers||{})}});return r.json()}

const themes = await rest('/themes.json')
const main = themes.themes.find(t => t.role === 'main')

// Clean template: ONLY main-page section (renders page.content via Dawn theme)
const TEMPLATE = {
  "sections": {
    "main": {
      "type": "main-page",
      "settings": {}
    }
  },
  "order": ["main"]
}

console.log(`Creating templates/page.founders.json in theme ${main.id}...`)
const upload = await rest(`/themes/${main.id}/assets.json`, {
  method: 'PUT',
  body: JSON.stringify({
    asset: {
      key: 'templates/page.founders.json',
      value: JSON.stringify(TEMPLATE, null, 2)
    }
  })
})
if (upload.errors) {
  console.log('✗', JSON.stringify(upload.errors))
  process.exit(1)
}
console.log(`✓ Template created`)

// Apply the template to /pages/about-the-founders
const allPages = await rest('/pages.json?limit=250')
const hub = allPages.pages.find(p => p.handle === 'about-the-founders')
console.log(`\nApplying template_suffix "founders" to /pages/about-the-founders...`)
const upd = await rest(`/pages/${hub.id}.json`, {
  method: 'PUT',
  body: JSON.stringify({ page: { id: hub.id, template_suffix: 'founders' }})
})
if (upd.errors) console.log('✗', JSON.stringify(upd.errors))
else console.log(`✓ template_suffix: ${upd.page.template_suffix}`)

console.log('\nVerify: https://genderrevealideas.com.au/pages/about-the-founders')
process.exit(0)
