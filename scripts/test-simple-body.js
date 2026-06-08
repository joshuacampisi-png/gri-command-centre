/**
 * Test with the simplest possible body to see if Liquid renders page.content
 * This will isolate whether the issue is the template or the body content
 */
import 'dotenv/config'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const REST = 'https://bdd19a-3.myshopify.com/admin/api/2026-01'
async function rest(p,o={}){const r=await fetch(`${REST}${p}`,{...o,headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json',...(o.headers||{})}});return r.json()}
const sleep = ms => new Promise(r=>setTimeout(r,ms))

const all = await rest('/pages.json?limit=250')
const hub = all.pages.find(p => p.handle === 'about-the-founders')

// Save original body
const orig = hub.body_html
console.log(`Original body: ${orig.length} chars`)

// Test 1: super simple body with template_suffix: founders
console.log('\nTest 1: SIMPLE body + template_suffix=founders')
const r1 = await rest(`/pages/${hub.id}.json`, {
  method: 'PUT',
  body: JSON.stringify({ page: { id: hub.id, body_html: '<h1 id="test-marker">MALLU CAMPISI TEST</h1><p>If you can see this, page.content is rendering.</p>', template_suffix: 'founders' }})
})
console.log(`  ${r1.errors ? '✗' : '✓ Updated'}`)
await sleep(5000)
const f1 = await fetch(`https://genderrevealideas.com.au/pages/about-the-founders?cb=${Date.now()}`)
const h1 = await f1.text()
console.log(`  Live: has "test-marker": ${h1.includes('test-marker') ? '✓' : '✗'}, has "MALLU CAMPISI TEST": ${h1.includes('MALLU CAMPISI TEST') ? '✓' : '✗'}`)

// Test 2: same body but template_suffix=null (default)
console.log('\nTest 2: SIMPLE body + template_suffix=null')
const r2 = await rest(`/pages/${hub.id}.json`, {
  method: 'PUT',
  body: JSON.stringify({ page: { id: hub.id, body_html: '<h1 id="test-marker">MALLU CAMPISI TEST</h1><p>If you can see this, page.content is rendering.</p>', template_suffix: '' }})
})
console.log(`  ${r2.errors ? '✗' : '✓ Updated'}`)
await sleep(5000)
const f2 = await fetch(`https://genderrevealideas.com.au/pages/about-the-founders?cb=${Date.now()}`)
const h2 = await f2.text()
console.log(`  Live: has "test-marker": ${h2.includes('test-marker') ? '✓' : '✗'}, has "MALLU CAMPISI TEST": ${h2.includes('MALLU CAMPISI TEST') ? '✓' : '✗'}`)

// Restore original body (whichever template suffix gives best result)
console.log('\nRestoring original body...')
const winner = h1.includes('MALLU CAMPISI TEST') ? 'founders' : (h2.includes('MALLU CAMPISI TEST') ? '' : null)
console.log(`Winner template: "${winner || 'NONE'}"`)
await rest(`/pages/${hub.id}.json`, {
  method: 'PUT',
  body: JSON.stringify({ page: { id: hub.id, body_html: orig, template_suffix: winner || 'founders' }})
})
console.log('✓ Restored')
process.exit(0)
