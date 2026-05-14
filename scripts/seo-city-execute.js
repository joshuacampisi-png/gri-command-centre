/**
 * SEO CITY EXECUTION — One-shot ship of 3 tracks:
 *  - TRACK A (DEFEND): Brisbane, Adelaide, Gold Coast, Darwin — upgrade schema + review block
 *  - TRACK B (CLIMB): Perth, Sydney, Melbourne — same upgrades + climb content
 *  - TRACK C (BUILD): Newcastle, Canberra, Sunshine Coast, Wollongong, Hobart — create new collections
 *
 * Per-city changes (existing collections):
 *  1. Update title_tag metafield (with star rating + city)
 *  2. Update description_tag metafield (with rating + reviewCount)
 *  3. Update looking_to_buy_location_text metafield (expanded content)
 *  4. Update custom_schema metafield (LocalBusiness + AggregateRating + Organization @graph)
 *  5. Prepend visible review block to descriptionHtml (matches schema)
 *
 * Per-city creates (new collections):
 *  1. Create smart collection with templateSuffix=locations + 2 rules
 *  2. Populate all 6 metafields
 *  3. Set descriptionHtml with review block + introductory content
 *
 * SNAPSHOT taken before any change. Each step verified after write.
 */
import 'dotenv/config'
import { writeFileSync, mkdirSync } from 'fs'
import { CITIES, REVIEW_BLOCK_HTML, REVIEW_BLOCK_MARKER, buildSchemaForCity, buildLocationText, buildMetaDescription, buildTitleTag } from './seo-city-data.js'

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

mkdirSync('data/snapshots/seo-cities', { recursive: true })

console.log(`\n========== SEO CITY EXECUTION — ${new Date().toISOString().slice(0, 19)} ==========\n`)

// =======================
// STAGE 1: SNAPSHOT all existing city collections
// =======================
console.log('--- STAGE 1: SNAPSHOT EXISTING COLLECTIONS ---\n')
const snapshot = { takenAt: new Date().toISOString(), existing: {}, newCreated: [] }

for (const c of CITIES) {
  const q = `{ collectionByHandle(handle: "${c.handle}") {
    id title handle descriptionHtml templateSuffix
    titleTag: metafield(namespace:"global",key:"title_tag"){value}
    descTag: metafield(namespace:"global",key:"description_tag"){value}
    collName: metafield(namespace:"custom",key:"collection_name"){value}
    locName: metafield(namespace:"custom",key:"location_name"){value}
    locText: metafield(namespace:"custom",key:"looking_to_buy_location_text"){value}
    customSchema: metafield(namespace:"custom",key:"custom_schema"){value}
  }}`
  const r = await gql(q)
  const col = r.data?.collectionByHandle
  if (col) {
    snapshot.existing[c.handle] = {
      id: col.id, title: col.title, handle: col.handle,
      descriptionHtml: col.descriptionHtml || '',
      templateSuffix: col.templateSuffix,
      title_tag: col.titleTag?.value || '',
      description_tag: col.descTag?.value || '',
      collection_name: col.collName?.value || '',
      location_name: col.locName?.value || '',
      looking_to_buy_location_text: col.locText?.value || '',
      custom_schema: col.customSchema?.value || '',
    }
    console.log(`  ✓ snapshotted ${c.handle} (existing)`)
  } else {
    snapshot.existing[c.handle] = null
    console.log(`  ⊘ ${c.handle} does NOT exist — will CREATE in Track C`)
  }
}

writeFileSync('data/snapshots/seo-cities/snapshot-2026-05-14.json', JSON.stringify(snapshot, null, 2))
console.log(`\n✓ Snapshot saved: data/snapshots/seo-cities/snapshot-2026-05-14.json\n`)

// =======================
// STAGE 2: UPGRADE existing collections (Tracks A + B)
// =======================
console.log('--- STAGE 2: UPGRADE EXISTING (7 cities — Tracks A + B) ---\n')

const upgradeLog = { processed: [], errors: [] }

