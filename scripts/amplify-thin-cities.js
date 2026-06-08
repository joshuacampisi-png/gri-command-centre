/**
 * AMPLIFY THIN CITY PAGES TO MATCH ADELAIDE TEMPLATE
 *
 * Pattern proven: pages with 21K descHtml rank #1, pages with 3.8K rank #3-16.
 * This copies the Adelaide HTML template and substitutes city-specific data
 * for: Canberra, ACT, and Townsville (new build).
 *
 * Snapshot BEFORE for each, mutate, log. Rollback: --rollback restores previous descHtml.
 */
import 'dotenv/config'
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs'

const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const URL = 'https://bdd19a-3.myshopify.com/admin/api/2026-01/graphql.json'
const SNAPSHOT_DIR = 'data/snapshots/amplify-thin-cities'
mkdirSync(SNAPSHOT_DIR, { recursive: true })

const ROLLBACK = process.argv.includes('--rollback')
const DRY_RUN = !process.argv.includes('--ship') && !ROLLBACK

async function gql(q, v) {
  const r = await fetch(URL, { method:'POST', headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json'}, body: JSON.stringify({query:q,variables:v}) })
  return r.json()
}

// Target locations with their data
const TARGETS = [
  {
    handle: 'gender-reveal-ideas-canberra',
    city: 'Canberra',
    state: 'ACT',
    stateFull: 'Australian Capital Territory',
    deliveryDays: '1 to 2 days',
    climate: "Canberra's continental climate gives you warm spring and autumn days ideal for outdoor reveals — and crisp clear winter days work beautifully too",
    venues: ['Lake Burley Griffin', 'Commonwealth Park', 'Stromlo Forest Park', 'Black Mountain', 'Mount Ainslie', 'National Arboretum', 'Telopea Park', 'Lake Tuggeranong', 'Weston Park', 'Pine Island Reserve'],
    sampleVenue1: 'Lake Burley Griffin',
    sampleVenue2: 'Commonwealth Park',
    sampleVenue3: 'the National Arboretum',
  },
  {
    handle: 'gender-reveal-ideas-act',
    city: 'ACT',
    state: 'ACT',
    stateFull: 'Australian Capital Territory',
    deliveryDays: '1 to 2 days',
    climate: "The ACT's continental climate gives you warm spring and autumn days ideal for outdoor reveals — winter clear-sky days also work beautifully for daytime events",
    venues: ['Lake Burley Griffin', 'Commonwealth Park', 'Stromlo Forest Park', 'Black Mountain', 'Mount Ainslie', 'National Arboretum', 'Telopea Park', 'Lake Tuggeranong', 'Weston Park', 'Pine Island Reserve'],
    sampleVenue1: 'Lake Burley Griffin',
    sampleVenue2: 'Commonwealth Park',
    sampleVenue3: 'the National Arboretum',
  },
  {
    handle: 'gender-reveal-ideas-townsville',
    city: 'Townsville',
    state: 'QLD',
    stateFull: 'Queensland',
    deliveryDays: '1 to 2 days',
    climate: "Townsville's tropical climate means year-round warm weather ideal for outdoor reveals. Dry season (May-Oct) gives you sunny clear days for stunning reveal photography",
    venues: ['The Strand', 'Castle Hill', 'Jezzine Barracks', 'Riverway Parklands', 'Anderson Park Botanic Gardens', 'Pallarenda Beach', 'Rowes Bay', 'Reid Park', 'Queens Gardens', 'Magnetic Island foreshore'],
    sampleVenue1: 'The Strand',
    sampleVenue2: 'Castle Hill',
    sampleVenue3: 'Jezzine Barracks',
    needsCreate: true,  // Collection doesn't exist yet
  },
]

// Fetch Adelaide template once
async function fetchTemplate() {
  const r = await gql(`{ collectionByHandle(handle:"gender-reveal-ideas-adelaide") { descriptionHtml } }`)
  return r.data?.collectionByHandle?.descriptionHtml
}

function buildHtmlFor(target, adelaideHtml) {
  // Sequential substitutions — order matters
  let h = adelaideHtml

  // Replace Adelaide-specific delivery references
  h = h.replace(/2 to 3 business days/g, target.deliveryDays)
  h = h.replace(/2 to 3 days/g, target.deliveryDays)

  // Replace Adelaide-specific venue section text (the venue mention paragraph)
  h = h.replace(
    /Adelaide's mild spring and autumn are ideal for outdoor reveals\. Popular gender reveal locations in Adelaide include the Adelaide Botanic Garden, Glenelg Beach, or the Adelaide Hills\./g,
    `${target.climate}. Popular gender reveal locations in ${target.city} include ${target.sampleVenue1}, ${target.sampleVenue2}, or ${target.sampleVenue3}.`
  )

  // Replace state mentions
  h = h.replace(/South Australia/g, target.stateFull)

  // Replace city mentions LAST (so we don't accidentally substring-replace city in venue names)
  h = h.replace(/Adelaide/g, target.city)

  return h
}

console.log(`\n=== ${ROLLBACK?'ROLLBACK':DRY_RUN?'DRY RUN':'SHIP'} — Amplify thin city pages ===\n`)

const adelaideHtml = await fetchTemplate()
if (!adelaideHtml) { console.error('Failed to fetch Adelaide template'); process.exit(1) }
console.log(`Adelaide template loaded: ${adelaideHtml.length} chars\n`)

const LOG_PATH = `${SNAPSHOT_DIR}/ship-log.json`

if (ROLLBACK) {
  if (!existsSync(LOG_PATH)) { console.log('No ship log to rollback'); process.exit(0) }
  const log = JSON.parse(readFileSync(LOG_PATH,'utf8'))
  for (const change of log.changes || []) {
    if (!change.collectionId || !change.previousHtml) continue
    const u = await gql(`mutation($id:ID!,$desc:String!){collectionUpdate(input:{id:$id,descriptionHtml:$desc}){userErrors{message}}}`, { id: change.collectionId, desc: change.previousHtml })
    console.log(`  Rollback ${change.handle}: ${u.data?.collectionUpdate?.userErrors?.length?'ERR':'OK'}`)
  }
  process.exit(0)
}

const log = { startedAt: new Date().toISOString(), changes: [] }

for (const target of TARGETS) {
  console.log(`\n--- ${target.handle} ---`)

  // Get current state
  let r = await gql(`{ collectionByHandle(handle:"${target.handle}") { id descriptionHtml } }`)
  let existing = r.data?.collectionByHandle

  if (!existing && !target.needsCreate) {
    console.log(`  ❌ Not found and needsCreate not set, skipping`)
    continue
  }

  // Build new HTML
  const newHtml = buildHtmlFor(target, adelaideHtml)
  console.log(`  Old descHtml: ${existing?.descriptionHtml?.length || 0} chars`)
  console.log(`  New descHtml: ${newHtml.length} chars`)
  console.log(`  Sample (${target.city} mentions): ${(newHtml.match(new RegExp(target.city, 'g'))||[]).length}`)

  if (DRY_RUN) {
    console.log(`  DRY RUN — would update`)
    continue
  }

  if (!existing && target.needsCreate) {
    // Create new collection
    const cr = await gql(`mutation($input:CollectionInput!){collectionCreate(input:$input){collection{id handle} userErrors{field message}}}`, {
      input: {
        title: `Gender Reveal Ideas ${target.city}`,
        handle: target.handle,
        descriptionHtml: newHtml,
        seo: { title: `Gender Reveal Ideas ${target.city} | ${target.city}'s #1 Range | 4.85★ Reviews`, description: `${target.city}'s biggest range of gender reveal ideas with ${target.deliveryDays} delivery. Cannons, smoke bombs, powder blasters and sports reveals. 4.85★ from 1360+ reviews. Eco friendly. Free shipping.` },
        ruleSet: {
          appliedDisjunctively: false,
          rules: [{ column: 'TAG', relation: 'EQUALS', condition: 'gender-reveal' }],
        },
      },
    })
    const created = cr.data?.collectionCreate?.collection
    const errs = cr.data?.collectionCreate?.userErrors || []
    if (errs.length) {
      console.log(`  ✗ CREATE FAILED: ${JSON.stringify(errs)}`)
      log.changes.push({ handle: target.handle, action:'create', error: errs })
    } else {
      console.log(`  ✓ CREATED: ${created.handle} (${created.id})`)
      log.changes.push({ handle: target.handle, action:'create', collectionId: created.id })
    }
  } else {
    // Update existing
    const previousHtml = existing.descriptionHtml
    const u = await gql(`mutation($id:ID!,$desc:String!){collectionUpdate(input:{id:$id,descriptionHtml:$desc}){userErrors{field message}}}`, { id: existing.id, desc: newHtml })
    const errs = u.data?.collectionUpdate?.userErrors || []
    if (errs.length) {
      console.log(`  ✗ UPDATE FAILED: ${JSON.stringify(errs)}`)
      log.changes.push({ handle: target.handle, action:'update', error: errs })
    } else {
      console.log(`  ✓ UPDATED (${previousHtml.length} → ${newHtml.length} chars)`)
      log.changes.push({ handle: target.handle, action:'update', collectionId: existing.id, previousHtml, newLen: newHtml.length, prevLen: previousHtml.length })
    }
  }
  await new Promise(r => setTimeout(r, 600))
}

log.completedAt = new Date().toISOString()
writeFileSync(LOG_PATH, JSON.stringify(log, null, 2))
console.log(`\n✓ DONE — Log: ${LOG_PATH}`)
console.log(`Rollback: node scripts/amplify-thin-cities.js --rollback`)
process.exit(0)
