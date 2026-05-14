/**
 * Phase 2 EXPANSION — restore productType + SEO title + custom_label_0 + google_product_category
 * on the remaining gender-reveal bundles (the 5 done previously stay as-is).
 *
 * Excludes: [FREE] gift packs, scratchies, accessories (wristbands/badges/photo props/cake topper),
 * non-gender-reveal themed sets (Mario/Paw Patrol/Toy Story), single decorations.
 *
 * Snapshot taken BEFORE any change. Each product processed individually with verification.
 * Rollback: scripts/phase2-expand-rollback.js (auto-generated from snapshot)
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

// Hand-curated bundle classification — title preserved, only productType/SEO/labels added
const BUNDLES = [
  { id: '7487467880537', subtype: 'Balloon Kit',          gpc: '2587', seo: '148 Piece Gender Reveal Baby Shower Luxury Balloon Kit Pink Blue Australia' },
  { id: '7513391530073', subtype: 'Cannon Pack',          gpc: '5709', seo: '4 Pack Gender Reveal Confetti & Powder XL Cannon Bundle Pink Blue Australia' },
  { id: '7513392283737', subtype: 'Cannon Pack',          gpc: '5709', seo: '4 Pack Gender Reveal Powder Cannon BIO XL Bundle Pink Blue Australia' },
  { id: '7526235144281', subtype: 'Premium',              gpc: '5709', seo: 'Mega Gender Reveal Party Bundle Pink Blue Australia' },
  { id: '7538953420889', subtype: 'Balloon Kit',          gpc: '2587', seo: '87 Piece Gender Reveal Nature Baby Shower Luxury Balloon Kit Pink Blue Australia' },
  { id: '7668213088345', subtype: 'Cannon Pack',          gpc: '5709', seo: '4 Pack Gender Reveal Confetti Cannon XL BIO Bundle Pink Blue Australia' },
  { id: '7697474584665', subtype: 'Smoke & Cannon',       gpc: '5709', seo: 'Double Gender Reveal Smoke & Cannon Bundle Pink Blue Australia' },
  { id: '7767077519449', subtype: 'Smoke & Cannon',       gpc: '5709', seo: 'Gender Reveal Mega Smoke & Cannon Effect Bundle Pink Blue Australia' },
  { id: '7809558380633', subtype: 'Cannon & Extinguisher',gpc: '2781', seo: 'Double MEGA Powder Extinguisher & Gender Reveal Cannon Bundle Pink Blue Australia' },
  { id: '7812050452569', subtype: 'Sports',               gpc: '5709', seo: 'AFL Gender Reveal Ball & Cannon Family Bundle Pink Blue Australia' },
  { id: '7812052123737', subtype: 'Sports',               gpc: '5709', seo: 'Golf Gender Reveal Cannon & Ball Family Bundle Pink Blue Australia' },
  { id: '7812052516953', subtype: 'Sports',               gpc: '5709', seo: 'Gender Reveal Soccer & Cannon Family Bundle Pink Blue Australia' },
  { id: '7823504244825', subtype: 'Party Box',            gpc: '5709', seo: 'Gender Reveal Baby Shower Party Box Set Pink Blue Australia' },
  { id: '7899285848153', subtype: 'Cannon Pack',          gpc: '5709', seo: 'Gender Reveal Poke Ball 2 Pack Powder Pink Blue Australia' },
  { id: '7899676442713', subtype: 'Cannon Pack',          gpc: '5709', seo: 'PRANK 2 Pack Gender Reveal Cannon Pink Blue Australia' },
  { id: '7899680374873', subtype: 'Cannon Pack',          gpc: '5709', seo: 'PRANK 4 Pack Gender Reveal Cannon Pink Blue Australia' },
  { id: '7919388655705', subtype: 'Powder Extinguisher',  gpc: '2781', seo: 'Quad Family Gender Reveal Extinguisher Bundle Pink Blue Australia' },
  { id: '7923370491993', subtype: 'Premium',              gpc: '5709', seo: 'Gender-Geddon Australia\'s Largest Gender Reveal Mega Bundle' },
  { id: '7926990504025', subtype: 'Decorations',          gpc: '2587', seo: 'Value Gender Reveal Decoration Set Pink Blue Australia' },
  { id: '7927054434393', subtype: 'Decorations',          gpc: '2587', seo: 'Basic Gender Reveal Decoration Set Pink Blue Australia' },
  { id: '7927056367705', subtype: 'Decorations',          gpc: '2587', seo: 'Family Gender Reveal Decoration Set Pink Blue Australia' },
  { id: '7980864766041', subtype: 'Sports',               gpc: '5709', seo: 'Gender Reveal AFL Sports Bundle Pink Blue Australia' },
  { id: '7989373206617', subtype: 'Cannon Pack',          gpc: '5709', seo: '4 Pack Gender Reveal Purple Party Powder Cannon BIO XL Bundle Australia' },
  { id: '7989373468761', subtype: 'Cannon Pack',          gpc: '5709', seo: '4 Pack Gender Reveal Green Party Powder Cannon BIO XL Bundle Australia' },
  { id: '7989373665369', subtype: 'Cannon Pack',          gpc: '5709', seo: '4 Pack Gender Reveal Orange Party Powder Cannon BIO XL Bundle Australia' },
  { id: '8004093673561', subtype: 'Decorations',          gpc: '2587', seo: 'Full Gender Reveal Back Drop Kit Pink Blue Australia' },
  { id: '8045356941401', subtype: 'Premium',              gpc: '5709', seo: 'Gender Reveal Mum & Dad Feature Pack Pink Blue Australia' },
  { id: '8121593200729', subtype: 'Premium',              gpc: '5709', seo: 'Backyard Celebration Gender Reveal Bundle Pink Blue Australia' },
  { id: '8121617678425', subtype: 'Premium',              gpc: '5709', seo: 'Grandparent Moment Gender Reveal Bundle Pink Blue Australia' },
  { id: '8121655066713', subtype: 'Sports',               gpc: '5709', seo: 'Game Day Gender Reveal Sports Bundle Pink Blue Australia' },
  { id: '8121690128473', subtype: 'Premium',              gpc: '5709', seo: 'Double Trouble Twins Gender Reveal Bundle Pink Blue Australia' },
  { id: '8122484981849', subtype: 'Smoke & Cannon',       gpc: '5709', seo: 'Gender Reveal Blaster & Smoke Reveal Kit Pink Blue Australia' },
  { id: '8122490454105', subtype: 'Premium',              gpc: '5709', seo: 'Low Mess Indoor Gender Reveal Bundle Pink Blue Australia' },
  { id: '8122500808793', subtype: 'Premium',              gpc: '5709', seo: 'Scratch & Reveal Gender Reveal Party Bundle Pink Blue Australia' },
  { id: '8124506341465', subtype: 'Premium',              gpc: '5709', seo: 'Exclusive Gender Reveal Bundle Pink Blue Australia' },
  { id: '8129167622233', subtype: 'Cannon Pack',          gpc: '5709', seo: '2 Pack Gender Reveal Confetti & Powder XL Cannon Bundle Pink Blue Australia' },
  { id: '8129169260633', subtype: 'Cannon Pack',          gpc: '5709', seo: '2 Pack Gender Reveal Powder XL Cannon Bundle Pink Blue Australia' },
  { id: '8129170014297', subtype: 'Cannon Pack',          gpc: '5709', seo: '2 Pack Gender Reveal Confetti XL Cannon Bundle Pink Blue Australia' },
]

// EXCLUDED (with reason) — not real GR bundles or non-shoppable
const EXCLUDED = [
  { id: '7995460124761', reason: '[FREE] Large Gift Pack — non-shoppable' },
  { id: '7996767830105', reason: '[FREE] Small Gift Pack — non-shoppable' },
  { id: '8001309212761', reason: '[FREE] Medium Gift Pack — non-shoppable' },
  { id: '7515489534041', reason: 'Large OH BABY Foil Balloon Set — single decoration, not bundle' },
  { id: '7798742220889', reason: 'Scratchie 10 Pack — accessory not bundle' },
  { id: '7987539116121', reason: 'GRI 24 Pack Scratchies — accessory not bundle' },
  { id: '7802228506713', reason: 'Cake Topper Kit — accessory' },
  { id: '7963121123417', reason: 'Custom Wrist Bands 20 Pack — accessory' },
  { id: '7968571981913', reason: 'Custom Party Badges 20 — accessory' },
  { id: '8142970814553', reason: 'Photo Booth Props — accessory' },
  { id: '7907587817561', reason: 'Super Mario Theme Set — non-GR themed' },
  { id: '7912781217881', reason: 'Paw Patrol Chase — non-GR themed' },
  { id: '7912863989849', reason: 'Paw Patrol Rubble — non-GR themed' },
  { id: '7912864317529', reason: 'Paw Patrol Marshall — non-GR themed' },
  { id: '7912864415833', reason: 'Paw Patrol Skye — non-GR themed' },
  { id: '7914554425433', reason: 'Large BABY Box & Balloon — single decoration' },
  { id: '7917204930649', reason: 'Super Mario Foil Set — non-GR themed' },
  { id: '7919077359705', reason: 'Toy Story Party Set — non-GR themed' },
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

async function getCurrentState(id) {
  const gid = `gid://shopify/Product/${id}`
  const r = await gql(`{ product(id:"${gid}"){ id title productType seo{title description}
    cl0:metafield(namespace:"mm-google-shopping",key:"custom_label_0"){value}
    gpc:metafield(namespace:"mm-google-shopping",key:"google_product_category"){value}
  }}`)
  return r.data?.product || null
}

async function updateProduct(b) {
  const gid = `gid://shopify/Product/${b.id}`
  const productType = `Gender Reveal > Bundles > ${b.subtype}`
  const log = { id: b.id, productType, seoTitle: b.seo, gpc: b.gpc, steps: [] }

  // Step 1: productType + seo title
  const r1 = await gql(PRODUCT_UPDATE, {
    input: { id: gid, productType, seo: { title: b.seo } },
  })
  if (r1.data?.productUpdate?.userErrors?.length) {
    log.steps.push({ step: 'productUpdate', status: 'ERROR', errors: r1.data.productUpdate.userErrors })
    return log
  }
  log.steps.push({
    step: 'productUpdate', status: 'OK',
    productType: r1.data?.productUpdate?.product?.productType,
    seoTitle: r1.data?.productUpdate?.product?.seo?.title,
  })

  // Step 2: metafields
  const r2 = await gql(METAFIELDS_SET, {
    metafields: [
      { ownerId: gid, namespace: 'mm-google-shopping', key: 'custom_label_0', type: 'single_line_text_field', value: 'bundle_premium' },
      { ownerId: gid, namespace: 'mm-google-shopping', key: 'google_product_category', type: 'single_line_text_field', value: b.gpc },
    ],
  })
  if (r2.data?.metafieldsSet?.userErrors?.length) {
    log.steps.push({ step: 'metafieldsSet', status: 'ERROR', errors: r2.data.metafieldsSet.userErrors })
  } else {
    log.steps.push({ step: 'metafieldsSet', status: 'OK' })
  }

  return log
}

console.log(`\n========== PHASE 2 EXPANSION — ${new Date().toISOString().slice(0, 19)} ==========\n`)
console.log(`Targets: ${BUNDLES.length} additional bundles (5 already done in initial Phase 2 = 43 total tagged)`)
console.log(`Excluded: ${EXCLUDED.length} non-shoppable / non-GR / accessory items\n`)

// 1. Snapshot
console.log('--- SNAPSHOTTING ---')
const snapshot = { takenAt: new Date().toISOString(), purpose: 'Phase 2 EXPANSION rollback reference', products: [] }
for (const b of BUNDLES) {
  const p = await getCurrentState(b.id)
  if (!p) {
    console.log(`  ⚠️  ${b.id} — NOT FOUND, skipping`)
    snapshot.products.push({ id: b.id, error: 'not found' })
    continue
  }
  snapshot.products.push({
    id: b.id, title: p.title,
    productType: p.productType || '',
    seoTitle: p.seo?.title || '',
    seoDescription: p.seo?.description || '',
    custom_label_0: p.cl0?.value || '',
    google_product_category: p.gpc?.value || '',
  })
  console.log(`  ✓ snapshotted ${b.id} (${p.title?.slice(0, 45)})`)
}
writeFileSync('data/snapshots/phase2-expand-pre-snapshot.json', JSON.stringify(snapshot, null, 2))
console.log(`✓ Snapshot saved: data/snapshots/phase2-expand-pre-snapshot.json (${snapshot.products.length} entries)\n`)

// 2. Execute
console.log('--- EXECUTING UPDATES ---')
const results = []
for (const b of BUNDLES) {
  const snap = snapshot.products.find(s => s.id === b.id)
  if (snap?.error === 'not found') {
    console.log(`  ⊘ ${b.id} — skipped (not found)`)
    continue
  }
  const log = await updateProduct(b)
  results.push(log)
  const ok = log.steps.every(s => s.status === 'OK')
  console.log(`  ${ok ? '✓' : '✗'} ${b.id} — ${b.subtype.padEnd(22)} ${ok ? 'OK' : 'ERROR'}`)
  await new Promise(r => setTimeout(r, 800))
}

// 3. Save execution log
const out = {
  ranAt: new Date().toISOString(),
  phase: 'Phase 2 Expansion — Bundle Tagging',
  totalAttempted: BUNDLES.length,
  successful: results.filter(r => r.steps.every(s => s.status === 'OK')).length,
  failed: results.filter(r => r.steps.some(s => s.status === 'ERROR')).length,
  results,
  excluded: EXCLUDED,
}
writeFileSync('data/snapshots/phase2-expand-execution-log.json', JSON.stringify(out, null, 2))

console.log(`\n========== SUMMARY ==========`)
console.log(`Successful: ${out.successful} / ${out.totalAttempted}`)
console.log(`Failed:     ${out.failed}`)
console.log(`Excluded:   ${EXCLUDED.length}`)
console.log(`\nExecution log: data/snapshots/phase2-expand-execution-log.json`)
console.log(`Snapshot:      data/snapshots/phase2-expand-pre-snapshot.json`)
console.log(`Rollback:      node scripts/phase2-expand-rollback.js`)
process.exit(0)