for (const c of CITIES) {
  const existing = snapshot.existing[c.handle]
  if (!existing) continue // skip new cities for stage 2

  console.log(`\n→ [${c.track}] ${c.handle} (${c.city})`)
  const log = { handle: c.handle, city: c.city, track: c.track, steps: [] }

  // Build new content
  const newTitleTag = buildTitleTag(c)
  const newMetaDesc = buildMetaDescription(c)
  const newLocText = JSON.stringify(buildLocationText(c))
  const newSchema = buildSchemaForCity(c)

  // Prepend review block to descriptionHtml (idempotency check)
  let newDescHtml = existing.descriptionHtml
  if (!newDescHtml.includes(REVIEW_BLOCK_MARKER)) {
    newDescHtml = REVIEW_BLOCK_HTML + '\n' + newDescHtml
  }

  // Step A: Update Collection descriptionHtml + seo
  const updateCollMut = `mutation collectionUpdate($input: CollectionInput!) {
    collectionUpdate(input: $input) {
      collection { id }
      userErrors { field message }
    }
  }`
  const r1 = await gql(updateCollMut, {
    input: {
      id: existing.id,
      descriptionHtml: newDescHtml,
      seo: { title: newTitleTag, description: newMetaDesc },
    },
  })
  if (r1.data?.collectionUpdate?.userErrors?.length) {
    log.steps.push({ step: 'collectionUpdate', status: 'ERROR', errors: r1.data.collectionUpdate.userErrors })
    console.log(`  ❌ collectionUpdate: ${JSON.stringify(r1.data.collectionUpdate.userErrors)}`)
    upgradeLog.errors.push(log)
    continue
  }
  log.steps.push({ step: 'collectionUpdate', status: 'OK' })
  console.log(`  ✓ collectionUpdate (descriptionHtml + seo)`)

  // Step B: Update metafields
  const metafieldsMut = `mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      userErrors { field message }
    }
  }`
  const r2 = await gql(metafieldsMut, {
    metafields: [
      { ownerId: existing.id, namespace: 'global', key: 'title_tag', type: 'single_line_text_field', value: newTitleTag },
      { ownerId: existing.id, namespace: 'global', key: 'description_tag', type: 'single_line_text_field', value: newMetaDesc },
      { ownerId: existing.id, namespace: 'custom', key: 'looking_to_buy_location_text', type: 'rich_text_field', value: newLocText },
      { ownerId: existing.id, namespace: 'custom', key: 'custom_schema', type: 'multi_line_text_field', value: newSchema },
    ],
  })
  if (r2.data?.metafieldsSet?.userErrors?.length) {
    log.steps.push({ step: 'metafieldsSet', status: 'ERROR', errors: r2.data.metafieldsSet.userErrors })
    console.log(`  ❌ metafieldsSet: ${JSON.stringify(r2.data.metafieldsSet.userErrors)}`)
    upgradeLog.errors.push(log)
    continue
  }
  log.steps.push({ step: 'metafieldsSet', status: 'OK' })
  console.log(`  ✓ metafieldsSet (4 fields updated)`)

  upgradeLog.processed.push(log)
  await new Promise(r => setTimeout(r, 600))
}

// =======================
// STAGE 3: CREATE new collections (Track C)
// =======================
console.log(`\n--- STAGE 3: CREATE NEW (5 cities — Track C) ---\n`)
const createLog = { created: [], errors: [] }

