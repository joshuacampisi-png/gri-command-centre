/**
 * Find all products with prices in titles + identify the source
 * (Shopify title vs Google Shopping feed override metafield)
 */
import 'dotenv/config'
const SHOP = process.env.SHOPIFY_STORE_DOMAIN || 'bdd19a-3.myshopify.com'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const URL = `https://${SHOP}/admin/api/2026-01/graphql.json`

async function gql(query, variables = {}) {
  const r = await fetch(URL, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  return r.json()
}

// Scan ALL products via paginated GraphQL
const QUERY = `query($cursor: String) {
  products(first: 100, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    edges { node {
      id
      handle
      title
      productType
      vendor
      seo { title description }
      metafields(first: 30) {
        edges { node { namespace key value } }
      }
      variants(first: 10) {
        edges { node { id title price sku } }
      }
    }}
  }
}`

let all = [], cursor = null, hasNext = true
while (hasNext) {
  const r = await gql(QUERY, { cursor })
  if (r.errors) { console.error('GQL err:', JSON.stringify(r.errors)); break }
  all.push(...(r.data?.products?.edges?.map(e => e.node) || []))
  hasNext = r.data?.products?.pageInfo?.hasNextPage
  cursor = r.data?.products?.pageInfo?.endCursor
  process.stdout.write(`  fetched ${all.length}...\r`)
}
console.log(`\nTotal products: ${all.length}`)

// Detect price in title (Shopify product title, SEO title, or Google Shopping override metafield)
const priceRe = /\$\d{1,4}/
const flagged = []
for (const p of all) {
  const reasons = []
  if (priceRe.test(p.title)) reasons.push({ where: 'product.title', value: p.title })
  if (p.seo?.title && priceRe.test(p.seo.title)) reasons.push({ where: 'product.seo.title', value: p.seo.title })
  for (const mf of (p.metafields?.edges?.map(e=>e.node)||[])) {
    if (!mf?.value) continue
    if (priceRe.test(mf.value) && /title|name/i.test(mf.key||'')) {
      reasons.push({ where: `metafield ${mf.namespace}.${mf.key}`, value: mf.value })
    }
    // Google Shopping feed app uses metafields like google.title, custom_google_title, etc.
    if (/google|merchant|shopping|feed/i.test(mf.namespace||'') && priceRe.test(mf.value)) {
      reasons.push({ where: `feed metafield ${mf.namespace}.${mf.key}`, value: mf.value })
    }
  }
  if (reasons.length) flagged.push({ handle: p.handle, id: p.id, title: p.title, productType: p.productType, reasons, variants: p.variants?.edges?.map(v => v.node) })
}

console.log(`\nProducts with price ($X) somewhere in title/feed title/SEO: ${flagged.length}\n`)
for (const f of flagged) {
  console.log(`/${f.handle}  (${f.productType||'no type'})`)
  for (const r of f.reasons) {
    console.log(`   ${r.where}:  ${r.value.slice(0,110)}`)
  }
  // Show actual variant prices for sanity
  const prices = f.variants?.map(v => parseFloat(v.price)).filter(p => p > 0) || []
  if (prices.length) console.log(`   actual variant prices: $${Math.min(...prices)}–$${Math.max(...prices)}`)
  console.log('')
}

// Filter to specifically extinguisher bundles per Josh's ask
console.log('\n━━━ POWDER EXTINGUISHER BUNDLES — specific cohort ━━━\n')
const extBundles = all.filter(p => /extinguisher.*bundle|bundle.*extinguisher/i.test(p.title) || /extinguisher.*bundle/i.test(p.handle))
for (const p of extBundles) {
  const hasPrice = priceRe.test(p.title)
  const flag = hasPrice ? '⚠ PRICE IN TITLE' : '✓ clean'
  console.log(`${flag}  /${p.handle}`)
  console.log(`   title: ${p.title}`)
}

import { writeFileSync, mkdirSync } from 'fs'
mkdirSync('data/snapshots/title-audit', { recursive: true })
writeFileSync('data/snapshots/title-audit/audit.json', JSON.stringify({ flagged, extBundles }, null, 2))
console.log(`\nFull data: data/snapshots/title-audit/audit.json`)
process.exit(0)
