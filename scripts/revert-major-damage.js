/**
 * Revert SEO title + description + productType on the 12 confirmed major-damage products.
 * Authorisation: Josh, 2026-04-27, "only revert the ones that need reverting with major damage"
 */
import 'dotenv/config'
import { readFileSync, writeFileSync } from 'fs'

const SHOPIFY_URL = 'https://bdd19a-3.myshopify.com/admin/api/2026-01/graphql.json'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN
if (!TOKEN) { console.error('SHOPIFY_ADMIN_ACCESS_TOKEN env var required'); process.exit(1) }

async function gql(query) {
  const res = await fetch(SHOPIFY_URL, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query })
  })
  return await res.json()
}

const targets = JSON.parse(readFileSync('./data/snapshots/major-damage-products.json', 'utf8'))

console.log(`=== REVERTING ${targets.length} MAJOR DAMAGE PRODUCTS ===\n`)

const log = []
let updated = 0, errors = 0

for (const p of targets) {
  const mutation = `
    mutation {
      productUpdate(input: {
        id: "${p.id}"
        productType: ""
        seo: {
          title: ""
          description: ""
        }
      }) {
        product { id title productType seo { title description } }
        userErrors { field message }
      }
    }
  `
  try {
    const res = await gql(mutation)
    const ue = res.data?.productUpdate?.userErrors || []
    if (ue.length > 0) {
      console.log(`  ✗ ${p.title.substring(0, 50)} — ${ue[0].message}`)
      errors++
      log.push({ id: p.id, title: p.title, status: 'ERROR', error: ue[0].message })
    } else {
      const ret = res.data?.productUpdate?.product
      console.log(`  ✓ ${p.title.substring(0, 50).padEnd(51)} | SEO cleared, productType cleared`)
      updated++
      log.push({
        id: p.id,
        title: p.title,
        status: 'OK',
        before: { seoTitle: p.currentSeoTitle, productType: p.currentProductType },
        after: { seoTitle: ret?.seo?.title || '(empty → defaults to title)', productType: ret?.productType || '' }
      })
    }
  } catch (err) {
    console.log(`  ✗ ${p.title.substring(0, 50)} — ${err.message}`)
    errors++
    log.push({ id: p.id, title: p.title, status: 'EXCEPTION', error: err.message })
  }
  await new Promise(r => setTimeout(r, 350))
}

writeFileSync('./data/snapshots/revert-log-2026-04-27.json', JSON.stringify(log, null, 2))

console.log(`\n=== COMPLETE ===`)
console.log(`Reverted: ${updated}`)
console.log(`Errors:   ${errors}`)
console.log(`Log:      data/snapshots/revert-log-2026-04-27.json`)
console.log(`\nMerchant Centre re-crawls in 24-48 hours. Recovery signal in 5-7 days.`)
process.exit(0)
