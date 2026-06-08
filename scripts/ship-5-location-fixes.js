/**
 * Ship the 5 location SEO fixes:
 *  - Rebuild Wollongong body from Newcastle template + Wollongong localisation
 *  - Add SEO meta title + meta description to all 6 (Newcastle, Wollongong, Canberra, ACT, Melbourne, Sunshine Coast)
 *  - Verify all saves
 */
import 'dotenv/config'
import { readFileSync } from 'fs'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const REST = 'https://bdd19a-3.myshopify.com/admin/api/2026-01'
const GQL  = 'https://bdd19a-3.myshopify.com/admin/api/2026-01/graphql.json'

async function rest(p,o={}){const r=await fetch(`${REST}${p}`,{...o,headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json',...(o.headers||{})}});return r.json()}
async function gql(query, variables){
  const r = await fetch(GQL, { method:'POST', headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json'}, body: JSON.stringify({query, variables}) })
  return r.json()
}

// ---------- 1. Build Wollongong body from Newcastle template ----------
const newcastleTpl = readFileSync('/tmp/newcastle-template.html', 'utf8')

// Replace Newcastle-specific venues / suburbs with Wollongong-appropriate ones
let wollongongBody = newcastleTpl
  // Venues
  .replaceAll('Bar Beach', 'North Wollongong Beach')
  .replaceAll('Merewether Beach', 'Austinmer Beach')
  .replaceAll('Civic Park', 'Stuart Park')
  .replaceAll('Newcastle Hill', 'Mt Keira Lookout')
  .replaceAll('Glenelg Beach', 'Bulli Beach')
  .replaceAll('Bathers Way', 'Blue Mile walk')
  // Suburb/area names that might appear
  .replaceAll('Hamilton', 'Thirroul')
  .replaceAll('The Junction', 'Figtree')
  .replaceAll('Cooks Hill', 'Mangerton')
  // City swap (case-sensitive variants)
  .replaceAll('Newcastle', 'Wollongong')
  .replaceAll('NEWCASTLE', 'WOLLONGONG')
  .replaceAll('newcastle', 'wollongong')

// ---------- 2. Define SEO meta for each collection ----------
const SEO = {
  468151861337: { // Newcastle
    handle: 'gender-reveal-ideas-newcastle',
    seo_title: 'Gender Reveal Ideas Newcastle — #1 Range, Fast NSW Delivery',
    seo_desc:  'Shop Newcastle\'s #1 gender reveal range. Powder cannons, smoke bombs, blasters, bundles. 1,360+ Aussie reviews ★4.85. Same-day dispatch to Newcastle NSW.',
  },
  468151959641: { // Wollongong (also gets body rebuild)
    handle: 'gender-reveal-ideas-wollongong',
    seo_title: 'Gender Reveal Ideas Wollongong — #1 Range, Fast Illawarra Delivery',
    seo_desc:  'Shop Wollongong\'s #1 gender reveal range. Powder cannons, smoke bombs, blasters, bundles. 1,360+ Aussie reviews ★4.85. Same-day dispatch to Wollongong & the Illawarra.',
    body: wollongongBody,
  },
  468151894105: { // Canberra
    handle: 'gender-reveal-ideas-canberra',
    seo_title: 'Gender Reveal Ideas Canberra — #1 Range, Fast ACT Delivery',
    seo_desc:  'Shop Canberra\'s #1 gender reveal range. Powder cannons, smoke bombs, blasters, bundles. 1,360+ Aussie reviews ★4.85. Same-day dispatch to Canberra & ACT.',
  },
  468165656665: { // ACT
    handle: 'gender-reveal-ideas-act',
    seo_title: 'Gender Reveal Ideas ACT — Australia\'s #1 Range Delivered Fast',
    seo_desc:  'Shop ACT\'s #1 gender reveal range. Powder cannons, smoke bombs, blasters, bundles. 1,360+ Aussie reviews ★4.85. Same-day dispatch across the Australian Capital Territory.',
  },
  282307985497: { // Melbourne
    handle: 'gender-reveal-ideas-melbourne',
    seo_title: 'Gender Reveal Ideas Melbourne — #1 Range, Same-Day VIC Dispatch',
    seo_desc:  'Shop Melbourne\'s #1 gender reveal range. Powder cannons, smoke bombs, blasters, bundles. 1,360+ Aussie reviews ★4.85. Same-day dispatch across Melbourne & Victoria.',
  },
  468151926873: { // Sunshine Coast
    handle: 'gender-reveal-ideas-sunshine-coast',
    seo_title: 'Gender Reveal Ideas Sunshine Coast — #1 Range, Fast QLD Delivery',
    seo_desc:  'Shop the Sunshine Coast\'s #1 gender reveal range. Powder cannons, smoke bombs, blasters, bundles. 1,360+ Aussie reviews ★4.85. Same-day dispatch to Noosa, Maroochydore & all SC suburbs.',
  },
}

// ---------- 3. Resolve smart_collection GraphQL IDs (we need GIDs for metafields/SEO) ----------
async function updateCollectionSeoAndBody(id, fields) {
  const gid = `gid://shopify/Collection/${id}`
  // Use GraphQL collectionUpdate to set seo.title, seo.description, and optionally descriptionHtml
  const input = { id: gid }
  if (fields.body) input.descriptionHtml = fields.body
  if (fields.seo_title || fields.seo_desc) input.seo = {}
  if (fields.seo_title) input.seo.title = fields.seo_title
  if (fields.seo_desc)  input.seo.description = fields.seo_desc

  const mutation = `
    mutation($input: CollectionInput!) {
      collectionUpdate(input: $input) {
        collection { id handle title seo { title description } descriptionHtml }
        userErrors { field message }
      }
    }
  `
  const res = await gql(mutation, { input })
  return res
}

// ---------- 4. Execute ----------
console.log('\n═══════════════════════════════════════════════════════════════════')
console.log('  SHIPPING 5 LOCATION SEO FIXES')
console.log('═══════════════════════════════════════════════════════════════════\n')

const results = []
for (const [id, fields] of Object.entries(SEO)) {
  const numId = Number(id)
  console.log(`\n→ ${fields.handle}`)
  console.log(`  SEO title: "${fields.seo_title.slice(0,72)}"`)
  console.log(`  SEO desc:  "${fields.seo_desc.slice(0,100)}..."`)
  if (fields.body) console.log(`  Body rebuild: ${fields.body.length} chars (Newcastle template adapted)`)

  try {
    const r = await updateCollectionSeoAndBody(numId, fields)
    if (r.data?.collectionUpdate?.userErrors?.length) {
      console.log(`  ✗ ERRORS: ${JSON.stringify(r.data.collectionUpdate.userErrors)}`)
      results.push({ handle: fields.handle, ok: false })
    } else if (r.errors) {
      console.log(`  ✗ GQL ERRORS: ${JSON.stringify(r.errors)}`)
      results.push({ handle: fields.handle, ok: false })
    } else {
      const c = r.data?.collectionUpdate?.collection
      console.log(`  ✓ SAVED — SEO title set: ${!!c?.seo?.title} | SEO desc set: ${!!c?.seo?.description} | Body: ${c?.descriptionHtml?.length || 0} chars`)
      results.push({ handle: fields.handle, ok: true, seoTitle: c?.seo?.title, seoDesc: c?.seo?.description })
    }
  } catch(e) {
    console.log(`  ✗ EXCEPTION: ${e.message}`)
    results.push({ handle: fields.handle, ok: false })
  }
}

// ---------- 5. Verify ----------
console.log(`\n\n═══════════════════════════════════════════════════════════════════`)
console.log('  VERIFICATION (re-read from Shopify)')
console.log('═══════════════════════════════════════════════════════════════════\n')
for (const r of results) {
  const idStr = Object.entries(SEO).find(([_,v]) => v.handle === r.handle)?.[0]
  if (!idStr) continue
  let j = (await rest(`/smart_collections/${idStr}.json`)).smart_collection
  if (!j) j = (await rest(`/custom_collections/${idStr}.json`)).custom_collection
  console.log(`${r.handle.padEnd(40)} | body: ${(j?.body_html||'').length} chars | SEO title set: ${!!j?.metafields_global_title_tag} | SEO desc set: ${!!j?.metafields_global_description_tag}`)
}

console.log(`\n=== SUMMARY ===`)
const ok = results.filter(r=>r.ok).length
console.log(`  ✓ Saved successfully: ${ok}/${results.length}`)
console.log(`\nNext step: in 24-48hr, Google will re-crawl. In 7 days re-pull location rank delta to measure lift.`)
process.exit(0)
