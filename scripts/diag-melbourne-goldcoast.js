/**
 * Diagnose WHY Melbourne dropped #5→#8 and Gold Coast #1→#3
 *  1. Pull live SERP top 10 for both queries with competitor classification
 *  2. Audit our collection page state (descriptionHtml length, metafields, last updated, schema)
 *  3. Compare to top-ranking competitor content depth
 *  4. Identify the deficit
 */
import 'dotenv/config'
const SHOP = process.env.SHOPIFY_STORE_DOMAIN || 'bdd19a-3.myshopify.com'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const DFSE = 'Basic ' + Buffer.from(`${process.env.DATAFORSEO_EMAIL}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64')

const QUERIES = [
  { kw: 'gender reveal melbourne', handle: 'gender-reveal-ideas-melbourne' },
  { kw: 'gender reveal gold coast', handle: 'gender-reveal-ideas-gold-coast' },
]

async function gql(query, variables = {}) {
  const r = await fetch(`https://${SHOP}/admin/api/2026-01/graphql.json`, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  return r.json()
}

async function scrapeSERP(kw) {
  const r = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/regular', {
    method:'POST', headers:{Authorization:DFSE,'Content-Type':'application/json'},
    body: JSON.stringify([{keyword:kw, location_code:2036, language_code:'en', device:'desktop', depth:15}])
  }).then(r=>r.json())
  return r.tasks?.[0]?.result?.[0]?.items?.filter(it => it.type==='organic') || []
}

async function fetchPageHTML(url) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
    return await r.text()
  } catch { return '' }
}

console.log(`\n=== DIAGNOSIS: Melbourne + Gold Coast slip ===\n`)

for (const Q of QUERIES) {
  console.log(`\n${'='.repeat(80)}`)
  console.log(`🔎 QUERY: "${Q.kw}"`)
  console.log(`${'='.repeat(80)}`)

  // SERP — top 10
  const items = await scrapeSERP(Q.kw)
  console.log(`\n--- Top 10 SERP ---`)
  console.log('#  | Domain                         | Title')
  console.log('-'.repeat(110))
  let ourRank = null
  for (let i = 0; i < Math.min(10, items.length); i++) {
    const it = items[i]
    const isUs = /genderrevealideas\.com\.au/i.test(it.domain||it.url||'')
    if (isUs) ourRank = it.rank_absolute
    const flag = isUs ? '👈 US ' : '       '
    console.log(`${String(it.rank_absolute).padStart(2)} ${flag} | ${(it.domain||'').slice(0,30).padEnd(30)} | ${(it.title||'').slice(0,60)}`)
  }
  console.log(`\nYour position: #${ourRank || 'NOT IN TOP 10'}`)

  // Our collection page state
  console.log(`\n--- Our Shopify collection state ---`)
  const colQ = `{ collectionByHandle(handle: "${Q.handle}") {
    id title handle descriptionHtml updatedAt
    titleTag: metafield(namespace:"global",key:"title_tag"){value}
    descTag: metafield(namespace:"global",key:"description_tag"){value}
    locText: metafield(namespace:"custom",key:"looking_to_buy_location_text"){value}
    customSchema: metafield(namespace:"custom",key:"custom_schema"){value}
    productsCount
  }}`
  const r = await gql(colQ)
  const col = r.data?.collectionByHandle
  if (!col) {
    console.log(`  ✗ Collection not found at handle ${Q.handle}`)
    continue
  }
  console.log(`  ID:            ${col.id}`)
  console.log(`  Title:         ${col.title}`)
  console.log(`  Updated at:    ${col.updatedAt}`)
  console.log(`  Products:      ${col.productsCount}`)
  console.log(`  Description HTML length: ${(col.descriptionHtml||'').length} chars`)
  console.log(`  Title tag:     ${col.titleTag?.value?.slice(0,80) || '(missing)'}`)
  console.log(`  Meta desc:     ${col.descTag?.value?.slice(0,120) || '(missing)'}`)
  console.log(`  Loc text:      ${col.locText?.value ? (col.locText.value.length + ' chars') : '(MISSING)'}`)
  console.log(`  Custom schema: ${col.customSchema?.value ? (col.customSchema.value.length + ' chars') : '(MISSING)'}`)

  // Fetch live rendered page
  const liveURL = `https://genderrevealideas.com.au/collections/${Q.handle}`
  const html = await fetchPageHTML(liveURL)
  console.log(`\n--- Live rendered page audit (${liveURL}) ---`)
  if (html) {
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i)
    const metaDescMatch = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i)
    const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
    const wordCount = html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').split(/\s+/).filter(w => w.length>2).length
    const hasReviewBlock = html.includes('seo-review-aggregate')
    const hasSchema = (html.match(/<script type=["']application\/ld\+json["']/g) || []).length
    const hasFAQ = /FAQPage/.test(html)
    const hasAggregateRating = /AggregateRating/.test(html)
    const hasLocalBusiness = /LocalBusiness/.test(html)

    console.log(`  Page <title>:        ${titleMatch?.[1]?.slice(0,80) || '(missing)'}`)
    console.log(`  Meta description:    ${metaDescMatch?.[1]?.slice(0,120) || '(missing)'}`)
    console.log(`  <h1>:                ${h1Match?.[1]?.replace(/<[^>]+>/g,'').trim().slice(0,80) || '(missing)'}`)
    console.log(`  Word count:          ${wordCount}`)
    console.log(`  Review block:        ${hasReviewBlock ? '✓' : '✗ MISSING'}`)
    console.log(`  JSON-LD schemas:     ${hasSchema}`)
    console.log(`  FAQPage schema:      ${hasFAQ ? '✓' : '✗ MISSING'}`)
    console.log(`  AggregateRating:     ${hasAggregateRating ? '✓' : '✗ MISSING'}`)
    console.log(`  LocalBusiness:       ${hasLocalBusiness ? '✓' : '✗ MISSING'}`)
  } else {
    console.log(`  ✗ Could not fetch live page`)
  }

  // Compare to #1 competitor depth
  if (items[0] && !/genderrevealideas/.test(items[0].domain||'')) {
    const top1url = items[0].url
    const top1html = await fetchPageHTML(top1url)
    if (top1html) {
      const top1Words = top1html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').split(/\s+/).filter(w => w.length>2).length
      const top1Schemas = (top1html.match(/<script type=["']application\/ld\+json["']/g) || []).length
      console.log(`\n--- #1 ranked competitor (${items[0].domain}) ---`)
      console.log(`  URL:           ${top1url}`)
      console.log(`  Word count:    ${top1Words}`)
      console.log(`  JSON-LD count: ${top1Schemas}`)
      console.log(`  Title:         ${items[0].title?.slice(0,80)}`)
    }
  }
}

process.exit(0)
