/**
 * PATH C — HYBRID REVERT
 *
 * Decision: Roll back productType + SEO title on all 43 tagged bundles
 * (5 hero bundles from May 4 + 38 expansion bundles from May 5).
 * KEEP custom_label_0 = bundle_premium and google_product_category intact
 * (these don't affect Google's query matching but enable May 12 cannibalisation kill).
 *
 * Rationale:
 * - Pre-surgery state (Mar 30-Apr 12) had EMPTY productType + EMPTY SEO title on bundles
 *   and produced 3.11x ROAS, $104 AOV, 4-6 carousel slots.
 * - Apr 14 surgery added productType + keyword-stuffed SEO titles → ROAS crashed to 0.73x.
 * - Phase 2 (May 4) and expansion (May 5) added structured productType + SEO titles back
 *   on bundles — same DIRECTION as Apr 14 with cleaner SEO copy, but theoretical not empirical.
 * - Empirical evidence (3.11x at empty productType) wins over industry consensus theory.
 * - custom_label_0 is invisible to Google's query-matching per Google MC docs + Mike Ryan
 *   smarter-ecommerce — it's a PMAX bid segmentation primitive only.
 * - Path C = pre-surgery query-matching state + future-ready cannibalisation lever.
 *
 * Sources informing decision:
 * - Google Merchant Center docs (custom_label is for filter, not ranking)
 * - smarter-ecommerce (Mike Ryan): custom_label = PMAX segmentation, doesn't affect query mix
 * - Optmyzr 2026 PMAX guide: stop touching feed mid-learning, but forward-additive labels are safe
 * - Solutions 8: revert direction-changing fields if results not recovering
 *
 * Snapshot before: data/snapshots/path-c-pre-revert-2026-05-05.json
 * Execution log:   data/snapshots/path-c-execution-2026-05-05.json
 * Rollback (re-add): can be reconstructed from phase2-execution-log.json + phase2-expand-execution-log.json
 *
 * Run: node scripts/path-c-hybrid-revert.js
 */
import 'dotenv/config'
import { writeFileSync } from 'fs'

const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN || process.env.SHOPIFY_TOKEN
const URL = 'https://bdd19a-3.myshopify.com/admin/api/2026-01/graphql.json'

async function gql(q, v = {}) {
  const r = await fetch(URL, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q, variables: v }),
  })
  return r.json()
}

// ALL 43 bundles touched by Phase 2 + expansion
const ALL_BUNDLES = [
  // Phase 2 (May 4) — 5 hero bundles
  '7808613056601','7877241602137','7781664882777','8122469023833','7988691927129',
  // Phase 2 expansion (May 5) — 38 bundles
  '7487467880537','7513391530073','7513392283737','7526235144281','7538953420889',
  '7668213088345','7697474584665','7767077519449','7809558380633','7812050452569',
  '7812052123737','7812052516953','7823504244825','7899285848153','7899676442713',
  '7899680374873','7919388655705','7923370491993','7926990504025','7927054434393',
  '7927056367705','7980864766041','7989373206617','7989373468761','7989373665369',
  '8004093673561','8045356941401','8121593200729','8121617678425','8121655066713',
  '8121690128473','8122484981849','8122490454105','8122500808793','8124506341465',
  '8129167622233','8129169260633','8129170014297',
]

console.log(`\n========== PATH C HYBRID REVERT — ${new Date().toISOString().slice(0, 19)} ==========\n`)
console.log('Goal: revert productType + seoTitle to EMPTY on all 43 bundles')
console.log('Keep: custom_label_0 = bundle_premium AND google_product_category as-is')
console.log(`Targets: ${ALL_BUNDLES.length} bundles\n`)

