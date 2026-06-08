/**
 * SEO TITLES BATCH 1 — 5 test products
 * Updates seo.title + seo.description only. NO product title, NO URL changes.
 * Snapshot saved before mutation. Rollback: --rollback
 */
import 'dotenv/config'
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs'

const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const URL = 'https://bdd19a-3.myshopify.com/admin/api/2026-01/graphql.json'
const SNAPSHOT_DIR = 'data/snapshots/seo-titles-batch1'
mkdirSync(SNAPSHOT_DIR, { recursive: true })
const LOG_PATH = `${SNAPSHOT_DIR}/log.json`

async function gql(q, v) {
  const r = await fetch(URL, { method:'POST', headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json'}, body: JSON.stringify({query:q,variables:v}) })
  return r.json()
}

const ROLLBACK = process.argv.includes('--rollback')

const TARGETS = [
  {
    handle: 'gender-reveal-powder-cannons',
    title: 'Gender Reveal Cannon & Extinguisher Bundle | $135 | Australia',
    description: 'The ultimate gender reveal combo — cannon plus extinguisher in one bundle. Pink, blue or secret. Australia-wide shipping. 4.85★ from 1,360+ reviews.',
  },
  {
    handle: 'gender-reveal-powder-extinguisher',
    title: 'Gender Reveal Powder Extinguisher Bundle | $150 Pink Blue',
    description: 'Pink and blue powder extinguisher bundle for the ultimate gender reveal moment. Eco-friendly cornstarch powder. Australia-wide express delivery.',
  },
  {
    handle: 'inflatable-baby-costume-gender-reveal',
    title: 'Inflatable Baby Costume Gender Reveal | Dad Reveal Australia',
    description: 'The viral dad inflatable baby costume gender reveal. Comfortable, photogenic, custom-made. Australia-wide delivery. Top-rated by 70,000+ families.',
  },
  {
    handle: 'gender-reveal-ideas-near-me',
    title: '2 Pack Gender Reveal Confetti & Powder Cannon Bundle | $65',
    description: 'Two-pack XL gender reveal cannon bundle — both confetti and powder for double the impact. $65 AUD. Same-day dispatch from Gold Coast, Australia.',
  },
  {
    handle: 'gender-reveal-cannons-bundle-australia',
    title: '4 Pack Gender Reveal Cannon Bundle | $90 | Pink, Blue, Mix',
    description: 'Four-pack XL gender reveal cannon bundle. Pink, blue, mixed or secret colour. Save vs single-buy. $90 AUD. Australia-wide express delivery.',
  },
]

console.log(`\n=== ${ROLLBACK?'ROLLBACK':'SHIP'} — SEO Titles Batch 1 (5 products) ===\n`)

if (ROLLBACK) {
  if (!existsSync(LOG_PATH)) { console.error('No log to rollback'); process.exit(1) }
  const log = JSON.parse(readFileSync(LOG_PATH,'utf8'))
  for (const before of log.snapshots || []) {
    const u = await gql(`mutation($input: ProductInput!) { productUpdate(input: $input) { product { id seo { title description } } userErrors { field message } } }`, {
      input: {
        id: before.id,
        seo: {
          title: before.seoTitleBefore || '',
          description: before.seoDescBefore || '',
        },
      },
    })
    const errs = u.data?.productUpdate?.userErrors || []
    if (errs.length) console.log(`  ✗ ${before.handle}: ${JSON.stringify(errs)}`)
    else console.log(`  ✓ ${before.handle}: restored`)
  }
  console.log('\n✓ Rollback complete')
  process.exit(0)
}

const log = { shippedAt: new Date().toISOString(), snapshots: [], updates: [] }

for (const t of TARGETS) {
  console.log(`\n--- ${t.handle} ---`)
  const r = await gql(`{ productByHandle(handle:"${t.handle}") { id title seo { title description } } }`)
  const p = r.data?.productByHandle
  if (!p) { console.log(`  ❌ NOT FOUND`); continue }
  console.log(`  Product: ${p.title}`)
  console.log(`  Before: title="${p.seo?.title||'NULL'}" desc="${p.seo?.description?.slice(0,50)||'NULL'}..."`)

  // Snapshot
  log.snapshots.push({
    handle: t.handle,
    id: p.id,
    productTitle: p.title,
    seoTitleBefore: p.seo?.title || null,
    seoDescBefore: p.seo?.description || null,
  })

  // Update
  const u = await gql(`mutation($input: ProductInput!) { productUpdate(input: $input) { product { id seo { title description } } userErrors { field message } } }`, {
    input: {
      id: p.id,
      seo: { title: t.title, description: t.description },
    },
  })
  const errs = u.data?.productUpdate?.userErrors || []
  if (errs.length) {
    console.log(`  ✗ FAILED: ${JSON.stringify(errs)}`)
    log.updates.push({ handle: t.handle, error: errs })
  } else {
    const updated = u.data?.productUpdate?.product?.seo
    console.log(`  ✓ Updated`)
    console.log(`    NEW title (${updated?.title?.length}c): ${updated?.title}`)
    console.log(`    NEW desc  (${updated?.description?.length}c): ${updated?.description}`)
    log.updates.push({ handle: t.handle, ok: true, newTitle: t.title, newDesc: t.description })
  }
  await new Promise(r => setTimeout(r, 600))
}

log.completedAt = new Date().toISOString()
writeFileSync(LOG_PATH, JSON.stringify(log, null, 2))
console.log(`\n✓ DONE — Updated ${log.updates.filter(u=>u.ok).length}/${TARGETS.length} products`)
console.log(`Snapshot: ${LOG_PATH}`)
console.log(`Rollback: node scripts/seo-titles-batch1.js --rollback`)
console.log(`\nNext: wait 7 days, re-check ranks + Shopping CTR`)
process.exit(0)
