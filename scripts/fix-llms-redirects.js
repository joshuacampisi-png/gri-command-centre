/**
 * Fix the /llms.txt redirect to point to /pages/llms (not the old ai-info)
 * And retry /llms-full.txt
 */
import 'dotenv/config'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const REST = 'https://bdd19a-3.myshopify.com/admin/api/2026-01'
async function rest(p,o={}){const r=await fetch(`${REST}${p}`,{...o,headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json',...(o.headers||{})}});return r.json()}

const sleep = ms => new Promise(r=>setTimeout(r,ms))

// Find existing /llms.txt redirect
const all = await rest('/redirects.json?limit=250')
const existing = (all.redirects||[]).find(r => r.path === '/llms.txt')
if (existing) {
  console.log(`Found existing /llms.txt → ${existing.target} (id ${existing.id})`)
  if (existing.target !== '/pages/llms') {
    console.log(`Updating target to /pages/llms...`)
    const upd = await rest(`/redirects/${existing.id}.json`, {
      method: 'PUT',
      body: JSON.stringify({ redirect: { id: existing.id, path: '/llms.txt', target: '/pages/llms' }})
    })
    if (upd.errors) console.log(`✗ ${JSON.stringify(upd.errors)}`)
    else console.log(`✓ Updated /llms.txt → /pages/llms`)
  } else {
    console.log(`✓ Already correctly pointing to /pages/llms`)
  }
}
await sleep(700)

// Find/create /llms-full.txt redirect
const existingFull = (all.redirects||[]).find(r => r.path === '/llms-full.txt')
if (existingFull) {
  console.log(`Found existing /llms-full.txt → ${existingFull.target}`)
  if (existingFull.target !== '/pages/llms-full') {
    const upd = await rest(`/redirects/${existingFull.id}.json`, {
      method: 'PUT',
      body: JSON.stringify({ redirect: { id: existingFull.id, path: '/llms-full.txt', target: '/pages/llms-full' }})
    })
    console.log(upd.errors ? `✗ ${JSON.stringify(upd.errors)}` : `✓ Updated /llms-full.txt → /pages/llms-full`)
  }
} else {
  const create = await rest('/redirects.json', {
    method: 'POST',
    body: JSON.stringify({ redirect: { path: '/llms-full.txt', target: '/pages/llms-full' }})
  })
  console.log(create.errors ? `✗ ${JSON.stringify(create.errors)}` : `✓ Created /llms-full.txt → /pages/llms-full`)
}
await sleep(700)

// Verify both live
console.log('\n=== HTTP VERIFICATION ===')
for (const url of ['https://genderrevealideas.com.au/llms.txt', 'https://genderrevealideas.com.au/llms-full.txt', 'https://genderrevealideas.com.au/pages/llms', 'https://genderrevealideas.com.au/pages/llms-full']) {
  const r = await fetch(url, { redirect: 'manual' })
  const loc = r.headers.get('location')
  console.log(`${r.status} ${url}${loc ? ' → ' + loc : ''}`)
  await sleep(500)
}
process.exit(0)