// 1. SNAPSHOT current state
console.log('--- SNAPSHOTTING CURRENT STATE ---')
const snap = { takenAt: new Date().toISOString(), purpose: 'Path C — pre-revert state of all 43 tagged bundles', products: [] }
for (const id of ALL_BUNDLES) {
  const gid = `gid://shopify/Product/${id}`
  const r = await gql(`{ product(id:"${gid}"){ id title productType seo{title description}
    cl0:metafield(namespace:"mm-google-shopping",key:"custom_label_0"){value}
    gpc:metafield(namespace:"mm-google-shopping",key:"google_product_category"){value}
  }}`)
  const p = r.data?.product
  if (!p) { console.log(`  ⚠️  ${id} — not found`); continue }
  snap.products.push({
    id, title: p.title,
    productType: p.productType || '',
    seoTitle: p.seo?.title || '',
    seoDescription: p.seo?.description || '',
    custom_label_0: p.cl0?.value || '',
    google_product_category: p.gpc?.value || '',
  })
}
writeFileSync('data/snapshots/path-c-pre-revert-2026-05-05.json', JSON.stringify(snap, null, 2))
console.log(`✓ Snapshot saved: data/snapshots/path-c-pre-revert-2026-05-05.json (${snap.products.length} entries)\n`)

// 2. EXECUTE — clear productType + seoTitle, keep metafields
console.log('--- REVERTING productType + seoTitle to EMPTY ---')
const results = []
for (const p of snap.products) {
  const gid = `gid://shopify/Product/${p.id}`
  const log = { id: p.id, title: p.title, before: { productType: p.productType, seoTitle: p.seoTitle }, after: {} }

  const r = await gql(
    `mutation productUpdate($input: ProductInput!) { productUpdate(input:$input){ product{ productType seo{title} } userErrors{message} } }`,
    { input: { id: gid, productType: '', seo: { title: '' } } }
  )

  if (r.data?.productUpdate?.userErrors?.length) {
    log.after.error = r.data.productUpdate.userErrors
    log.status = 'ERROR'
  } else {
    log.after.productType = r.data?.productUpdate?.product?.productType || ''
    log.after.seoTitle = r.data?.productUpdate?.product?.seo?.title || ''
    log.status = 'OK'
  }

  // Verify metafields are still intact
  const verify = await gql(`{ product(id:"${gid}"){
    cl0:metafield(namespace:"mm-google-shopping",key:"custom_label_0"){value}
    gpc:metafield(namespace:"mm-google-shopping",key:"google_product_category"){value}
  }}`)
  log.metafields_intact = {
    custom_label_0: verify.data?.product?.cl0?.value || '',
    google_product_category: verify.data?.product?.gpc?.value || '',
  }

  results.push(log)
  const ok = log.status === 'OK' && log.metafields_intact.custom_label_0 === 'bundle_premium'
  console.log(`  ${ok ? '✓' : '✗'} ${p.id} ${(p.title||'').slice(0,42).padEnd(43)} cl0=${log.metafields_intact.custom_label_0||'EMPTY'}`)
  await new Promise(r => setTimeout(r, 600))
}

const out = {
  ranAt: new Date().toISOString(),
  phase: 'Path C — Hybrid Revert (productType+seoTitle to empty, keep custom_label_0 + GPC)',
  totalAttempted: ALL_BUNDLES.length,
  successful: results.filter(r => r.status === 'OK' && r.metafields_intact.custom_label_0 === 'bundle_premium').length,
  failed: results.filter(r => r.status !== 'OK').length,
  results,
}
writeFileSync('data/snapshots/path-c-execution-2026-05-05.json', JSON.stringify(out, null, 2))

console.log(`\n========== PATH C SUMMARY ==========`)
console.log(`Successful (productType cleared, custom_label_0 intact): ${out.successful} / ${out.totalAttempted}`)
console.log(`Failed: ${out.failed}`)
console.log(`\nExecution log: data/snapshots/path-c-execution-2026-05-05.json`)
console.log(`Pre-revert snapshot: data/snapshots/path-c-pre-revert-2026-05-05.json`)
console.log(`\nState now matches pre-surgery query-matching configuration.`)
console.log(`custom_label_0 = bundle_premium retained on all 43 for May 12 cannibalisation kill.`)
process.exit(0)
