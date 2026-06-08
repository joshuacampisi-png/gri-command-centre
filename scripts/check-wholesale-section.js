import 'dotenv/config'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const REST = 'https://bdd19a-3.myshopify.com/admin/api/2026-01'
async function rest(p){const r=await fetch(`${REST}${p}`,{headers:{'X-Shopify-Access-Token':TOKEN}});return r.json()}
const themes = await rest('/themes.json')
const main = themes.themes.find(t => t.role === 'main')
const r = await rest(`/themes/${main.id}/assets.json?asset[key]=${encodeURIComponent('sections/wholesale.liquid')}`)
console.log(r.asset?.value?.slice(0, 3000) || 'NOT FOUND')
process.exit(0)