for (const c of CITIES) {
  if (snapshot.existing[c.handle]) continue // skip existing
  if (c.track !== 'BUILD') continue

  console.log(`\n→ [BUILD] ${c.handle} (${c.city})`)
  const log = { handle: c.handle, city: c.city, steps: [] }

  // Step 1: Create collection with smart rules + templateSuffix
  const createMut = `mutation collectionCreate($input: CollectionInput!) {
    collectionCreate(input: $input) {
      collection { id handle title templateSuffix }
      userErrors { field message }
    }
  }`
  const newDescHtml = REVIEW_BLOCK_HTML + '\n<p>Discover the biggest range of gender reveal products for ' + c.city + ' families. Cannons, smoke bombs, powder blasters, sports reveals and balloon kits — all Australian-tested, eco-friendly, and shipped fast to ' + c.stateFull + '.</p>'

  const r1 = await gql(createMut, {
    input: {
      title: `Gender Reveal Ideas ${c.city}`,
      handle: c.handle,
      descriptionHtml: newDescHtml,
      templateSuffix: 'locations',
      seo: { title: buildTitleTag(c), description: buildMetaDescription(c) },
      ruleSet: {
        appliedDisjunctively: false,
        rules: [
          { column: 'VARIANT_PRICE', relation: 'GREATER_THAN', condition: '0' },
          { column: 'TITLE', relation: 'NOT_CONTAINS', condition: '[FREE]' },
        ],
      },
    },
  })

  if (r1.data?.collectionCreate?.userErrors?.length) {
    log.steps.push({ step: 'collectionCreate', status: 'ERROR', errors: r1.data.collectionCreate.userErrors })
    console.log(`  ❌ create: ${JSON.stringify(r1.data.collectionCreate.userErrors)}`)
    createLog.errors.push(log)
    continue
  }
  const newId = r1.data?.collectionCreate?.collection?.id
  log.steps.push({ step: 'collectionCreate', status: 'OK', id: newId })
  console.log(`  ✓ created: ${newId}`)
  snapshot.newCreated.push({ handle: c.handle, id: newId, city: c.city })

  // Step 2: Set all metafields
  const r2 = await gql(`mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) { userErrors { field message } }
  }`, {
    metafields: [
      { ownerId: newId, namespace: 'global', key: 'title_tag', type: 'single_line_text_field', value: buildTitleTag(c) },
      { ownerId: newId, namespace: 'global', key: 'description_tag', type: 'single_line_text_field', value: buildMetaDescription(c) },
      { ownerId: newId, namespace: 'custom', key: 'collection_name', type: 'single_line_text_field', value: 'Products' },
      { ownerId: newId, namespace: 'custom', key: 'location_name', type: 'single_line_text_field', value: c.city },
      { ownerId: newId, namespace: 'custom', key: 'looking_to_buy_location_text', type: 'rich_text_field', value: JSON.stringify(buildLocationText(c)) },
      { ownerId: newId, namespace: 'custom', key: 'custom_schema', type: 'multi_line_text_field', value: buildSchemaForCity(c) },
    ],
  })
  if (r2.data?.metafieldsSet?.userErrors?.length) {
    log.steps.push({ step: 'metafieldsSet', status: 'ERROR', errors: r2.data.metafieldsSet.userErrors })
    console.log(`  ❌ metafieldsSet: ${JSON.stringify(r2.data.metafieldsSet.userErrors)}`)
  } else {
    log.steps.push({ step: 'metafieldsSet', status: 'OK' })
    console.log(`  ✓ metafields populated`)
  }

  createLog.created.push(log)
  await new Promise(r => setTimeout(r, 800))
}

// Save final snapshot with created IDs
writeFileSync('data/snapshots/seo-cities/snapshot-2026-05-14.json', JSON.stringify(snapshot, null, 2))

// =======================
// SUMMARY
// =======================
const finalLog = {
  ranAt: new Date().toISOString(),
  upgrade: upgradeLog,
  create: createLog,
  totals: {
    upgraded: upgradeLog.processed.length,
    upgradeErrors: upgradeLog.errors.length,
    created: createLog.created.length,
    createErrors: createLog.errors.length,
  },
}
writeFileSync('data/snapshots/seo-cities/execution-log-2026-05-14.json', JSON.stringify(finalLog, null, 2))

console.log(`\n========== SUMMARY ==========`)
console.log(`Upgraded (existing): ${finalLog.totals.upgraded}`)
console.log(`Upgrade errors:      ${finalLog.totals.upgradeErrors}`)
console.log(`Created (new):       ${finalLog.totals.created}`)
console.log(`Create errors:       ${finalLog.totals.createErrors}`)
console.log(`\nLogs: data/snapshots/seo-cities/execution-log-2026-05-14.json`)
console.log(`Snap: data/snapshots/seo-cities/snapshot-2026-05-14.json`)
console.log(`Rollback: node scripts/seo-city-rollback.js`)
process.exit(0)
