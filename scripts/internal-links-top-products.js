/**
 * Inject "Available in your city" + "Read our guides" cross-link block
 * into the descriptionHtml of top 10 spend/CVR products.
 * Idempotent — checks marker before injecting.
 */
import 'dotenv/config'

const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const URL = 'https://bdd19a-3.myshopify.com/admin/api/2026-01/graphql.json'

async function gql(q, v = {}) {
  const r = await fetch(URL, { method: 'POST', headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q, variables: v }) })
  return r.json()
}

const MARKER = 'product-city-link-hub'

const TOP_PRODUCTS = [
  'gender-reveal-smoke-bomb-australia',
  'gender-reveal-smoke-bombs',
  'gender-reveal-powder-cannons',
  'gender-reveal-extinguisher-bundle',
  'gender-reveal-burnout-powder',
  'gender-reveal-exploding-soccer-ball',
  'mini-powder-gender-reveal-blaster',
  'tnt-gender-reveal-australia',
  'mega-gender-reveal-powder-blaster',
  'gender-reveal-powder-cannon',
]

const blockHtml = `
<div class="${MARKER}" style="margin-top:32px;padding:20px;background:#fafafa;border-top:2px solid #ffd6e2;border-radius:8px;">
  <h3 style="margin:0 0 10px;font-size:16px;color:#333;">Fast delivery to every Australian city</h3>
  <p style="margin:0 0 12px;font-size:14px;color:#555;line-height:1.6;">Shop gender reveal products with express delivery to:
  <a href="/collections/gender-reveal-ideas-sydney" style="color:#c33;text-decoration:none;">Sydney</a> ·
  <a href="/collections/gender-reveal-ideas-melbourne" style="color:#c33;text-decoration:none;">Melbourne</a> ·
  <a href="/collections/gender-reveal-ideas-brisbane" style="color:#c33;text-decoration:none;">Brisbane</a> ·
  <a href="/collections/gender-reveal-ideas-perth" style="color:#c33;text-decoration:none;">Perth</a> ·
  <a href="/collections/gender-reveal-ideas-adelaide" style="color:#c33;text-decoration:none;">Adelaide</a> ·
  <a href="/collections/gender-reveal-ideas-gold-coast" style="color:#c33;text-decoration:none;">Gold Coast</a> ·
  <a href="/collections/gender-reveal-ideas-newcastle" style="color:#c33;text-decoration:none;">Newcastle</a> ·
  <a href="/collections/gender-reveal-ideas-canberra" style="color:#c33;text-decoration:none;">Canberra</a> ·
  <a href="/collections/gender-reveal-ideas-darwin" style="color:#c33;text-decoration:none;">Darwin</a> ·
  <a href="/collections/gender-reveal-ideas-hobart" style="color:#c33;text-decoration:none;">Hobart</a> ·
  <a href="/collections/gender-reveal-ideas-sunshine-coast" style="color:#c33;text-decoration:none;">Sunshine Coast</a> ·
  <a href="/collections/gender-reveal-ideas-wollongong" style="color:#c33;text-decoration:none;">Wollongong</a> ·
  <a href="/collections/gender-reveal-ideas-geelong" style="color:#c33;text-decoration:none;">Geelong</a> ·
  <a href="/collections/gender-reveal-ideas-cairns" style="color:#c33;text-decoration:none;">Cairns</a> ·
  <a href="/collections/gender-reveal-ideas-central-coast" style="color:#c33;text-decoration:none;">Central Coast</a> ·
  <a href="/collections/gender-reveal-ideas-launceston" style="color:#c33;text-decoration:none;">Launceston</a></p>
  <p style="margin:8px 0 0;font-size:13px;color:#777;">Plan your reveal with our guides:
  <a href="/blogs/news/best-gender-reveal-ideas-perth-2026" style="color:#c33;text-decoration:none;">Best Gender Reveal Ideas Perth 2026</a> ·
  <a href="/blogs/news/best-gender-reveal-ideas-sydney-2026" style="color:#c33;text-decoration:none;">Best Gender Reveal Ideas Sydney 2026</a></p>
</div>
`

let updated = 0, skipped = 0
for (const handle of TOP_PRODUCTS) {
  const r = await gql(`{ productByHandle(handle: "${handle}") { id descriptionHtml } }`)
  const p = r.data?.productByHandle
  if (!p) { console.log(`  ✗ ${handle}: not found`); continue }
  if (p.descriptionHtml?.includes(MARKER)) { console.log(`  ✓ ${handle}: already has hub, skipping`); skipped++; continue }
  const newHtml = (p.descriptionHtml || '') + blockHtml
  const u = await gql(`mutation productUpdate($input: ProductInput!) {
    productUpdate(input: $input) { userErrors { message } }
  }`, { input: { id: p.id, descriptionHtml: newHtml } })
  const errs = u.data?.productUpdate?.userErrors || []
  if (errs.length) {
    console.log(`  ✗ ${handle}: ${JSON.stringify(errs).slice(0, 150)}`)
  } else {
    console.log(`  ✓ ${handle}: city-link hub added (16 city links + 2 blog links)`)
    updated++
  }
  await new Promise(r => setTimeout(r, 400))
}
console.log(`\nUpdated: ${updated} | Skipped: ${skipped}`)
process.exit(0)
