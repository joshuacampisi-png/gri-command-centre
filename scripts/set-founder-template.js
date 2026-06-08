/**
 * The default page.json template is hardcoded to render FAQ content.
 * Switch to template_suffix: contact (clean content template used by /pages/shipping)
 */
import 'dotenv/config'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const REST = 'https://bdd19a-3.myshopify.com/admin/api/2026-01'
async function rest(p,o={}){const r=await fetch(`${REST}${p}`,{...o,headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json',...(o.headers||{})}});return r.json()}

const all = await rest('/pages.json?limit=250')
const hub = all.pages.find(p => p.handle === 'about-the-founders')

console.log(`Updating /pages/about-the-founders template_suffix → "contact"`)
const upd = await rest(`/pages/${hub.id}.json`, {
  method: 'PUT',
  body: JSON.stringify({ page: { id: hub.id, template_suffix: 'contact' }})
})
if (upd.errors) console.log('✗', JSON.stringify(upd.errors))
else console.log(`✓ Template suffix set to: ${upd.page.template_suffix}`)

console.log('\nVerify: https://genderrevealideas.com.au/pages/about-the-founders')
process.exit(0)
