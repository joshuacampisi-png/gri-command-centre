/**
 * Try switching to template_suffix: rental-agreement (existing working template)
 * If that doesn't render content, fall back to ?: tba-form or wholesale
 */
import 'dotenv/config'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const REST = 'https://bdd19a-3.myshopify.com/admin/api/2026-01'
async function rest(p,o={}){const r=await fetch(`${REST}${p}`,{...o,headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json',...(o.headers||{})}});return r.json()}
const sleep = ms => new Promise(r=>setTimeout(r,ms))

const all = await rest('/pages.json?limit=250')
const hub = all.pages.find(p => p.handle === 'about-the-founders')

// Try each working template in order
const candidates = ['rental-agreement', 'tba-form', 'review-form', 'order-tracker']

for (const tmpl of candidates) {
  console.log(`\nTrying template_suffix: "${tmpl}"`)
  const upd = await rest(`/pages/${hub.id}.json`, {
    method: 'PUT',
    body: JSON.stringify({ page: { id: hub.id, template_suffix: tmpl }})
  })
  if (upd.errors) { console.log(`  ✗ ${JSON.stringify(upd.errors)}`); continue }
  await sleep(4000)
  const r = await fetch(`https://genderrevealideas.com.au/pages/about-the-founders?cb=${Date.now()}`)
  const html = await r.text()
  const hasMallu = html.includes('Mallu Campisi')
  const hasFAQ = html.includes('GENDER REVEAL IDEAS FAQ')
  console.log(`  Mallu: ${hasMallu ? '✓' : '✗'} | FAQ: ${hasFAQ ? '⚠' : '✓ gone'}`)
  if (hasMallu && !hasFAQ) {
    console.log(`\n🎉 WINNER: template_suffix="${tmpl}" — content renders, no FAQ`)
    break
  }
  await sleep(1500)
}
process.exit(0)
