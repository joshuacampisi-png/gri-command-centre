/**
 * Check current Shopify pages + redirects + about/team pages
 */
import 'dotenv/config'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const REST = 'https://bdd19a-3.myshopify.com/admin/api/2026-01'
async function rest(p){const r=await fetch(`${REST}${p}`,{headers:{'X-Shopify-Access-Token':TOKEN}});return r.json()}

const pages = await rest('/pages.json?limit=250')
console.log(`\n=== ${pages.pages?.length || 0} PAGES ===`)
for (const p of (pages.pages||[])) {
  console.log(`  /pages/${p.handle.padEnd(35)} | ${p.title} | ${p.published_at ? '✓' : 'draft'}`)
}

const redirects = await rest('/redirects.json?limit=250')
console.log(`\n=== ${redirects.redirects?.length || 0} REDIRECTS ===`)
for (const r of (redirects.redirects||[]).slice(0,30)) {
  console.log(`  ${r.path}  →  ${r.target}`)
}

const shop = await rest('/shop.json')
console.log(`\n=== SHOP INFO ===`)
const s = shop.shop
console.log(`Name:        ${s?.name}`)
console.log(`Domain:      ${s?.primary_domain?.host || s?.domain}`)
console.log(`Email:       ${s?.email}`)
console.log(`Created:     ${s?.created_at}`)
console.log(`Country:     ${s?.country_name}`)
console.log(`Currency:    ${s?.currency}`)
console.log(`Plan:        ${s?.plan_name}`)
process.exit(0)
