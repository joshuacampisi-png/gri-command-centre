/**
 * SEO AREAS PUBLISH — Publishes the 10 new collections to Online Store + Shop + Google.
 * Run: node scripts/seo-areas-publish.js
 */
import 'dotenv/config'
import { readFileSync } from 'fs'

const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN || process.env.SHOPIFY_TOKEN
const URL = 'https://bdd19a-3.myshopify.com/admin/api/2026-01/graphql.json'

async function gql(q, v = {}) {
  const r = await fetch(URL, { method: 'POST', headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q, variables: v }) })
  return r.json()
}

const snap = JSON.parse(readFileSync('data/snapshots/seo-areas/snapshot-2026-05-15.json', 'utf8'))

// Get publication IDs
const pubsR = await gql(`{ publications(first: 20) { edges { node { id name } } } }`)
const pubs = pubsR.data?.publications?.edges?.map(e => e.node) || []
console.log(`\nPublications found:`)
pubs.forEach(p => console.log(`  ${p.id} - ${p.name}`))

const onlineStore = pubs.find(p => p.name === 'Online Store')
if (!onlineStore) {
  console.log('\n✗ Online Store publication not found. Token may lack read_publications scope.')
  process.exit(1)
}

const targetPubs = pubs.filter(p => ['Online Store', 'Shop', 'Google & YouTube'].includes(p.name))
console.log(`\nWill publish to: ${targetPubs.map(p => p.name).join(', ')}\n`)

for (const c of snap.created) {
  console.log(`→ ${c.handle}`)
  const r = await gql(`mutation publishablePublish($id: ID!, $input: [PublicationInput!]!) {
    publishablePublish(id: $id, input: $input) {
      userErrors { field message }
    }
  }`, { id: c.id, input: targetPubs.map(p => ({ publicationId: p.id })) })
  const errs = r.data?.publishablePublish?.userErrors || []
  console.log(`  ${errs.length ? '✗ ' + JSON.stringify(errs).slice(0, 200) : '✓ published to ' + targetPubs.length + ' channels'}`)
  await new Promise(r => setTimeout(r, 400))
}
console.log('\n✓ Publish step complete.')
process.exit(0)
