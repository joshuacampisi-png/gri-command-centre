/**
 * Brand fix: replace em-dashes in SEO titles with pipes (per brand rules: no dashes)
 */
import 'dotenv/config'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const GQL = 'https://bdd19a-3.myshopify.com/admin/api/2026-01/graphql.json'

const FIXES = {
  468151861337: { title: 'Gender Reveal Ideas Newcastle | #1 Range, Fast NSW Delivery' },
  468151959641: { title: 'Gender Reveal Ideas Wollongong | #1 Range, Fast Illawarra Delivery' },
  468151894105: { title: 'Gender Reveal Ideas Canberra | #1 Range, Fast ACT Delivery' },
  468165656665: { title: "Gender Reveal Ideas ACT | Australia's #1 Range Delivered Fast" },
  282307985497: { title: 'Gender Reveal Ideas Melbourne | #1 Range, Same Day VIC Dispatch' },
  468151926873: { title: "Gender Reveal Ideas Sunshine Coast | #1 Range, Fast QLD Delivery" },
}

const mutation = `mutation($input: CollectionInput!) {
  collectionUpdate(input: $input) {
    collection { handle seo { title } }
    userErrors { field message }
  }
}`

for (const [id, f] of Object.entries(FIXES)) {
  const r = await fetch(GQL, {
    method:'POST', headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json'},
    body: JSON.stringify({ query: mutation, variables: { input: { id:`gid://shopify/Collection/${id}`, seo:{ title: f.title } } } })
  }).then(r=>r.json())
  const c = r.data?.collectionUpdate?.collection
  const err = r.data?.collectionUpdate?.userErrors
  if (err?.length) console.log(`✗ ${c?.handle || id}: ${JSON.stringify(err)}`)
  else console.log(`✓ ${c?.handle.padEnd(40)} → "${c?.seo?.title}"`)
}
process.exit(0)
