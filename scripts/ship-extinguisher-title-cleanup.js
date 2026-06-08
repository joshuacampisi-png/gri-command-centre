/**
 * SHIP: Remove "$X" from SEO title + global.title_tag metafield on the
 * 2 powder-extinguisher bundle products.
 *
 * Product titles already clean. Only seo.title and global.title_tag have the $.
 * Both fields updated with brand/trust signal that replaces the price.
 *
 * Rollback: node scripts/ship-extinguisher-title-cleanup.js --rollback
 */
import 'dotenv/config'
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs'

const SHOP = process.env.SHOPIFY_STORE_DOMAIN || 'bdd19a-3.myshopify.com'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const URL = `https://${SHOP}/admin/api/2026-01/graphql.json`

const SNAPSHOT_DIR = 'data/snapshots/extinguisher-title-cleanup'
mkdirSync(SNAPSHOT_DIR, { recursive: true })
const LOG = `${SNAPSHOT_DIR}/log.json`

const ROLLBACK = process.argv.includes('--rollback')

async function gql(query, variables = {}) {
  const r = await fetch(URL, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  return r.json()
}

const TARGETS = [
  {
    handle: 'gender-reveal-powder-extinguisher',
    currentSeoTitle: 'Gender Reveal Powder Extinguisher Bundle | $150 Pink Blue',
    newSeoTitle:     'Gender Reveal Powder Extinguisher Bundle | Pink Blue | Australia Same Day Dispatch',
  },
  {
    handle: 'gender-reveal-powder-cannons',
    currentSeoTitle: 'Gender Reveal Cannon & Extinguisher Bundle | $135 | Australia',
    newSeoTitle:     'Gender Reveal Cannon & Extinguisher Bundle | Pink Blue | Australia 4.85★ Reviews',
  },
]

console.log(`\n=== ${ROLLBACK?'ROLLBACK':'SHIP'} — Remove $X from Extinguisher Bundle titles ===\n`)

// ROLLBACK PATH
if (ROLLBACK) {
  if (!existsSync(LOG)) { console.error('No log to rollback'); process.exit(1) }
  const log = JSON.parse(readFileSync(LOG,'utf8'))
  for (const t of log.updates||[]) {
    const r = await gql(`mutation prodUpdate($input: ProductInput!) {
      productUpdate(input: $input) { product { id seo { title } } userErrors { field message } }
    }`, { input: { id: t.productId, seo: { title: t.before.seoTitle, description: t.before.seoDescription } } })
    console.log(`  ${r.data?.productUpdate?.userErrors?.length?'⚠':'✓'} restored seo.title on /${t.handle}`)

    if (t.before.titleTagMfId) {
      await gql(`mutation metaSet($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) { userErrors { field message } }
      }`, { metafields: [{ ownerId: t.productId, namespace: 'global', key: 'title_tag', type: 'single_line_text_field', value: t.before.titleTagValue }] })
      console.log(`  ✓ restored global.title_tag on /${t.handle}`)
    }
  }
  process.exit(0)
}

// SHIP PATH
const audit = { shippedAt: new Date().toISOString(), updates: [] }

for (const T of TARGETS) {
  console.log(`\n--- ${T.handle} ---`)

  // Pull current state
  const curR = await gql(`{
    productByHandle(handle:"${T.handle}") {
      id title
      seo { title description }
      titleTag: metafield(namespace:"global", key:"title_tag") { id value }
      descTag: metafield(namespace:"global", key:"description_tag") { id value }
    }
  }`)
  const p = curR.data?.productByHandle
  if (!p) { console.log(`  ✗ product not found`); continue }

  console.log(`  product.title:        ${p.title}`)
  console.log(`  current seo.title:    ${p.seo?.title}`)
  console.log(`  current title_tag MF: ${p.titleTag?.value}`)
  console.log(`  → new seo.title:      ${T.newSeoTitle}`)

  const before = {
    productId: p.id,
    seoTitle: p.seo?.title || '',
    seoDescription: p.seo?.description || '',
    titleTagMfId: p.titleTag?.id,
    titleTagValue: p.titleTag?.value || '',
  }

  // Update SEO title via productUpdate
  const upd = await gql(`mutation prodUpdate($input: ProductInput!) {
    productUpdate(input: $input) { product { id seo { title } } userErrors { field message } }
  }`, { input: { id: p.id, seo: { title: T.newSeoTitle, description: p.seo?.description || '' } } })
  if (upd.data?.productUpdate?.userErrors?.length) {
    console.log(`  ✗ seo update failed: ${JSON.stringify(upd.data.productUpdate.userErrors)}`)
    continue
  }
  console.log(`  ✓ updated seo.title`)

  // Update global.title_tag metafield (Shopify's canonical SEO title source)
  const mfR = await gql(`mutation metaSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) { userErrors { field message } }
  }`, { metafields: [{ ownerId: p.id, namespace: 'global', key: 'title_tag', type: 'single_line_text_field', value: T.newSeoTitle }] })
  if (mfR.data?.metafieldsSet?.userErrors?.length) {
    console.log(`  ⚠ title_tag MF update: ${JSON.stringify(mfR.data.metafieldsSet.userErrors)}`)
  } else {
    console.log(`  ✓ updated global.title_tag metafield`)
  }

  audit.updates.push({ handle: T.handle, productId: p.id, before, after: { seoTitle: T.newSeoTitle, titleTagValue: T.newSeoTitle } })

  await new Promise(r => setTimeout(r, 500))
}

writeFileSync(LOG, JSON.stringify(audit, null, 2))
console.log(`\n✓ Snapshot saved: ${LOG}`)
console.log(`Rollback: node scripts/ship-extinguisher-title-cleanup.js --rollback\n`)

// Verify
console.log('--- VERIFY (re-fetch) ---')
for (const T of TARGETS) {
  const r = await gql(`{ productByHandle(handle:"${T.handle}") {
    seo { title }
    titleTag: metafield(namespace:"global", key:"title_tag") { value }
  }}`)
  const p = r.data?.productByHandle
  const dollarInSeo = /\$\d/.test(p?.seo?.title || '')
  const dollarInMf = /\$\d/.test(p?.titleTag?.value || '')
  console.log(`  /${T.handle}`)
  console.log(`    seo.title:    ${dollarInSeo?'⚠ STILL HAS $':'✓ clean'}  "${p?.seo?.title?.slice(0,90)}"`)
  console.log(`    title_tag MF: ${dollarInMf?'⚠ STILL HAS $':'✓ clean'}  "${p?.titleTag?.value?.slice(0,90)}"`)
}

console.log(`\n=== SHIPPED ${new Date().toISOString()} ===`)
console.log(`Sync timeline:`)
console.log(`  • Google Shopping feed picks up: 1-2 hours`)
console.log(`  • Google Shopping ad title in SERP: 2-24 hours`)
console.log(`  • Organic SERP title refresh: 2-7 days (Google's pace)`)
process.exit(0)
