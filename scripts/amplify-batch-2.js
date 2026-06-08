/**
 * BATCH 2 AMPLIFICATION
 * Newcastle, Hobart, Sunshine Coast, Cairns, Geelong, VIC state
 * Same Adelaide template pattern proven today.
 */
import 'dotenv/config'
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs'

const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const URL = 'https://bdd19a-3.myshopify.com/admin/api/2026-01/graphql.json'
const SNAPSHOT_DIR = 'data/snapshots/amplify-batch-2'
mkdirSync(SNAPSHOT_DIR, { recursive: true })

const ROLLBACK = process.argv.includes('--rollback')
const DRY_RUN = !process.argv.includes('--ship') && !ROLLBACK

async function gql(q, v) {
  const r = await fetch(URL, { method:'POST', headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json'}, body: JSON.stringify({query:q,variables:v}) })
  return r.json()
}

const TARGETS = [
  {
    handle: 'gender-reveal-ideas-newcastle', city: 'Newcastle', stateFull: 'New South Wales', deliveryDays: '1 to 2 days',
    climate: "Newcastle's mild coastal climate makes spring and autumn ideal for outdoor reveals. Beach reveals work year-round with warm sea breezes",
    sampleVenue1: 'Bar Beach', sampleVenue2: 'Civic Park', sampleVenue3: 'Merewether Beach',
  },
  {
    handle: 'gender-reveal-ideas-hobart', city: 'Hobart', stateFull: 'Tasmania', deliveryDays: '2 to 3 days',
    climate: "Hobart's cool temperate climate makes summer and early autumn ideal for outdoor reveals. The crisp clear air gives stunning photography all year",
    sampleVenue1: 'Salamanca Place', sampleVenue2: 'Sandy Bay Beach', sampleVenue3: 'Mount Wellington',
  },
  {
    handle: 'gender-reveal-ideas-sunshine-coast', city: 'Sunshine Coast', stateFull: 'Queensland', deliveryDays: '1 to 2 days',
    climate: "The Sunshine Coast's subtropical climate gives you year-round outdoor reveal weather. Winter clear-sky days are spectacular for photography",
    sampleVenue1: 'Mooloolaba Beach', sampleVenue2: 'Maroochydore Beach', sampleVenue3: 'Noosa National Park',
  },
  {
    handle: 'gender-reveal-ideas-cairns', city: 'Cairns', stateFull: 'Queensland', deliveryDays: '2 to 3 days',
    climate: "Cairns has year-round warm tropical weather ideal for outdoor reveals. Dry season (May-Oct) gives you clear sunny days for stunning reveal photography",
    sampleVenue1: 'The Esplanade', sampleVenue2: 'Cairns Botanic Gardens', sampleVenue3: 'Palm Cove Beach',
  },
  {
    handle: 'gender-reveal-ideas-geelong', city: 'Geelong', stateFull: 'Victoria', deliveryDays: '1 to 2 days',
    climate: "Geelong's temperate coastal climate makes spring and autumn ideal for outdoor reveals. The bayside gives you stunning waterfront photography options",
    sampleVenue1: 'Eastern Beach', sampleVenue2: 'Johnstone Park', sampleVenue3: 'Barwon Heads',
  },
  {
    handle: 'gender-reveals-victoria', city: 'Victoria', stateFull: 'Victoria', deliveryDays: '1 to 2 days',
    climate: "Victoria's varied climate from Melbourne to regional areas means spring and autumn give the best chance of sunshine for outdoor reveals — always pack a backup indoor plan",
    sampleVenue1: 'Royal Botanic Gardens', sampleVenue2: 'Princes Park', sampleVenue3: 'Brighton Beach',
  },
]

async function fetchTemplate() {
  const r = await gql(`{ collectionByHandle(handle:"gender-reveal-ideas-adelaide") { descriptionHtml } }`)
  return r.data?.collectionByHandle?.descriptionHtml
}

function buildHtmlFor(target, adelaideHtml) {
  let h = adelaideHtml
  h = h.replace(/2 to 3 business days/g, target.deliveryDays)
  h = h.replace(/2 to 3 days/g, target.deliveryDays)
  h = h.replace(
    /Adelaide's mild spring and autumn are ideal for outdoor reveals\. Popular gender reveal locations in Adelaide include the Adelaide Botanic Garden, Glenelg Beach, or the Adelaide Hills\./g,
    `${target.climate}. Popular gender reveal locations in ${target.city} include ${target.sampleVenue1}, ${target.sampleVenue2}, or ${target.sampleVenue3}.`
  )
  h = h.replace(/South Australia/g, target.stateFull)
  h = h.replace(/Adelaide/g, target.city)
  return h
}

const LOG_PATH = `${SNAPSHOT_DIR}/ship-log.json`

if (ROLLBACK) {
  if (!existsSync(LOG_PATH)) { console.log('No log to rollback'); process.exit(0) }
  const log = JSON.parse(readFileSync(LOG_PATH,'utf8'))
  for (const ch of log.changes||[]) {
    if (!ch.collectionId || !ch.previousHtml) continue
    const u = await gql(`mutation($id:ID!,$desc:String!){collectionUpdate(input:{id:$id,descriptionHtml:$desc}){userErrors{message}}}`, { id: ch.collectionId, desc: ch.previousHtml })
    console.log(`  Rollback ${ch.handle}: ${u.data?.collectionUpdate?.userErrors?.length?'ERR':'OK'}`)
  }
  process.exit(0)
}

console.log(`\n=== ${DRY_RUN?'DRY RUN':'SHIPPING'} — Batch 2 location amplification ===\n`)
const adelaideHtml = await fetchTemplate()
console.log(`Adelaide template: ${adelaideHtml.length}c\n`)

const log = { startedAt: new Date().toISOString(), changes: [] }
for (const target of TARGETS) {
  console.log(`--- ${target.handle} ---`)
  const r = await gql(`{ collectionByHandle(handle:"${target.handle}") { id descriptionHtml } }`)
  const existing = r.data?.collectionByHandle
  if (!existing) { console.log(`  ❌ Not found, skip`); continue }
  const newHtml = buildHtmlFor(target, adelaideHtml)
  console.log(`  ${existing.descriptionHtml?.length||0}c → ${newHtml.length}c (${target.city} mentions: ${(newHtml.match(new RegExp(target.city,'g'))||[]).length})`)
  if (DRY_RUN) continue
  const u = await gql(`mutation($id:ID!,$desc:String!){collectionUpdate(input:{id:$id,descriptionHtml:$desc}){userErrors{field message}}}`, { id: existing.id, desc: newHtml })
  const errs = u.data?.collectionUpdate?.userErrors||[]
  if (errs.length) {
    console.log(`  ✗ FAIL: ${JSON.stringify(errs)}`)
    log.changes.push({ handle: target.handle, action:'update', error: errs })
  } else {
    console.log(`  ✓ UPDATED`)
    log.changes.push({ handle: target.handle, action:'update', collectionId: existing.id, previousHtml: existing.descriptionHtml, newLen: newHtml.length })
  }
  await new Promise(r=>setTimeout(r,500))
}
if (!DRY_RUN) {
  log.completedAt = new Date().toISOString()
  writeFileSync(LOG_PATH, JSON.stringify(log,null,2))
  console.log(`\n✓ Log: ${LOG_PATH}`)
  console.log(`Rollback: node scripts/amplify-batch-2.js --rollback`)
}
process.exit(0)
