/**
 * Phase 2: Restore productType + SEO title + custom_label_0 + google_product_category
 * on 5 top-revenue bundle SKUs.
 *
 * Surgical: ONE product at a time, verify each before next.
 * Rollback: scripts/phase2-bundle-rollback.js (uses data/snapshots/phase2-bundles-may19-reference.json)
 */
import 'dotenv/config'
import { writeFileSync } from 'fs'

const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN || process.env.SHOPIFY_TOKEN
const URL = 'https://bdd19a-3.myshopify.com/admin/api/2026-01/graphql.json'

async function gql(query, variables = {}) {
  const res = await fetch(URL, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  return res.json()
}

const PRODUCTS = [
  {
    id: '7808613056601',
    title: '4x Bundle Pack Gender Reveal Smoke Bombs',
    productType: 'Gender Reveal > Bundles > Smoke Bombs Pack',
    seoTitle: '4x Pack Gender Reveal Smoke Bombs Bundle Pink Blue Australia',
    customLabel0: 'bundle_premium',
    googleProductCategory: '5709',
  },
  {
    id: '7877241602137',
    title: 'Gender Reveal Cannon & Extinguisher Double Bundle',
    productType: 'Gender Reveal > Bundles > Cannon & Extinguisher',
    seoTitle: 'Gender Reveal Powder Cannon & Extinguisher Bundle Pink Blue Australia',
    customLabel0: 'bundle_premium',
    googleProductCategory: '5709',
  },
  {
    id: '7781664882777',
    title: 'Gender Reveal Powder Extinguisher Bundle',
    productType: 'Gender Reveal > Bundles > Powder Extinguisher',
    seoTitle: 'Gender Reveal Powder Extinguisher Bundle Pink Blue Australia',
    customLabel0: 'bundle_premium',
    googleProductCategory: '2781',
  },
  {
    id: '8122469023833',
    title: 'The Race Day Reveal Bundle',
    productType: 'Gender Reveal > Bundles > Sports',
    seoTitle: 'Gender Reveal Race Day Sports Bundle Pink Blue Australia',
    customLabel0: 'bundle_premium',
    googleProductCategory: '5709',
  },
  {
    id: '7988691927129',
    title: 'TNT Gender Reveal Self Hire',
    productType: 'Gender Reveal > TNT Hire',
    seoTitle: 'TNT Gender Reveal Self Hire Kit Pink Blue Australia',
    customLabel0: 'bundle_premium',
    googleProductCategory: '5709',
  },
]

const PRODUCT_UPDATE = `mutation productUpdate($input: ProductInput!) {
  productUpdate(input: $input) {
    product { id productType seo { title } }
    userErrors { field message }
  }
}`

const METAFIELDS_SET = `mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) {
    metafields { id namespace key value }
    userErrors { field message }
  }
}`

async function processProduct(p) {
  const gid = `gid://shopify/Product/${p.id}`
  const log = { id: p.id, title: p.title, steps: [] }

  // Step 1: Update productType + seo title
  const r1 = await gql(PRODUCT_UPDATE, {
    input: {
      id: gid,
      productType: p.productType,
      seo: { title: p.seoTitle },
    },
  })
  if (r1.data?.productUpdate?.userErrors?.length) {
    log.steps.push({ step: 'productUpdate', status: 'ERROR', errors: r1.data.productUpdate.userErrors })
    return log
  }
  log.steps.push({
    step: 'productUpdate',
    status: 'OK',
    productType: r1.data?.productUpdate?.product?.productType,
    seoTitle: r1.data?.productUpdate?.product?.seo?.title,
  })

  // Step 2: Set custom_label_0 + google_product_category metafields
  const r2 = await gql(METAFIELDS_SET, {
    metafields: [
      {
        ownerId: gid,
        namespace: 'mm-google-shopping',
        key: 'custom_label_0',
        type: 'single_line_text_field',
        value: p.customLabel0,
      },
      {
        ownerId: gid,
        namespace: 'mm-google-shopping',
        key: 'google_product_category',
        type: 'single_line_text_field',
        value: p.googleProductCategory,
      },
    ],
  })
  if (r2.data?.metafieldsSet?.userErrors?.length) {
    log.steps.push({ step: 'metafieldsSet', status: 'ERROR', errors: r2.data.metafieldsSet.userErrors })
  } else {
    log.steps.push({
      step: 'metafieldsSet',
      status: 'OK',
      metafields: r2.data?.metafieldsSet?.metafields?.map(m => ({ key: m.key, value: m.value })),
    })
  }

  // Step 3: Verify
  const v = await gql(`{ product(id:"${gid}"){ productType seo{title}
    mfL0:metafield(namespace:"mm-google-shopping",key:"custom_label_0"){value}
    mfCat:metafield(namespace:"mm-google-shopping",key:"google_product_category"){value}
  }}`)
  log.verified = {
    productType: v.data?.product?.productType,
    seoTitle: v.data?.product?.seo?.title,
    custom_label_0: v.data?.product?.mfL0?.value,
    google_product_category: v.data?.product?.mfCat?.value,
  }
  return log
}

console.log(`\n========== PHASE 2 BUNDLE RESTORE — ${new Date().toISOString().slice(0, 19)} ==========\n`)
console.log(`Targets: ${PRODUCTS.length} bundle SKUs`)

const results = []
for (const p of PRODUCTS) {
  console.log(`\n→ ${p.id} ${p.title}`)
  const log = await processProduct(p)
  results.push(log)
  for (const s of log.steps) {
    console.log(`  [${s.status}] ${s.step}${s.errors ? ' — ' + JSON.stringify(s.errors) : ''}`)
  }
  if (log.verified) {
    console.log(`  Verified: productType='${log.verified.productType}'`)
    console.log(`  Verified: seoTitle='${log.verified.seoTitle}'`)
    console.log(`  Verified: custom_label_0='${log.verified.custom_label_0}'`)
    console.log(`  Verified: google_product_category='${log.verified.google_product_category}'`)
  }
  await new Promise(r => setTimeout(r, 800))
}

const out = {
  ranAt: new Date().toISOString(),
  phase: 'Phase 2 — Bundle Restore (5 SKUs)',
  results,
}
writeFileSync('data/snapshots/phase2-execution-log.json', JSON.stringify(out, null, 2))
console.log('\n✓ Execution log saved: data/snapshots/phase2-execution-log.json')
console.log(`\nDone. ${results.length} products processed.`)
process.exit(0)
