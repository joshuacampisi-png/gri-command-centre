/**
 * LOCATION CROSS-LINK HUB — Adds "Other locations we serve" footer block
 * with links to all 23 other location pages on each of 24 location collections.
 * Creates a closed-loop authority hub that distributes link equity.
 *
 * Idempotent — checks for marker before injecting.
 */
import 'dotenv/config'

const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN || process.env.SHOPIFY_TOKEN
const URL = 'https://bdd19a-3.myshopify.com/admin/api/2026-01/graphql.json'

async function gql(q, v = {}) {
  const r = await fetch(URL, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q, variables: v }),
  })
  return r.json()
}

const MARKER = 'location-cross-link-hub'

const LOCATIONS = [
  // 12 cities (May 14)
  { handle: 'gender-reveal-ideas-brisbane', label: 'Brisbane', state: 'QLD' },
  { handle: 'gender-reveal-ideas-sydney', label: 'Sydney', state: 'NSW' },
  { handle: 'gender-reveal-ideas-melbourne', label: 'Melbourne', state: 'VIC' },
  { handle: 'gender-reveal-ideas-perth', label: 'Perth', state: 'WA' },
  { handle: 'gender-reveal-ideas-adelaide', label: 'Adelaide', state: 'SA' },
  { handle: 'gender-reveal-ideas-gold-coast', label: 'Gold Coast', state: 'QLD' },
  { handle: 'gender-reveal-ideas-darwin', label: 'Darwin', state: 'NT' },
  { handle: 'gender-reveal-ideas-newcastle', label: 'Newcastle', state: 'NSW' },
  { handle: 'gender-reveal-ideas-canberra', label: 'Canberra', state: 'ACT' },
  { handle: 'gender-reveal-ideas-sunshine-coast', label: 'Sunshine Coast', state: 'QLD' },
  { handle: 'gender-reveal-ideas-wollongong', label: 'Wollongong', state: 'NSW' },
  { handle: 'gender-reveal-ideas-hobart', label: 'Hobart', state: 'TAS' },
  // 8 states (May 15)
  { handle: 'gender-reveal-ideas-nsw', label: 'New South Wales', state: 'NSW' },
  { handle: 'gender-reveal-ideas-victoria', label: 'Victoria', state: 'VIC' },
  { handle: 'gender-reveal-ideas-queensland', label: 'Queensland', state: 'QLD' },
  { handle: 'gender-reveal-ideas-wa', label: 'Western Australia', state: 'WA' },
  { handle: 'gender-reveal-ideas-sa', label: 'South Australia', state: 'SA' },
  { handle: 'gender-reveal-ideas-tasmania', label: 'Tasmania', state: 'TAS' },
  { handle: 'gender-reveal-ideas-act', label: 'ACT', state: 'ACT' },
  { handle: 'gender-reveal-ideas-nt', label: 'Northern Territory', state: 'NT' },
  // 4 regional (May 15)
  { handle: 'gender-reveal-ideas-central-coast', label: 'Central Coast', state: 'NSW' },
  { handle: 'gender-reveal-ideas-geelong', label: 'Geelong', state: 'VIC' },
  { handle: 'gender-reveal-ideas-cairns', label: 'Cairns', state: 'QLD' },
  { handle: 'gender-reveal-ideas-launceston', label: 'Launceston', state: 'TAS' },
]

function buildHubBlock(currentHandle) {
  const others = LOCATIONS.filter(l => l.handle !== currentHandle)
  // Group by state for nicer readability + better topical clustering signal
  const byState = {}
  for (const l of others) {
    byState[l.state] = byState[l.state] || []
    byState[l.state].push(l)
  }
  const stateOrder = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT']
  const links = stateOrder.flatMap(s => (byState[s] || []).map(l =>
    `<a href="/collections/${l.handle}" style="color:#c33;text-decoration:none;">${l.label}</a>`
  )).join(' · ')

  return `\n<div class="${MARKER}" style="margin-top:40px;padding:24px 20px;background:#fafafa;border-top:2px solid #ffd6e2;border-radius:8px;">
  <h3 style="margin:0 0 12px 0;font-size:18px;color:#333;">We deliver gender reveal supplies Australia-wide</h3>
  <p style="margin:0 0 14px 0;font-size:14px;color:#555;line-height:1.6;">Looking for gender reveal cannons, smoke bombs, powder blasters or sports reveals in another part of Australia? We ship Australia-wide with fast express delivery from the Gold Coast.</p>
  <p style="margin:0;font-size:14px;line-height:1.8;color:#555;"><strong>Shop by location:</strong><br>${links}</p>
</div>`
}

console.log(`\n========== LOCATION CROSS-LINK HUB — ${new Date().toISOString().slice(0,19)} ==========\n`)
let updated = 0, skipped = 0, errored = 0

for (const loc of LOCATIONS) {
  // 1. Find the collection
  const r = await gql(`{ collectionByHandle(handle: "${loc.handle}") { id descriptionHtml } }`)
  const col = r.data?.collectionByHandle
  if (!col) {
    console.log(`  ✗ ${loc.handle} — not found`)
    errored++
    continue
  }

  // 2. Idempotent — skip if hub already there
  if (col.descriptionHtml?.includes(MARKER)) {
    console.log(`  ✓ ${loc.handle} — already has hub, skipping`)
    skipped++
    continue
  }

  // 3. Append hub block
  const newHtml = (col.descriptionHtml || '') + buildHubBlock(loc.handle)
  const u = await gql(`mutation collectionUpdate($input: CollectionInput!) {
    collectionUpdate(input: $input) { userErrors { message } }
  }`, { input: { id: col.id, descriptionHtml: newHtml } })

  const errs = u.data?.collectionUpdate?.userErrors || []
  if (errs.length) {
    console.log(`  ✗ ${loc.handle} — ${JSON.stringify(errs).slice(0,150)}`)
    errored++
  } else {
    console.log(`  ✓ ${loc.handle} — hub added (23 outbound links)`)
    updated++
  }
  await new Promise(r => setTimeout(r, 400))
}

console.log(`\n========== SUMMARY ==========`)
console.log(`Updated: ${updated}`)
console.log(`Skipped: ${skipped}`)
console.log(`Errored: ${errored}`)
console.log(`Total internal links created: ${updated * 23}`)
process.exit(0)
