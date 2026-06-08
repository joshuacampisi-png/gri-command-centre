/**
 * List all existing GRI location-based collections + check Newcastle/Wollongong/Canberra/Melbourne/Sunshine Coast status
 */
import 'dotenv/config'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const REST = 'https://bdd19a-3.myshopify.com/admin/api/2026-01'
async function rest(p){const r=await fetch(`${REST}${p}`,{headers:{'X-Shopify-Access-Token':TOKEN}});return r.json()}

// Get all custom + smart collections
const custom = await rest('/custom_collections.json?limit=250')
const smart  = await rest('/smart_collections.json?limit=250')
const all = [...(custom.custom_collections||[]), ...(smart.smart_collections||[])]
const locCollections = all.filter(c => /sydney|melbourne|brisbane|perth|adelaide|gold-coast|darwin|newcastle|canberra|hobart|wollongong|sunshine|tasmania|victoria|queensland|nsw|vic|qld|wa|sa|act|nt/i.test(c.handle))
console.log(`\n=== ALL LOCATION COLLECTIONS (${locCollections.length}) ===\n`)
for (const c of locCollections.sort((a,b)=>a.handle.localeCompare(b.handle))) {
  const type = (custom.custom_collections||[]).find(x=>x.id===c.id) ? 'custom' : 'smart'
  console.log(`  [${type}] ${c.handle.padEnd(45)} (id ${c.id}, products: ${c.products_count ?? '?'}) — ${c.title}`)
}

// Specifically check the 5 priority handles
console.log(`\n=== PRIORITY CHECK (the 5 fixes) ===`)
const needles = [
  'gender-reveal-ideas-newcastle',
  'gender-reveal-ideas-wollongong',
  'gender-reveal-ideas-canberra',
  'gender-reveal-ideas-act',
  'gender-reveal-ideas-melbourne',
  'gender-reveal-ideas-sunshine-coast',
  'gender-reveal-cannons-newcastle',
  'gender-reveal-cannons-wollongong',
  'gender-reveal-cannons-melbourne',
  'gender-reveal-cannons-sunshine-coast',
]
for (const h of needles) {
  const c = all.find(x => x.handle === h)
  if (c) console.log(`  ✓ EXISTS: ${h} (id ${c.id})`)
  else console.log(`  ✗ MISSING: ${h}`)
}

// Inspect the Sydney template (we know it's the winner)
console.log(`\n=== SYDNEY COLLECTION (the proven template) ===`)
const sydney = all.find(c => c.handle === 'gender-reveal-ideas-sydney')
if (sydney) {
  const full = await rest(`/custom_collections/${sydney.id}.json`)
  const j = full.custom_collection || (await rest(`/smart_collections/${sydney.id}.json`)).smart_collection
  console.log(`Title: ${j.title}`)
  console.log(`Handle: ${j.handle}`)
  console.log(`Template suffix: ${j.template_suffix || 'default'}`)
  console.log(`Body length: ${(j.body_html||'').length} chars`)
  console.log(`Meta description present: ${!!j.metafields_global_description_tag}`)
  console.log(`Meta title present: ${!!j.metafields_global_title_tag}`)
  console.log(`\nBODY HTML preview (first 1500):`)
  console.log((j.body_html||'').slice(0, 1500))
}
process.exit(0)
