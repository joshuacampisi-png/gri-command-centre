import 'dotenv/config'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const REST = 'https://bdd19a-3.myshopify.com/admin/api/2026-01'
const r = await fetch(`${REST}/pages/133973213273.json`, { headers:{'X-Shopify-Access-Token':TOKEN} })
const j = await r.json()
console.log('template_suffix:', j.page.template_suffix)
console.log('body_html length:', j.page.body_html.length)
console.log('body has "Mallu Campisi":', j.page.body_html.includes('Mallu Campisi'))
console.log('body has "founders-page":', j.page.body_html.includes('founders-page'))
console.log('body has "Co-Founder":', j.page.body_html.includes('Co-Founder'))
console.log('\nFirst 300 chars of body:')
console.log(j.page.body_html.slice(0, 300))
process.exit(0)
