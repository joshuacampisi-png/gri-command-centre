/**
 * Audit "confetti cannon" SERP for AU + your current product pages
 *  1. Where do you rank for "confetti cannon"?
 *  2. Who's beating you and why?
 *  3. What are your current confetti cannon product/collection pages?
 *  4. What needs to change?
 */
import 'dotenv/config'
import { writeFileSync, mkdirSync } from 'fs'

const DFSE = 'Basic ' + Buffer.from(`${process.env.DATAFORSEO_EMAIL}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64')
const SHOP = process.env.SHOPIFY_STORE_DOMAIN || 'bdd19a-3.myshopify.com'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const URL = `https://${SHOP}/admin/api/2026-01/graphql.json`

async function gql(query, variables = {}) {
  const r = await fetch(URL, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  return r.json()
}

async function scrapeSERP(kw) {
  const r = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/regular', {
    method:'POST', headers:{Authorization:DFSE,'Content-Type':'application/json'},
    body: JSON.stringify([{keyword:kw, location_code:2036, language_code:'en', device:'desktop', depth:30}]),
  }).then(r=>r.json())
  return r.tasks?.[0]?.result?.[0]?.items?.filter(it => it.type==='organic') || []
}

async function fetchHTML(url) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
    return await r.text()
  } catch { return '' }
}

console.log('\n=== "CONFETTI CANNON" SERP AUDIT — AU ===\n')

// 1. SERP for generic "confetti cannon"
console.log('--- 1. SERP for "confetti cannon" (1,900/mo) ---\n')
const items1 = await scrapeSERP('confetti cannon')
console.log('# | Domain | Title')
for (let i = 0; i < Math.min(15, items1.length); i++) {
  const it = items1[i]
  const us = /genderrevealideas\.com\.au/i.test(it.domain||it.url||'')
  console.log(`${String(it.rank_absolute).padStart(2)} ${us?'👈 US':'      '} | ${(it.domain||'').slice(0,30).padEnd(30)} | ${(it.title||'').slice(0,70)}`)
}
const our1 = items1.find(it => /genderrevealideas\.com\.au/i.test(it.domain||it.url||''))
console.log(`\nYour position for "confetti cannon": ${our1 ? '#' + our1.rank_absolute : 'NOT IN TOP 30'}`)

// 2. SERP for "confetti cannon australia"
console.log('\n--- 2. SERP for "confetti cannon australia" ---\n')
const items2 = await scrapeSERP('confetti cannon australia')
for (let i = 0; i < Math.min(10, items2.length); i++) {
  const it = items2[i]
  const us = /genderrevealideas\.com\.au/i.test(it.domain||it.url||'')
  console.log(`${String(it.rank_absolute).padStart(2)} ${us?'👈 US':'      '} | ${(it.domain||'').slice(0,30).padEnd(30)} | ${(it.title||'').slice(0,70)}`)
}
const our2 = items2.find(it => /genderrevealideas\.com\.au/i.test(it.domain||it.url||''))
console.log(`\nYour position for "confetti cannon australia": ${our2 ? '#' + our2.rank_absolute : 'NOT IN TOP 30'}`)

// 3. SERP for "gender reveal confetti cannon"
console.log('\n--- 3. SERP for "gender reveal confetti cannon" (260/mo) ---\n')
const items3 = await scrapeSERP('gender reveal confetti cannon')
for (let i = 0; i < Math.min(10, items3.length); i++) {
  const it = items3[i]
  const us = /genderrevealideas\.com\.au/i.test(it.domain||it.url||'')
  console.log(`${String(it.rank_absolute).padStart(2)} ${us?'👈 US':'      '} | ${(it.domain||'').slice(0,30).padEnd(30)} | ${(it.title||'').slice(0,70)}`)
}
const our3 = items3.find(it => /genderrevealideas\.com\.au/i.test(it.domain||it.url||''))
console.log(`\nYour position for "gender reveal confetti cannon": ${our3 ? '#' + our3.rank_absolute : 'NOT IN TOP 30'}`)

// 4. Audit your current confetti cannon assets
console.log('\n\n--- 4. YOUR CURRENT CONFETTI CANNON ASSETS ---\n')

// Products
const productSearch = await gql(`{
  products(first: 50, query: "confetti cannon") {
    edges { node { id handle title status
      seo { title }
      titleTag: metafield(namespace:"global", key:"title_tag") { value }
      onlineStoreUrl
    }}
  }
}`)
const products = productSearch.data?.products?.edges?.map(e => e.node).filter(p => p.status === 'ACTIVE') || []
console.log(`Products matching "confetti cannon": ${products.length}`)
for (const p of products) {
  console.log(`\n  /${p.handle}`)
  console.log(`    product.title: ${p.title}`)
  console.log(`    seo.title:     ${p.seo?.title || p.titleTag?.value || '(none)'}`)
}

// Collections
const collSearch = await gql(`{
  collections(first: 30, query: "confetti") {
    edges { node { id handle title
      seo { title }
      titleTag: metafield(namespace:"global", key:"title_tag") { value }
    }}
  }
}`)
const collections = collSearch.data?.collections?.edges?.map(e => e.node) || []
console.log(`\n\nCollections matching "confetti": ${collections.length}`)
for (const c of collections) {
  console.log(`  /collections/${c.handle}  — "${c.title}"  | seo:${c.seo?.title?.slice(0,60)||'(none)'}`)
}

// 5. Live page audit for #1 competitor
if (items1[0] && !/genderrevealideas/.test(items1[0].domain||'')) {
  console.log(`\n\n--- 5. #1 COMPETITOR for "confetti cannon" ---`)
  const top1 = items1[0]
  console.log(`Domain: ${top1.domain}`)
  console.log(`URL: ${top1.url}`)
  console.log(`Title: ${top1.title}`)
  const html = await fetchHTML(top1.url)
  if (html) {
    const wc = html.replace(/<[^>]+>/g,' ').split(/\s+/).filter(w => w.length>2).length
    const schemaCount = (html.match(/application\/ld\+json/g)||[]).length
    const h1 = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)||[])[1]?.replace(/<[^>]+>/g,'').trim()
    console.log(`  Words: ${wc}, Schemas: ${schemaCount}, H1: "${h1?.slice(0,80)}"`)
  }
}

mkdirSync('data/snapshots/confetti-cannon-audit', { recursive: true })
writeFileSync('data/snapshots/confetti-cannon-audit/audit.json', JSON.stringify({
  serps: {
    'confetti cannon': items1.slice(0,15),
    'confetti cannon australia': items2.slice(0,15),
    'gender reveal confetti cannon': items3.slice(0,15),
  },
  ourPositions: {
    'confetti cannon': our1?.rank_absolute || null,
    'confetti cannon australia': our2?.rank_absolute || null,
    'gender reveal confetti cannon': our3?.rank_absolute || null,
  },
  ourProducts: products.map(p => ({ handle: p.handle, title: p.title, seoTitle: p.seo?.title || p.titleTag?.value })),
  ourCollections: collections.map(c => ({ handle: c.handle, title: c.title, seoTitle: c.seo?.title || c.titleTag?.value })),
}, null, 2))
console.log(`\nFull audit: data/snapshots/confetti-cannon-audit/audit.json`)
process.exit(0)
