/**
 * Create Shopify discount code FREESHIP99
 * - Free shipping
 * - Min $99 AUD order
 * - Code-only redemption (no automatic)
 * - All customers, all countries
 * - 90-day window matching GMC promo
 */
import 'dotenv/config'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const URL = 'https://bdd19a-3.myshopify.com/admin/api/2026-01/graphql.json'
async function gql(q,v){const r=await fetch(URL,{method:'POST',headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query:q,variables:v})});return r.json()}

const STARTS = '2026-05-19T00:00:00+10:00'  // AEST
const ENDS = '2026-08-17T23:59:59+10:00'    // AEST

console.log(`\n=== Creating Shopify discount: FREESHIP99 ===\n`)

const mutation = `
mutation createFreeShipDiscount($input: DiscountCodeFreeShippingInput!) {
  discountCodeFreeShippingCreate(freeShippingCodeDiscount: $input) {
    codeDiscountNode {
      id
      codeDiscount {
        ... on DiscountCodeFreeShipping {
          title
          status
          startsAt
          endsAt
          codes(first: 5) { edges { node { code } } }
          minimumRequirement {
            ... on DiscountMinimumSubtotal { greaterThanOrEqualToSubtotal { amount currencyCode } }
          }
        }
      }
    }
    userErrors { field message code }
  }
}`

const input = {
  title: 'FREESHIP99 - Free Shipping over $99',
  code: 'FREESHIP99',
  startsAt: STARTS,
  endsAt: ENDS,
  minimumRequirement: {
    subtotal: { greaterThanOrEqualToSubtotal: '99.00' },
  },
  destination: { all: true },
  customerSelection: { all: true },
  appliesOncePerCustomer: false,
}

const r = await gql(mutation, { input })
if (r.errors) {
  console.error('GQL errors:', JSON.stringify(r.errors, null, 2))
  process.exit(1)
}
const result = r.data?.discountCodeFreeShippingCreate
const errs = result?.userErrors || []
if (errs.length) {
  console.error('USER ERRORS:', JSON.stringify(errs, null, 2))
  process.exit(1)
}
const node = result?.codeDiscountNode
console.log('✓ DISCOUNT CREATED:')
console.log(JSON.stringify(node, null, 2))
console.log(`\nCode: FREESHIP99`)
console.log(`Min order: $99 AUD`)
console.log(`Active: 2026-05-19 → 2026-08-17 (90 days)`)
console.log(`\nCustomer redemption flow:`)
console.log(`  1. Customer sees Shopping ad with "Free shipping with promo code FREESHIP99"`)
console.log(`  2. Clicks → lands on product page`)
console.log(`  3. Adds product(s) to cart`)
console.log(`  4. At checkout, enters code FREESHIP99 in discount field`)
console.log(`  5. If cart >= $99 AUD → free shipping applied`)
console.log(`\nTracking: every order with this code redeemed will show in Shopify Admin → Discounts → FREESHIP99`)
process.exit(0)
