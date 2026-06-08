/**
 * Final pragmatic fix: change page handle to bypass Shopify CDN cache
 * /pages/about-the-founders → /pages/meet-the-founders
 * Add redirect from old handle to new (preserves backlinks)
 */
import 'dotenv/config'
import { readFileSync } from 'fs'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const REST = 'https://bdd19a-3.myshopify.com/admin/api/2026-01'
async function rest(p,o={}){const r=await fetch(`${REST}${p}`,{...o,headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json',...(o.headers||{})}});return r.json()}
const sleep = ms => new Promise(r=>setTimeout(r,ms))

const all = await rest('/pages.json?limit=250')
const hub = all.pages.find(p => p.handle === 'about-the-founders')

// Rename handle (new URL = fresh cache key)
console.log('Step 1: Rename page handle to meet-the-founders (fresh cache key)')
const r1 = await rest(`/pages/${hub.id}.json`, {
  method: 'PUT',
  body: JSON.stringify({ page: { id: hub.id, handle: 'meet-the-founders', template_suffix: 'founders' }})
})
console.log(r1.errors ? '✗' : `✓ Renamed to /pages/${r1.page.handle}`)
await sleep(2000)

// Verify on fresh URL
console.log('\nStep 2: Fetch fresh URL')
const r = await fetch(`https://genderrevealideas.com.au/pages/meet-the-founders`)
const html = await r.text()
console.log(`  Status: ${r.status}`)
console.log(`  Has "Mallu Campisi": ${html.includes('Mallu Campisi') ? '✓' : '✗'}`)
console.log(`  Has "founders-page-wrap": ${html.includes('founders-page-wrap') ? '✓' : '✗'}`)
console.log(`  Has FAQ: ${html.includes('GENDER REVEAL IDEAS FAQ') ? '⚠' : '✓ gone'}`)
console.log(`  Has packing image: ${html.includes('mallu-campisi-packing') ? '✓' : '✗'}`)

// Set up redirect from old to new
console.log('\nStep 3: Redirect /pages/about-the-founders → /pages/meet-the-founders')
const redirect = await rest('/redirects.json', {
  method: 'POST',
  body: JSON.stringify({ redirect: { path: '/pages/about-the-founders', target: '/pages/meet-the-founders' }})
})
console.log(redirect.errors ? `  (may already exist) ${JSON.stringify(redirect.errors)}` : `  ✓ Redirect created`)

console.log('\n📋 Final URL: https://genderrevealideas.com.au/pages/meet-the-founders')
process.exit(0)
