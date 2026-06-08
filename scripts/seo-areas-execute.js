/**
 * SEO AREAS EXECUTE — May 15 2026
 * Creates 8 state + 4 regional collection pages on templateSuffix='locations'.
 * Same methodology as yesterday's seo-city-execute.js — snapshot, create,
 * metafields, log, ready-for-rollback.
 *
 * Run: node scripts/seo-areas-execute.js
 */
import 'dotenv/config'
import { writeFileSync, mkdirSync } from 'fs'
import { AREAS, REVIEW_BLOCK_HTML, REVIEW_BLOCK_MARKER, buildSchema, buildLocationText, buildMetaDescription, buildTitleTag } from './seo-areas-data.js'

const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN || process.env.SHOPIFY_TOKEN
const URL = 'https://bdd19a-3.myshopify.com/admin/api/2026-01/graphql.json'

async function gql(query, variables = {}) {
  const r = await fetch(URL, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  return r.json()
}

mkdirSync('data/snapshots/seo-areas', { recursive: true })

console.log(`\n========== SEO AREAS PUSH — ${new Date().toISOString().slice(0, 19)} ==========\n`)

const snapshot = { takenAt: new Date().toISOString(), areas: AREAS.map(a => a.handle), created: [], skipped: [] }
const log = { ranAt: new Date().toISOString(), results: [], totalCreated: 0, totalErrors: 0 }

// 1. Check if any handles already exist (idempotency)
console.log('--- STEP 1: CHECK EXISTING HANDLES ---')
for (const a of AREAS) {
  const r = await gql(`{ collectionByHandle(handle: "${a.handle}") { id title handle } }`)
  if (r.data?.collectionByHandle?.id) {
    console.log(`  ⚠ ${a.handle} already exists (${r.data.collectionByHandle.id}) — skipping create`)
    snapshot.skipped.push({ handle: a.handle, id: r.data.collectionByHandle.id })
  }
}

const toCreate = AREAS.filter(a => !snapshot.skipped.find(s => s.handle === a.handle))
console.log(`✓ ${toCreate.length}/${AREAS.length} to create, ${snapshot.skipped.length} skipped\n`)

// 2. Create collections
console.log('--- STEP 2: CREATE COLLECTIONS ---')
const createMutation = `mutation collectionCreate($input: CollectionInput!) {
  collectionCreate(input: $input) {
    collection { id handle title }
    userErrors { field message }
  }
}`

for (const a of toCreate) {
  const title = `Gender Reveal Ideas ${a.name}`
  const descriptionHtml = REVIEW_BLOCK_HTML + `\n<p>${a.nameFull}'s biggest range of gender reveal ideas. Cannons, smoke bombs, powder blasters and sports reveals. ${a.deliveryDays} delivery${a.fromGoldCoast ? ' from the Gold Coast' : ''}. Free shipping over $150.</p>`
  const input = {
    title,
    handle: a.handle,
    descriptionHtml,
    templateSuffix: 'locations',
    ruleSet: {
      appliedDisjunctively: false,
      rules: [
        { column: 'VARIANT_PRICE', relation: 'GREATER_THAN', condition: '0' },
        { column: 'TITLE', relation: 'NOT_CONTAINS', condition: '[FREE]' },
      ],
    },
    seo: { title: buildTitleTag(a), description: buildMetaDescription(a) },
  }
  const r = await gql(createMutation, { input })
  const errs = r.data?.collectionCreate?.userErrors || []
  if (errs.length || !r.data?.collectionCreate?.collection?.id) {
    log.results.push({ handle: a.handle, status: 'CREATE_ERROR', errors: errs })
    log.totalErrors++
    console.log(`  ✗ ${a.handle} — ${JSON.stringify(errs).slice(0, 200)}`)
    continue
  }
  const id = r.data.collectionCreate.collection.id
  snapshot.created.push({ handle: a.handle, id, kind: a.kind })
  log.totalCreated++
  console.log(`  ✓ ${a.handle} — ${id}`)
  await new Promise(r => setTimeout(r, 400))
}

// 3. Set metafields on every area (created + skipped)
console.log('\n--- STEP 3: SET METAFIELDS ---')
const allTargets = [...snapshot.created, ...snapshot.skipped].map(s => {
  const a = AREAS.find(x => x.handle === s.handle)
  return { ...a, id: s.id }
})

for (const a of allTargets) {
  const metafields = [
    { ownerId: a.id, namespace: 'global', key: 'title_tag', type: 'single_line_text_field', value: buildTitleTag(a) },
    { ownerId: a.id, namespace: 'global', key: 'description_tag', type: 'single_line_text_field', value: buildMetaDescription(a) },
    { ownerId: a.id, namespace: 'custom', key: 'looking_to_buy_location_text', type: 'rich_text_field', value: JSON.stringify(buildLocationText(a)) },
    { ownerId: a.id, namespace: 'custom', key: 'custom_schema', type: 'multi_line_text_field', value: buildSchema(a) },
    { ownerId: a.id, namespace: 'custom', key: 'collection_name', type: 'single_line_text_field', value: a.name },
    { ownerId: a.id, namespace: 'custom', key: 'location_name', type: 'single_line_text_field', value: a.name },
  ]
  const r = await gql(`mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) { userErrors { field message } }
  }`, { metafields })
  const errs = r.data?.metafieldsSet?.userErrors || []
  if (errs.length) {
    console.log(`  ✗ metafields ${a.handle} — ${JSON.stringify(errs).slice(0, 200)}`)
    log.results.push({ handle: a.handle, status: 'METAFIELD_ERROR', errors: errs })
    log.totalErrors++
  } else {
    console.log(`  ✓ metafields ${a.handle}`)
    log.results.push({ handle: a.handle, status: 'OK' })
  }
  await new Promise(r => setTimeout(r, 400))
}

writeFileSync('data/snapshots/seo-areas/snapshot-2026-05-15.json', JSON.stringify(snapshot, null, 2))
writeFileSync('data/snapshots/seo-areas/execution-log-2026-05-15.json', JSON.stringify(log, null, 2))

console.log(`\n========== SUMMARY ==========`)
console.log(`Created:  ${log.totalCreated}`)
console.log(`Skipped:  ${snapshot.skipped.length}`)
console.log(`Errors:   ${log.totalErrors}`)
console.log(`\nSnapshot: data/snapshots/seo-areas/snapshot-2026-05-15.json`)
console.log(`Log:      data/snapshots/seo-areas/execution-log-2026-05-15.json`)
console.log(`Rollback: node scripts/seo-areas-rollback.js`)
console.log(`\n⚠ NEXT: publish to Online Store sales channel (Shopify defaults to unpublished on create)`)
console.log(`⚠ NEXT: submit each URL to GSC URL Inspection`)
process.exit(0)
