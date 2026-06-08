import 'dotenv/config'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const REST = 'https://bdd19a-3.myshopify.com/admin/api/2026-01'
async function rest(p){const r=await fetch(`${REST}${p}`,{headers:{'X-Shopify-Access-Token':TOKEN}});return r.json()}

const all = await rest('/pages.json?limit=250')
const ai = all.pages.find(p => p.handle === 'ai-info')
const contact = all.pages.find(p => p.handle === 'contact')
console.log('AI Info page id:', ai?.id, 'title:', ai?.title)
console.log('Body length:', (ai?.body_html||'').length)
console.log('--- AI Info content preview ---')
console.log((ai?.body_html||'').slice(0, 3000))
console.log('\n\n--- Contact page ---')
console.log('Body length:', (contact?.body_html||'').length)
console.log((contact?.body_html||'').slice(0, 1500))
process.exit(0)
