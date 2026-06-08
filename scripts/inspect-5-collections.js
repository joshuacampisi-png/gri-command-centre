/**
 * Inspect the 5 problem collections + the Sydney winner template
 * Find what's missing/thin in each problem page
 */
import 'dotenv/config'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const REST = 'https://bdd19a-3.myshopify.com/admin/api/2026-01'
async function rest(p){const r=await fetch(`${REST}${p}`,{headers:{'X-Shopify-Access-Token':TOKEN}});return r.json()}

const COLLECTIONS = [
  { id: 282307952729, handle: 'gender-reveal-ideas-sydney',          name: '🏆 SYDNEY (WINNER TEMPLATE)' },
  { id: 468151861337, handle: 'gender-reveal-ideas-newcastle',       name: '🔴 NEWCASTLE (not ranking)' },
  { id: 468151959641, handle: 'gender-reveal-ideas-wollongong',      name: '🔴 WOLLONGONG (not ranking)' },
  { id: 468151894105, handle: 'gender-reveal-ideas-canberra',        name: '🟡 CANBERRA (#7)' },
  { id: 468165656665, handle: 'gender-reveal-ideas-act',             name: '🔴 ACT (not ranking)' },
  { id: 282307985497, handle: 'gender-reveal-ideas-melbourne',       name: '🟡 MELBOURNE (#5 via different URL)' },
  { id: 468151926873, handle: 'gender-reveal-ideas-sunshine-coast',  name: '🟡 SUNSHINE COAST (#21)' },
]

for (const c of COLLECTIONS) {
  // Try smart first then custom
  let j = (await rest(`/smart_collections/${c.id}.json`)).smart_collection
  if (!j) j = (await rest(`/custom_collections/${c.id}.json`)).custom_collection
  if (!j) { console.log(`\n${c.name} — NOT FOUND`); continue }
  // Get product count
  const prodRes = await rest(`/collections/${c.id}/products.json?limit=250`)
  const prodCount = (prodRes.products || []).length

  console.log(`\n${'═'.repeat(80)}`)
  console.log(`${c.name}`)
  console.log(`${'═'.repeat(80)}`)
  console.log(`Title:           ${j.title}`)
  console.log(`Handle:          ${j.handle}`)
  console.log(`Published:       ${!!j.published_at}  (${j.published_at || 'NOT PUBLISHED'})`)
  console.log(`Template suffix: ${j.template_suffix || '(default)'}`)
  console.log(`Body length:     ${(j.body_html||'').length} chars`)
  console.log(`Product count:   ${prodCount}`)
  console.log(`SEO title:       ${(j.metafields_global_title_tag||'').slice(0,80) || '(none — uses title)'}`)
  console.log(`SEO desc:        ${(j.metafields_global_description_tag||'').slice(0,140) || '(none)'}`)
  if (j.rules) {
    console.log(`Smart rules:     ${JSON.stringify(j.rules)}`)
    console.log(`Disjunctive:     ${j.disjunctive}`)
  }
}
process.exit(0)
